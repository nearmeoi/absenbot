const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const {
    SESSION_DIR,
    TEMP_DIR,
    CHROMIUM_PATH,
    PUPPETEER_ARGS,
    PUPPETEER_HEADLESS,
    CURRENT_ENV,
    API_ENDPOINTS
} = require("../config/constants");
const apiService = require("./apiService");

// Queue to ensure only ONE browser instance opens at a time
class BrowserQueue {
    constructor() {
        this.chain = Promise.resolve();
        this.pending = 0;
    }

    async add(task, taskName) {
        this.pending++;
        console.log(chalk.yellow(`[QUEUE] Added task: ${taskName}. Pending: ${this.pending}`));

        const next = this.chain
            .then(() => {
                console.log(chalk.cyan(`[QUEUE] Starting task: ${taskName}`));
                return task();
            })
            .catch(err => {
                console.error(chalk.red(`[QUEUE] Task failed: ${taskName}`), err.message);
                throw err;
            })
            .finally(() => {
                this.pending--;
                console.log(chalk.green(`[QUEUE] Finished task: ${taskName}. Remaining: ${this.pending}`));
            });

        this.chain = next.catch(() => { });
        return next;
    }
}
const queue = new BrowserQueue();

// Setup folders
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function launchBrowser() {
    const commonArgs = [
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        "--disable-dev-shm-usage", // Fix for containerized envs
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
    ];

    // Production (Linux) Optimization
    if (process.platform === 'linux') {
        commonArgs.push(
            "--single-process", // Save memory on VPS
            "--no-zygote",      // Save memory
            "--renderer-process-limit=1",
            "--js-flags=--max-old-space-size=512" // Limit heap to 512MB (safer than 128MB)
        );
    }

    const allArgs = [...new Set([...PUPPETEER_ARGS, ...commonArgs])];

    return await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        executablePath: CHROMIUM_PATH,
        args: allArgs,
        // Additional memory-saving options
        dumpio: false,
        pipe: true
    });
}

async function puppeteerLogin(email, password, takeScreenshot = true) {
    return queue.add(async () => {
        return await _puppeteerLoginCore(email, password, takeScreenshot);
    }, `Login-${email}`);
}

async function _puppeteerLoginCore(email, password, takeScreenshot) {
    let browser = null;
    let page = null;
    let cookies = [];
    let csrfToken = null;
    let screenshotPath = null;

    try {
        browser = await launchBrowser();
        page = await browser.newPage();
        page.setDefaultTimeout(60000);

        await page.setUserAgent(USER_AGENT);

        // Block permissions and resources for speed
        const context = browser.defaultBrowserContext();
        await context.overridePermissions("https://account.kemnaker.go.id", []);
        await context.overridePermissions("https://siapkerja.kemnaker.go.id", []);
        await context.overridePermissions("https://monev.maganghub.kemnaker.go.id", []);

        await page.setRequestInterception(true);
        page.on("request", req => {
            const type = req.resourceType();
            // Block everything except document, script, xhr, fetch
            if (["image", "media", "font", "stylesheet", "manifest", "prefetch", "websocket", "eventsource", "texttrack", "other"].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Minimal viewport to save memory
        await page.setViewport({ width: 800, height: 600 });

        // Login process
        // Retry logic for navigation failure (Frame Detached fix - kept for stability)
        let navSuccess = false;
        for (let i = 0; i < 3; i++) {
            try {
                await page.goto(API_ENDPOINTS.LOGIN_URL, {
                    waitUntil: i === 0 ? "networkidle2" : "domcontentloaded",
                    timeout: 60000
                });
                navSuccess = true;
                break;
            } catch (e) {
                if (i === 2) throw e;
                await new Promise(r => setTimeout(r, 2000));
            }
        }


        const needsLogin = page.url().includes("account.kemnaker.go.id") || page.url().includes("auth/login");


        if (needsLogin) {
            // Robust selector for username/identity
            const identitySelectors = [
                '#username',             // Priority 1: ID
                '#identity',
                'input[name="username"]', // Priority 3: Name
                'input[name="identity"]',
                'input[type="email"]',
                'input[placeholder*="email"]'
            ];
            let identityInput = null;

            // Wait for any of the selectors to appear
            for (const selector of identitySelectors) {
                try {
                    // Increased timeout to 30s for slow connections
                    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
                    identityInput = selector;
                    break;
                } catch (e) { /* try next */ }
            }

            if (!identityInput) {
                // Match browser agent findings: #username or #identity
                const debugPath = require('path').join(__dirname, '../../public/img/debug');
                if (!require('fs').existsSync(debugPath)) require('fs').mkdirSync(debugPath, { recursive: true });

                try {
                    await page.screenshot({ path: require('path').join(debugPath, `login_fail_${Date.now()}.png`) });
                } catch (err) {
                    console.error("[PUPPETEER] Failed to capture screenshot (Session closed?):", err.message);
                }
                throw new Error(`Could not find login input. URL: ${page.url()}`);
            }

            await new Promise(r => setTimeout(r, 3000)); // Wait for page stability

            // Direct form fill (no retries)
            await page.evaluate((sel, user, pass) => {
                const userEl = document.querySelector(sel);
                const passEl = document.querySelector('#password') || document.querySelector('input[type="password"]');
                if (userEl) { userEl.focus(); userEl.value = user; userEl.dispatchEvent(new Event('input', { bubbles: true })); }
                if (passEl) { passEl.focus(); passEl.value = pass; passEl.dispatchEvent(new Event('input', { bubbles: true })); }
            }, identityInput, email, password);

            await new Promise(r => setTimeout(r, 1000));

            // Submit with robust error handling for frame detachment
            try {
                const submitted = await page.evaluate(() => {
                    const btn = document.querySelector('button[type="submit"]') || document.querySelector('button.btn-primary');
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (!submitted) {
                    await page.keyboard.press('Enter');
                }
            } catch (e) {
                if (!e.message.includes('detached') && !e.message.includes('Session closed')) {
                    throw e;
                }
            }

            await new Promise(r => setTimeout(r, 1500));
        }

        // DIRECT NAVIGATION to Monev (bypass SSO redirect chain)
        console.log(chalk.yellow(`[BROWSER] Direct navigation to Monev dashboard...`));
        await new Promise(r => setTimeout(r, 5000)); // Wait for login to process

        try {
            await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
        } catch (e) {
            console.log(chalk.yellow(`[BROWSER] Navigation timeout (continuing anyway)...`));
        }

        await new Promise(r => setTimeout(r, 3000));

        // Check if we're logged in
        const currentUrl = page.url();
        const loggedInToSiapkerja = currentUrl.includes('monev.maganghub') || currentUrl.includes('dashboard');

        if (!loggedInToSiapkerja) {
            // Check for login error
            const errorText = await page.evaluate(() => {
                const el = document.querySelector('.alert-error, .error-message, div[role="alert"]');
                return el ? el.innerText : null;
            }).catch(() => null);

            if (errorText) {
                throw new Error(`Login Gagal: ${errorText}`);
            }
            throw new Error(`Login Timeout - stuck at: ${currentUrl}`);
        }

        console.log(chalk.green(`[BROWSER] ✅ Login successful! URL: ${currentUrl}`));

        await new Promise(r => setTimeout(r, 2000)); // Wait for cookies to settle

        // Get cookies
        await new Promise(r => setTimeout(r, 200));
        let siapkerjaCookies = await page.cookies();

        // Navigate to monev dashboard
        try {
            await page.goto(API_ENDPOINTS.DASHBOARD, { waitUntil: "networkidle0", timeout: 30000 });
        } catch (e) {
            // Continue even if navigation fails
        }

        // Wait for page to fully load and session to establish
        await new Promise(r => setTimeout(r, 2000));

        // Trigger an API call in-browser to ensure session is activated
        // This helps the server establish the session properly
        try {
            await page.evaluate(async () => {
                await fetch('/api/daily-logs', {
                    method: 'GET',
                    headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
                }).catch(() => { });
            });
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) { }

        // Extract all cookies from all relevant domains
        const [currentCookies, monevCookies, siapkerjaDomainCookies, accountCookies] = await Promise.all([
            page.cookies(),
            page.cookies("https://monev.maganghub.kemnaker.go.id"),
            page.cookies("https://siapkerja.kemnaker.go.id"),
            page.cookies("https://account.kemnaker.go.id")
        ]);

        const cookieMap = new Map();
        [...siapkerjaCookies, ...currentCookies, ...monevCookies, ...siapkerjaDomainCookies, ...accountCookies]
            .forEach(c => cookieMap.set(`${c.name}@${c.domain}`, c));
        cookies = Array.from(cookieMap.values());

        console.log(chalk.cyan(`[BROWSER] ✅ Got ${cookies.length} cookies from all domains`));

        // Get CSRF Token and Access Token from localStorage
        let accessToken = null;
        try {
            const tokens = await page.evaluate(() => {
                const csrf = document.querySelector('meta[name="csrf-token"]');
                return {
                    csrf: csrf ? csrf.getAttribute('content') : null,
                    accessToken: localStorage.getItem('token') ||
                        localStorage.getItem('access_token') ||
                        localStorage.getItem('accessToken') ||
                        sessionStorage.getItem('token') ||
                        sessionStorage.getItem('access_token'),
                    // Also check for token in cookies
                    cookieToken: document.cookie.match(/accessToken=([^;]+)/)?.[1] || null
                };
            });
            csrfToken = tokens.csrf;
            accessToken = tokens.accessToken || tokens.cookieToken;

            if (accessToken) {
                console.log(chalk.green(`[BROWSER] ✅ Found accessToken!`));
            }
        } catch (e) { }

        // Save session with token
        if (cookies.length > 0) {
            apiService.saveSession(email, cookies, csrfToken, accessToken);
        }

        // Screenshot if requested
        if (takeScreenshot) {
            try {
                screenshotPath = path.join(TEMP_DIR, `login_${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath });
            } catch (e) {
                screenshotPath = null;
            }
        }

        await browser.close();
        browser = null;

        return { success: true, foto: screenshotPath };

    } catch (error) {
        console.log(chalk.red(`[DEBUG] ❌ LOGIN ERROR: ${error.message}`));
        console.log(chalk.red(`[DEBUG] Stack: ${error.stack}`));
        if (cookies.length > 0) {
            try { apiService.saveSession(email, cookies, csrfToken); } catch (e) { }
        }
        if (browser) await browser.close();
        return { success: false, pesan: error.message };
    }
}

async function puppeteerSubmit(email, password, reportData) {
    return queue.add(async () => {
        return await _puppeteerSubmitCore(email, password, reportData);
    }, `Submit-${email}`);
}

async function _puppeteerSubmitCore(email, password, reportData) {
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultTimeout(90000);
        await page.setUserAgent(USER_AGENT);

        await page.setRequestInterception(true);
        page.on("request", req => {
            const type = req.resourceType();
            // Only block heavy media. ALLOW fonts/css/scripts
            if (["image", "media", "websocket", "eventsource", "texttrack"].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Minimal viewport to save memory
        await page.setViewport({ width: 800, height: 600 });

        await page.goto(API_ENDPOINTS.LOGIN_URL, { waitUntil: "domcontentloaded" });

        const isLoggedIn = () => page.url().includes("dashboard") || page.url().includes("monev");

        if (!isLoggedIn()) {
            // Robust selector for username/identity
            const identitySelectors = ['input[name="identity"]', 'input[name="username"]', 'input[name="email"]', 'input[type="email"]'];
            let identityInput = null;

            for (const selector of identitySelectors) {
                try {
                    await page.waitForSelector(selector, { visible: true, timeout: 5000 });
                    identityInput = selector;
                    break;
                } catch (e) { /* try next */ }
            }

            if (!identityInput) {
                throw new Error("Could not find login input field (identity/username/email) for submission");
            }

            await page.type(identityInput, email, { delay: 20 });
            await page.type('input[type="password"]', password, { delay: 20 });
            await page.click('button[type="submit"]');

            await page.waitForFunction(
                () => location.href.includes("monev") || location.href.includes("dashboard"),
                { timeout: 60000 }
            );
        }

        const cookies = await page.cookies();
        apiService.saveSession(email, cookies);

        if (!page.url().includes("dashboard")) {
            await page.goto(API_ENDPOINTS.DASHBOARD, { waitUntil: "domcontentloaded" });
        }

        const day = new Date().getDate();
        try {
            await page.waitForSelector("td.clickable-day, div.day, div.v-calendar-daily__day", { timeout: 20000 });
            await page.evaluate((d) => {
                const days = Array.from(document.querySelectorAll('div.day-content, span.day-label, div.v-btn__content, td'));
                for (let el of days) {
                    if (el.textContent.trim() == d) {
                        el.click();
                        return true;
                    }
                }
                return false;
            }, day.toString());
        } catch (e) {
            // Continue even if calendar click fails
        }

        await page.waitForSelector("textarea", { visible: true, timeout: 30000 });

        const textareas = await page.$$("textarea");
        if (textareas.length >= 3) {
            await textareas[0].type(reportData.aktivitas);
            await textareas[1].type(reportData.pembelajaran);
            await textareas[2].type(reportData.kendala);
        } else {
            throw new Error("Form tidak ditemukan (textarea < 3)");
        }

        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) await checkbox.click();

        const btnSimpan = await page.$x("//button[contains(., 'Simpan') or contains(., 'Kirim')]");
        if (btnSimpan.length > 0) {
            await btnSimpan[0].click();
            await new Promise(r => setTimeout(r, 5000));

            let screenshotPath = null;
            try {
                screenshotPath = path.join(TEMP_DIR, `bukti_${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath });
            } catch (e) {
                screenshotPath = null;
            }

            await browser.close();
            return {
                success: true,
                nama: email,
                foto: screenshotPath,
                pesan_tambahan: "(Via Browser)"
            };
        }

        throw new Error("Tombol simpan tidak ditemukan");

    } catch (error) {
        if (browser) await browser.close();
        return { success: false, pesan: error.message };
    }
}

async function cekKredensial(email, password) {
    apiService.clearSession(email);
    return await puppeteerLogin(email, password, true);
}

async function cekStatusHarian(email, password) {
    // --- DEBUG MODE: BYPASS LOGIN, ASSUME NOT ABSENT ---
    console.log(chalk.yellow(`[DEBUG] Cek status harian bypass untuk: ${email}`));
    return { success: true, sudahAbsen: false, data: null };
}

async function prosesLoginDanAbsen(dataUser) {
    // --- DEBUG MODE: MOCK SUBMIT ---
    const { email, password, aktivitas, pembelajaran, kendala } = dataUser;

    console.log(chalk.magenta.bold("\n[DEBUG SUBMIT] Data Siap Kirim (Mock):"));
    console.log(chalk.magenta(`Email: ${email}`));
    console.log(chalk.cyan(`Aktivitas: "${aktivitas}"`));
    console.log(chalk.cyan(`Pembelajaran: "${pembelajaran}"`));
    console.log(chalk.cyan(`Kendala: "${kendala}"`));
    console.log(chalk.magenta("-------------------------------------------\n"));

    return {
        success: true,
        nama: email,
        foto: null,
        pesan_tambahan: "(DEBUG MODE - DATA TIDAK DIKIRIM)"
    };
}

async function getRiwayat(email, password, days = 1) {
    // --- DEBUG MODE: MOCK HISTORY ---
    console.log(chalk.yellow(`[DEBUG] Get riwayat bypass untuk: ${email}`));
    return { success: true, logs: [], data: [] };
}

module.exports = {
    prosesLoginDanAbsen,
    cekKredensial,
    cekStatusHarian,
    getRiwayat
};