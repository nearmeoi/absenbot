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
        "--safebrowsing-disable-auto-update"
    ];

    const allArgs = [...new Set([...PUPPETEER_ARGS, ...commonArgs])];

    return await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        executablePath: CHROMIUM_PATH,
        args: allArgs
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
        await page.goto(API_ENDPOINTS.LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

        const needsLogin = page.url().includes("account.kemnaker.go.id") || page.url().includes("auth/login");

        if (needsLogin) {
            await page.waitForSelector('input[name="username"]', { visible: true, timeout: 10000 });
            await new Promise(r => setTimeout(r, 200));

            await page.$eval('input[name="username"]', el => el.value = '');
            await page.$eval('input[type="password"]', el => el.value = '');
            await page.type('input[name="username"]', email, { delay: 10 });
            await page.type('input[type="password"]', password, { delay: 10 });

            await new Promise(r => setTimeout(r, 150));

            const btn = await page.$('button[type="submit"]');
            if (btn) await page.evaluate(el => el.click(), btn);
            else await page.keyboard.press('Enter');

            await new Promise(r => setTimeout(r, 1500));
        }

        // Wait for redirect or error
        const maxWaitTime = 30000;
        const checkInterval = 500;
        const startTime = Date.now();
        let loggedInToSiapkerja = false;
        let loginError = null;

        while (Date.now() - startTime < maxWaitTime) {
            const currentUrl = page.url();

            // 1. Success Checks
            if ((currentUrl.includes("siapkerja.kemnaker.go.id") && currentUrl.includes("/app/")) ||
                (currentUrl.includes("monev.maganghub") && currentUrl.includes("dashboard"))) {
                loggedInToSiapkerja = true;
                break;
            }

            // 2. Error Checks (Fast Fail)
            try {
                // Check for common error indicators on the page
                const errorFound = await page.evaluate(() => {
                    // Look for alert boxes or error text
                    const alerts = document.querySelectorAll('.alert-error, .error-message, .validation-error');
                    for (const alert of alerts) {
                        return alert.innerText;
                    }

                    // Specific text checks
                    const bodyText = document.body.innerText;
                    if (bodyText.includes("Kombinasi email dan password tidak sesuai") ||
                        bodyText.includes("Credentials do not match") ||
                        bodyText.includes("No. HP / Email / NIK atau password tidak benar") ||
                        bodyText.includes("tidak ditemukan")) {
                        return "Email atau password salah. Silakan periksa kembali.";
                    }
                    return null;
                });

                if (errorFound) {
                    loginError = errorFound;
                    break;
                }
            } catch (e) {
                // Ignore evaluation errors during navigation
            }

            await new Promise(r => setTimeout(r, checkInterval));
        }

        if (loginError) {
            console.log(chalk.red(`[BROWSER] Login Failed: ${loginError}`));
            if (browser) await browser.close();
            return { success: false, pesan: loginError };
        }

        if (!loggedInToSiapkerja) {
            throw new Error(`Timeout - stuck at: ${page.url()}`);
        }

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
            // Block everything except document, script, xhr, fetch
            if (["image", "media", "font", "stylesheet", "manifest", "prefetch", "websocket", "eventsource", "texttrack", "other"].includes(type)) {
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
            await page.waitForSelector('input[name="username"]', { visible: true, timeout: 30000 });
            await page.type('input[name="username"]', email, { delay: 20 });
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
    const apiResult = await apiService.checkAttendanceStatus(email);

    if (apiResult.success) {
        return apiResult;
    }

    if (apiResult.needsLogin) {
        const loginResult = await puppeteerLogin(email, password, false);
        if (!loginResult.success) {
            return { success: false, pesan: loginResult.pesan };
        }

        await new Promise(r => setTimeout(r, 1000));

        const retryResult = await apiService.checkAttendanceStatus(email);
        if (retryResult.success) {
            return retryResult;
        }
    }

    return { success: false, sudahAbsen: false, pesan: apiResult.pesan || "Unknown error" };
}

async function prosesLoginDanAbsen(dataUser) {
    const { email, password, aktivitas, pembelajaran, kendala } = dataUser;

    const apiResult = await apiService.submitAttendanceReport(email, {
        aktivitas, pembelajaran, kendala
    });

    if (apiResult.success) {
        return {
            success: true,
            nama: email,
            foto: null,
            pesan_tambahan: "(Fast Mode - API)"
        };
    }

    return await puppeteerSubmit(email, password, { aktivitas, pembelajaran, kendala });
}

module.exports = {
    prosesLoginDanAbsen,
    cekKredensial,
    cekStatusHarian
};