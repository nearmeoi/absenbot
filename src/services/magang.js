/**
 * Magang Service - Hybrid Puppeteer + Axios Implementation
 * 
 * Strategy:
 * - First try: Use Axios (fast, if session exists)
 * - Fallback: Use Puppeteer (for login or when Axios fails)
 * - After Puppeteer login: Save cookies for future Axios use
 */

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

// --- SETUP FOLDER ---
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Launch Puppeteer browser with environment-optimized settings
 */
async function launchBrowser() {
    console.log(chalk.cyan(`[BROWSER] Environment: ${CURRENT_ENV}`));
    console.log(chalk.cyan(`[BROWSER] Launching with path: ${CHROMIUM_PATH}`));

    if (!fs.existsSync(CHROMIUM_PATH)) {
        console.warn(chalk.yellow(`[WARNING] Chromium not found at ${CHROMIUM_PATH}`));
    }

    // Combine environment-specific args with common optimization args
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

    // Merge and dedupe args
    const allArgs = [...new Set([...PUPPETEER_ARGS, ...commonArgs])];

    console.log(chalk.gray(`[BROWSER] Using ${allArgs.length} browser args`));

    return await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        executablePath: CHROMIUM_PATH,
        args: allArgs
    });
}

/**
 * Perform login via Puppeteer and save session cookies
 * @returns {Object} { success, foto, pesan }
 */
async function puppeteerLogin(email, password, takeScreenshot = true) {
    console.log(chalk.magenta(`[BROWSER] 🚀 Fast Login for ${email}`));

    let browser = null;
    let page = null;
    let cookies = [];
    let csrfToken = null;
    let screenshotPath = null;

    try {
        browser = await launchBrowser();
        page = await browser.newPage();
        page.setDefaultTimeout(60000); // Reduced timeout

        await page.setUserAgent(USER_AGENT);

        // Block ALL unnecessary resources for maximum speed
        await page.setRequestInterception(true);
        page.on("request", req => {
            const type = req.resourceType();
            // Block images, media, fonts, and stylesheets for speed
            if (["image", "media", "font", "stylesheet"].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // ========== STEP 1: Login via account.kemnaker.go.id ==========
        console.log(chalk.cyan(`[BROWSER] Opening login page...`));
        // Use networkidle2 for faster load (allows 2 network connections)
        await page.goto(API_ENDPOINTS.LOGIN_URL, { waitUntil: "networkidle2", timeout: 25000 });

        // Check if need to fill login form
        const needsLogin = page.url().includes("account.kemnaker.go.id") || page.url().includes("auth/login");

        if (needsLogin) {
            // Wait for username field with shorter timeout
            await page.waitForSelector('input[name="username"]', { visible: true, timeout: 10000 });

            // Minimal delay to ensure form is interactive
            await new Promise(r => setTimeout(r, 200));

            console.log(chalk.cyan("[BROWSER] Filling login form..."));

            // Clear existing values first
            await page.$eval('input[name="username"]', el => el.value = '');
            await page.$eval('input[type="password"]', el => el.value = '');

            // Type credentials (fast typing)
            await page.type('input[name="username"]', email, { delay: 10 });
            await page.type('input[type="password"]', password, { delay: 10 });

            // Minimal delay before submit
            await new Promise(r => setTimeout(r, 150));

            // Try multiple ways to click the login button
            console.log(chalk.cyan("[BROWSER] Clicking login button..."));

            let clicked = false;

            // Method 1: Try various button selectors with JavaScript click
            const buttonSelectors = [
                'button[type="submit"]',
                'button.btn-primary',
                'button.btn-login',
                'input[type="submit"]',
                'button:contains("Login")',
                'button:contains("Masuk")',
                '.btn-submit',
                'form button'
            ];

            for (const selector of buttonSelectors) {
                try {
                    const btn = await page.$(selector);
                    if (btn) {
                        // Use JavaScript click instead of Puppeteer click
                        await page.evaluate(el => el.click(), btn);
                        console.log(chalk.green(`[BROWSER] Clicked button via: ${selector}`));
                        clicked = true;
                        break;
                    }
                } catch (e) {
                    // Try next selector
                }
            }

            // Method 2: If no button found, try clicking by evaluating all buttons
            if (!clicked) {
                try {
                    await page.evaluate(() => {
                        // Find and click any submit button or button with login text
                        const buttons = document.querySelectorAll('button, input[type="submit"]');
                        for (const btn of buttons) {
                            const text = btn.textContent.toLowerCase();
                            if (text.includes('login') || text.includes('masuk') ||
                                text.includes('sign in') || btn.type === 'submit') {
                                btn.click();
                                return true;
                            }
                        }
                        return false;
                    });
                    console.log(chalk.green("[BROWSER] Clicked button via text search"));
                    clicked = true;
                } catch (e) {
                    console.log(chalk.yellow("[BROWSER] Text search click failed"));
                }
            }

            // Method 3: Fallback to Enter key
            if (!clicked) {
                console.log(chalk.yellow("[BROWSER] Trying Enter key as fallback..."));
                await page.keyboard.press('Enter');
            }

            // Wait for navigation to start (reduced from 3s)
            await new Promise(r => setTimeout(r, 1500));
        }

        // ========== STEP 2: Wait for redirect to siapkerja ==========
        console.log(chalk.cyan("[BROWSER] Waiting for siapkerja redirect..."));

        const maxWaitTime = 35000; // Reduced to 35 seconds
        const checkInterval = 400; // Faster check every 400ms
        const startTime = Date.now();
        let loggedInToSiapkerja = false;
        let lastLoggedUrl = "";

        while (Date.now() - startTime < maxWaitTime) {
            const currentUrl = page.url();

            // Log URL change for debugging
            if (currentUrl !== lastLoggedUrl) {
                console.log(chalk.gray(`[BROWSER] Current URL: ${currentUrl.substring(0, 60)}...`));
                lastLoggedUrl = currentUrl;
            }

            // Check if we're at siapkerja /app/
            if (currentUrl.includes("siapkerja.kemnaker.go.id") && currentUrl.includes("/app/")) {
                console.log(chalk.green("[BROWSER] ✅ Arrived at siapkerja!"));
                loggedInToSiapkerja = true;
                break;
            }

            // Quick error checks
            if (currentUrl.includes("error") || currentUrl.includes("failed")) {
                throw new Error("Login failed - error page");
            }

            // Only check for wrong password if still on login page after 15 seconds
            // AND there's an actual error message on the page
            if (currentUrl.includes("auth/login") && Date.now() - startTime > 15000) {
                const hasError = await page.evaluate(() => {
                    // Check for common error indicators
                    const errorSelectors = [
                        '.alert-danger', '.error-message', '.text-danger',
                        '[class*="error"]', '[class*="invalid"]',
                        '.v-alert--type-error', '.notification-error'
                    ];
                    for (const sel of errorSelectors) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent.trim().length > 0) return el.textContent.trim();
                    }
                    // Also check for error text in the page body
                    const bodyText = document.body.innerText.toLowerCase();
                    if (bodyText.includes('password salah') || bodyText.includes('wrong password') ||
                        bodyText.includes('kredensial') || bodyText.includes('incorrect')) {
                        return 'Password atau email salah';
                    }
                    return null;
                });

                if (hasError) {
                    console.log(chalk.red(`[BROWSER] Error detected on page: ${hasError}`));
                    throw new Error(`Login failed - ${hasError}`);
                } else {
                    console.log(chalk.yellow(`[BROWSER] Still on login page after 15s, waiting...`));
                }
            }

            await new Promise(r => setTimeout(r, checkInterval));
        }

        if (!loggedInToSiapkerja) {
            // Take debug screenshot before throwing error
            try {
                const debugPath = path.join(TEMP_DIR, `debug_timeout_${Date.now()}.png`);
                await page.screenshot({ path: debugPath });
                console.log(chalk.yellow(`[BROWSER] Debug screenshot saved: ${debugPath}`));
            } catch (e) { }
            throw new Error(`Timeout - stuck at: ${page.url()}`);
        }

        // ========== STEP 3: Quick cookie grab from siapkerja ==========
        await new Promise(r => setTimeout(r, 200)); // Minimal stabilization
        let siapkerjaCookies = await page.cookies();
        console.log(chalk.gray(`[BROWSER] Got ${siapkerjaCookies.length} cookies from siapkerja`));

        // ========== STEP 4: Navigate to monev dashboard ==========
        console.log(chalk.cyan("[BROWSER] Navigating to monev dashboard..."));

        try {
            // Use networkidle2 for balanced speed and stability
            await page.goto(API_ENDPOINTS.DASHBOARD, { waitUntil: "networkidle2", timeout: 20000 });

            // Quick wait for dashboard URL or SSO callback
            const dashboardWaitStart = Date.now();
            while (Date.now() - dashboardWaitStart < 10000) {
                const url = page.url();
                if (url.includes("monev.maganghub") && url.includes("dashboard")) {
                    break;
                }
                await new Promise(r => setTimeout(r, 300));
            }
        } catch (navError) {
            console.log(chalk.yellow(`[BROWSER] Nav timeout, continuing...`));
        }

        // Small stabilization wait (reduced)
        await new Promise(r => setTimeout(r, 400));

        const finalUrl = page.url();
        const atDashboard = finalUrl.includes("monev.maganghub") &&
            (finalUrl.includes("dashboard") || !finalUrl.includes("login"));

        if (atDashboard) {
            console.log(chalk.green("[BROWSER] ✅ At monev dashboard!"));
        } else {
            console.log(chalk.yellow(`[BROWSER] ⚠️ URL: ${finalUrl}`));
        }

        // ========== STEP 5: Fast cookie extraction ==========
        console.log(chalk.cyan("[BROWSER] Extracting cookies..."));

        try {
            // Get all cookies in parallel
            const [currentCookies, monevCookies, siapkerjaDomainCookies] = await Promise.all([
                page.cookies(),
                page.cookies("https://monev.maganghub.kemnaker.go.id"),
                page.cookies("https://siapkerja.kemnaker.go.id")
            ]);

            // Merge all cookies
            const cookieMap = new Map();
            [...siapkerjaCookies, ...currentCookies, ...monevCookies, ...siapkerjaDomainCookies]
                .forEach(c => cookieMap.set(`${c.name}@${c.domain}`, c));
            cookies = Array.from(cookieMap.values());

            console.log(chalk.cyan(`[BROWSER] ✅ Got ${cookies.length} cookies`));
        } catch (cookieError) {
            console.error(chalk.red("[BROWSER] Cookie error:"), cookieError.message);
        }

        // ========== CSRF TOKEN (quick) ==========
        try {
            csrfToken = await page.evaluate(() => {
                const meta = document.querySelector('meta[name="csrf-token"]');
                return meta ? meta.getAttribute('content') : null;
            });
        } catch (e) { }

        // ========== SAVE SESSION ==========
        if (cookies.length > 0) {
            apiService.saveSession(email, cookies, csrfToken);
        }

        // ========== SCREENSHOT (only if requested) ==========
        if (takeScreenshot) {
            try {
                screenshotPath = path.join(TEMP_DIR, `login_${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath });
            } catch (e) {
                screenshotPath = null;
            }
        }

        // ========== CLOSE BROWSER ==========
        console.log(chalk.gray("[BROWSER] Closing browser..."));
        await browser.close();
        browser = null;

        return { success: true, foto: screenshotPath };

    } catch (error) {
        console.error(chalk.red("[BROWSER] Login Error:"), error.message);

        // Try to save any cookies we got before the error
        if (cookies.length > 0) {
            console.log(chalk.yellow(`[BROWSER] Saving ${cookies.length} cookies despite error...`));
            try {
                apiService.saveSession(email, cookies, csrfToken);
            } catch (e) {
                // Ignore save error
            }
        }

        // Close browser if still open
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                // Ignore close error
            }
        }

        return { success: false, pesan: error.message };
    }
}

/**
 * Submit report via Puppeteer (fallback when API fails)
 */
async function puppeteerSubmit(email, password, reportData) {
    console.log(chalk.magenta(`[BROWSER] 📝 Submitting report for ${email}`));

    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultTimeout(90000);
        await page.setUserAgent(USER_AGENT);

        // Block resources
        await page.setRequestInterception(true);
        page.on("request", req => {
            if (["image", "media", "font"].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        // Login first
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

        // Save session
        const cookies = await page.cookies();
        apiService.saveSession(email, cookies);

        // Navigate to dashboard if needed
        if (!page.url().includes("dashboard")) {
            await page.goto(API_ENDPOINTS.DASHBOARD, { waitUntil: "domcontentloaded" });
        }

        // Click on today's date in calendar
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
            console.log(chalk.yellow("[BROWSER] Calendar click might have failed"));
        }

        // Wait for form
        await page.waitForSelector("textarea", { visible: true, timeout: 30000 });

        // Fill textareas
        const textareas = await page.$$("textarea");
        if (textareas.length >= 3) {
            await textareas[0].type(reportData.aktivitas);
            await textareas[1].type(reportData.pembelajaran);
            await textareas[2].type(reportData.kendala);
        } else {
            throw new Error("Form tidak ditemukan (textarea < 3)");
        }

        // Click checkbox if exists
        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) await checkbox.click();

        // Click save button
        const btnSimpan = await page.$x("//button[contains(., 'Simpan') or contains(., 'Kirim')]");
        if (btnSimpan.length > 0) {
            await btnSimpan[0].click();
            await new Promise(r => setTimeout(r, 5000)); // Wait for save

            // Take screenshot with error handling
            let screenshotPath = null;
            try {
                screenshotPath = path.join(TEMP_DIR, `bukti_${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath });
            } catch (screenshotError) {
                console.log(chalk.yellow(`[BROWSER] Screenshot skipped: ${screenshotError.message}`));
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
        console.error(chalk.red("[BROWSER] Submit Error:"), error.message);
        return { success: false, pesan: error.message };
    }
}

// =====================================================
// EXPORTED HYBRID FUNCTIONS
// =====================================================

/**
 * Check credentials (login test)
 * Uses Puppeteer since we need to verify actual login
 */
async function cekKredensial(email, password) {
    // Clear old session first
    apiService.clearSession(email);
    return await puppeteerLogin(email, password, true);
}

/**
 * Check daily attendance status
 * HYBRID: Try Axios first, fallback to Puppeteer
 */
async function cekStatusHarian(email, password) {
    console.log(chalk.blue(`[HYBRID] Checking status for ${email}`));

    // Try Axios first (fast)
    const apiResult = await apiService.checkAttendanceStatus(email);

    if (apiResult.success) {
        console.log(chalk.green("[HYBRID] ✅ Used fast Axios check"));
        return apiResult;
    }

    // If Axios failed due to session issue, try Puppeteer
    if (apiResult.needsLogin) {
        console.log(chalk.yellow("[HYBRID] Session expired, logging in via Puppeteer..."));

        const loginResult = await puppeteerLogin(email, password, false);
        if (!loginResult.success) {
            return { success: false, pesan: loginResult.pesan };
        }

        // Wait a moment for session to stabilize
        await new Promise(r => setTimeout(r, 1000));

        // Try Axios again with fresh session
        const retryResult = await apiService.checkAttendanceStatus(email);
        if (retryResult.success) {
            console.log(chalk.green("[HYBRID] ✅ Retry successful after re-login"));
            return retryResult;
        }

        // If still fails, log the specific error for debugging
        console.log(chalk.red(`[HYBRID] Retry failed: ${retryResult.pesan || 'Unknown error'}`));
    }

    // Final fallback - return the original result
    return { success: false, sudahAbsen: false, pesan: apiResult.pesan || "Unknown error" };
}

/**
 * Submit attendance report
 * HYBRID: Try Axios first, fallback to Puppeteer
 */
async function prosesLoginDanAbsen(dataUser) {
    const { email, password, aktivitas, pembelajaran, kendala } = dataUser;
    console.log(chalk.blue(`[HYBRID] Processing attendance for ${email}`));

    // Try Axios first (fast)
    const apiResult = await apiService.submitAttendanceReport(email, {
        aktivitas, pembelajaran, kendala
    });

    if (apiResult.success) {
        console.log(chalk.green("[HYBRID] ✅ Submitted via fast Axios"));
        return {
            success: true,
            nama: email,
            foto: null,
            pesan_tambahan: "(Fast Mode - API)"
        };
    }

    // If Axios failed, use Puppeteer
    console.log(chalk.yellow("[HYBRID] Axios failed, using Puppeteer fallback..."));
    return await puppeteerSubmit(email, password, { aktivitas, pembelajaran, kendala });
}

module.exports = {
    prosesLoginDanAbsen,
    cekKredensial,
    cekStatusHarian
};
