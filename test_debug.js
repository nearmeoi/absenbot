/**
 * Debug Script untuk Login MagangHub
 * Menyediakan logging detail untuk troubleshooting
 * 
 * Usage: node test_debug.js <email> <password>
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { SESSION_DIR, TEMP_DIR, CHROMIUM_PATH, API_ENDPOINTS } = require("./src/config/constants");

// Ensure directories exist
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log(chalk.yellow(`
========================================
  DEBUG LOGIN SCRIPT - MagangHub Bot
========================================

Usage: node test_debug.js <email> <password>

Contoh: 
  node test_debug.js user@email.com password123

Script ini akan menampilkan log detail untuk debugging.
========================================
`));
    process.exit(1);
}

const [email, password] = args;

// Debug helper functions
function logStep(step, message) {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
    console.log(chalk.cyan(`[${timestamp}] [STEP ${step}] `) + message);
}

function logDebug(category, message, data = null) {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
    console.log(chalk.gray(`[${timestamp}] [DEBUG:${category}] `) + message);
    if (data !== null) {
        console.log(chalk.gray("    └─ Data: ") + JSON.stringify(data, null, 2));
    }
}

function logSuccess(message) {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
    console.log(chalk.green(`[${timestamp}] ✅ ${message}`));
}

function logError(message, error = null) {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
    console.log(chalk.red(`[${timestamp}] ❌ ${message}`));
    if (error) {
        console.log(chalk.red("    └─ Error: ") + error.message);
        if (error.stack) {
            console.log(chalk.gray("    └─ Stack:\n") +
                error.stack.split('\n').map(l => chalk.gray("       " + l)).join('\n'));
        }
    }
}

function logWarning(message) {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
    console.log(chalk.yellow(`[${timestamp}] ⚠️  ${message}`));
}

async function debugLogin() {
    console.log(chalk.magenta(`
╔════════════════════════════════════════════════════════════════════╗
║                    DEBUG LOGIN - MagangHub Bot                     ║
║                      Detailed Troubleshooting                      ║
╚════════════════════════════════════════════════════════════════════╝
`));

    console.log(chalk.white(`Email: ${email}`));
    console.log(chalk.white(`Password: ${"*".repeat(password.length)}\n`));

    let browser = null;
    let page = null;

    try {
        // === STEP 1: Check Chrome Path ===
        logStep(1, "Memeriksa Chrome/Chromium path...");
        logDebug("PATH", `Configured path: ${CHROMIUM_PATH}`);

        if (fs.existsSync(CHROMIUM_PATH)) {
            logSuccess(`Chrome ditemukan di: ${CHROMIUM_PATH}`);
        } else {
            logError(`Chrome TIDAK ditemukan di: ${CHROMIUM_PATH}`);
            return;
        }

        // === STEP 2: Launch Browser ===
        logStep(2, "Meluncurkan browser...");

        browser = await puppeteer.launch({
            headless: "new",
            executablePath: CHROMIUM_PATH,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
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
                // REMOVED: --single-process dan --no-zygote karena menyebabkan crash di Windows
            ]
        });

        logSuccess("Browser berhasil diluncurkan");
        logDebug("BROWSER", `Browser version: ${await browser.version()}`);

        // === STEP 3: Create Page ===
        logStep(3, "Membuat halaman baru...");
        page = await browser.newPage();
        page.setDefaultTimeout(90000);
        await page.setUserAgent(USER_AGENT);
        logSuccess("Halaman baru dibuat");

        // Enable console logging from page
        page.on("console", msg => {
            logDebug("PAGE_CONSOLE", `[${msg.type()}] ${msg.text()}`);
        });

        page.on("pageerror", err => {
            logDebug("PAGE_ERROR", err.message);
        });

        page.on("requestfailed", req => {
            logDebug("REQUEST_FAIL", `${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
        });

        // === STEP 4: Setup Request Interception ===
        logStep(4, "Setup request interception...");
        await page.setRequestInterception(true);
        page.on("request", req => {
            if (["image", "media", "font", "stylesheet"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });
        logSuccess("Request interception aktif");

        // === STEP 5: Navigate to Login Page ===
        logStep(5, "Navigasi ke halaman login...");
        logDebug("URL", `Target: ${API_ENDPOINTS.LOGIN_URL}`);

        const navigationStart = Date.now();
        // Gunakan domcontentloaded karena networkidle0 menyebabkan frame detach pada OAuth flow
        try {
            await page.goto(API_ENDPOINTS.LOGIN_URL, {
                waitUntil: "domcontentloaded",
                timeout: 60000
            });
        } catch (navError) {
            // Handle frame detach error - tunggu sebentar dan cek apakah sudah ada di halaman
            logWarning(`Navigation issue: ${navError.message}`);
            await new Promise(r => setTimeout(r, 2000));
        }

        // Tunggu tambahan untuk memastikan halaman stabil
        await new Promise(r => setTimeout(r, 2000));
        const navigationTime = Date.now() - navigationStart;

        logSuccess(`Navigasi selesai dalam ${navigationTime}ms`);
        logDebug("URL", `Current URL: ${page.url()}`);

        // === STEP 6: Check if Already Logged In ===
        logStep(6, "Memeriksa status login...");
        const currentUrl = page.url();

        // PENTING: Cek hostname, bukan hanya string matching
        let isLoggedIn = false;
        try {
            const urlObj = new URL(currentUrl);
            isLoggedIn = urlObj.hostname.includes("monev.maganghub") &&
                (currentUrl.includes("dashboard") || urlObj.pathname === "/");
        } catch (e) {
            isLoggedIn = false;
        }

        logDebug("STATUS", `Current hostname: ${new URL(currentUrl).hostname}`);
        logDebug("STATUS", `Already logged in: ${isLoggedIn}`);

        if (!isLoggedIn) {
            // === STEP 7: Fill Login Form ===
            logStep(7, "Mengisi form login...");

            logDebug("FORM", "Waiting for username input...");

            // Tunggu sebentar untuk memastikan form ter-render
            await new Promise(r => setTimeout(r, 1000));

            // Coba beberapa selector yang mungkin
            const usernameSelectors = ['input[name="username"]', 'input[type="email"]', '#username', '#email'];
            let usernameInput = null;

            for (const selector of usernameSelectors) {
                try {
                    usernameInput = await page.waitForSelector(selector, { visible: true, timeout: 5000 });
                    if (usernameInput) {
                        logSuccess(`Input username ditemukan dengan selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    logDebug("FORM", `Selector ${selector} tidak ditemukan, mencoba yang lain...`);
                }
            }

            if (!usernameInput) {
                // Take screenshot untuk debug
                const debugScreenshot = path.join(TEMP_DIR, `debug_no_form_${Date.now()}.png`);
                await page.screenshot({ path: debugScreenshot });
                logDebug("SCREENSHOT", `Form not found: ${debugScreenshot}`);

                // Log page content
                const content = await page.content();
                logDebug("HTML", `Page length: ${content.length} chars`);
                logDebug("HTML", `Has form: ${content.includes('<form')}, Has input: ${content.includes('<input')}`);

                throw new Error("Form login tidak ditemukan - halaman mungkin tidak ter-load dengan benar");
            }

            logDebug("FORM", "Typing email...");
            await usernameInput.type(email, { delay: 20 });
            logSuccess("Email diketik");

            logDebug("FORM", "Finding password input...");
            const passwordInput = await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
            logDebug("FORM", "Typing password...");
            await passwordInput.type(password, { delay: 20 });
            logSuccess("Password diketik");

            // Take screenshot before submit
            const beforeSubmitScreenshot = path.join(TEMP_DIR, `debug_before_submit_${Date.now()}.png`);
            await page.screenshot({ path: beforeSubmitScreenshot });
            logDebug("SCREENSHOT", `Before submit: ${beforeSubmitScreenshot}`);

            // === STEP 8: Submit Form ===
            logStep(8, "Mengirim form login...");
            await page.click('button[type="submit"]');
            logSuccess("Form dikirim, menunggu redirect...");

            // === STEP 9: Wait for Redirect ===
            logStep(9, "Menunggu redirect ke dashboard...");
            const redirectStart = Date.now();

            try {
                // PENTING: Tunggu sampai hostname berubah ke monev.maganghub
                await page.waitForFunction(
                    () => {
                        try {
                            const url = new URL(location.href);
                            return url.hostname.includes("monev.maganghub");
                        } catch (e) {
                            return false;
                        }
                    },
                    { timeout: 60000 }
                );
                const redirectTime = Date.now() - redirectStart;
                logSuccess(`Redirect berhasil dalam ${redirectTime}ms`);
            } catch (waitError) {
                logError("Timeout menunggu redirect", waitError);

                const errorScreenshot = path.join(TEMP_DIR, `debug_error_${Date.now()}.png`);
                await page.screenshot({ path: errorScreenshot });
                logDebug("SCREENSHOT", `Error state: ${errorScreenshot}`);

                // Get page content for debugging
                const pageContent = await page.content();
                const contentSnippet = pageContent.substring(0, 500);
                logDebug("PAGE_CONTENT", `First 500 chars: ${contentSnippet}`);

                throw waitError;
            }

            // Check if still on login page (login failed)
            if (page.url().includes("auth/login")) {
                logError("Masih di halaman login - cek error message");

                const errorMsg = await page.evaluate(() => {
                    const err = document.querySelector(".alert-danger, .error-message, .text-danger");
                    return err ? err.textContent : null;
                });

                if (errorMsg) {
                    logDebug("ERROR_MESSAGE", errorMsg);
                }

                throw new Error("Login gagal - password salah atau captcha muncul");
            }
        }

        logSuccess("LOGIN BERHASIL!");
        logDebug("URL", `After login URL: ${page.url()}`);

        // === STEP 10: Navigate to Dashboard ===
        logStep(10, "Navigasi ke dashboard untuk mendapatkan cookies...");

        if (!page.url().includes("dashboard")) {
            logDebug("NAV", "Current URL is not dashboard, navigating...");
            await page.goto(API_ENDPOINTS.DASHBOARD, { waitUntil: "networkidle2" });
            logSuccess("Navigasi ke dashboard selesai");
        } else {
            logDebug("NAV", "Already on dashboard, waiting 2 seconds...");
            await new Promise(r => setTimeout(r, 2000));
        }

        logDebug("URL", `Final URL: ${page.url()}`);

        // === STEP 11: Extract Cookies (with detailed try-catch) ===
        logStep(11, "Mengambil cookies dari session...");

        let allCookies = [];
        let monevCookies = [];

        try {
            logDebug("COOKIES", "Getting all cookies from current page...");
            allCookies = await page.cookies();
            logDebug("COOKIES", `Got ${allCookies.length} cookies from page`);
        } catch (cookieError) {
            logError("Gagal mengambil cookies dari page", cookieError);
        }

        try {
            logDebug("COOKIES", "Getting cookies specifically from monev domain...");
            monevCookies = await page.cookies("https://monev.maganghub.kemnaker.go.id");
            logDebug("COOKIES", `Got ${monevCookies.length} cookies from monev domain`);
        } catch (cookieError) {
            logError("Gagal mengambil cookies dari monev domain", cookieError);
        }

        // Merge cookies
        const cookieMap = new Map();
        allCookies.forEach(c => cookieMap.set(`${c.name}@${c.domain}`, c));
        monevCookies.forEach(c => cookieMap.set(`${c.name}@${c.domain}`, c));
        const cookies = Array.from(cookieMap.values());

        logSuccess(`Total ${cookies.length} unique cookies dikumpulkan`);

        // Log cookie details
        console.log(chalk.cyan("\n[COOKIE DETAILS]"));
        cookies.forEach((c, idx) => {
            console.log(chalk.gray(`  ${idx + 1}. ${c.name}`));
            console.log(chalk.gray(`     └─ Domain: ${c.domain}`));
            console.log(chalk.gray(`     └─ Path: ${c.path}`));
            console.log(chalk.gray(`     └─ Secure: ${c.secure}`));
            console.log(chalk.gray(`     └─ HttpOnly: ${c.httpOnly}`));
            console.log(chalk.gray(`     └─ Expires: ${c.expires === -1 ? "Session" : new Date(c.expires * 1000).toISOString()}`));
            console.log(chalk.gray(`     └─ Value (first 20 chars): ${c.value.substring(0, 20)}...`));
        });

        // === STEP 12: Extract CSRF Token ===
        logStep(12, "Mencari CSRF token...");
        let csrfToken = null;
        try {
            csrfToken = await page.evaluate(() => {
                const meta = document.querySelector('meta[name="csrf-token"]');
                return meta ? meta.getAttribute("content") : null;
            });
            if (csrfToken) {
                logSuccess(`CSRF token ditemukan: ${csrfToken.substring(0, 20)}...`);
            } else {
                logWarning("CSRF token tidak ditemukan di meta tag");
            }
        } catch (csrfError) {
            logWarning("Gagal mengambil CSRF token", csrfError);
        }

        // === STEP 13: Take Final Screenshot ===
        logStep(13, "Mengambil screenshot bukti...");
        let screenshotPath = null;
        try {
            screenshotPath = path.join(TEMP_DIR, `debug_success_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath });
            logSuccess(`Screenshot tersimpan: ${screenshotPath}`);
        } catch (ssError) {
            logWarning("Gagal mengambil screenshot", ssError);
        }

        // === STEP 14: Save Session ===
        logStep(14, "Menyimpan session...");
        const sessionPath = path.join(SESSION_DIR, `${email}.json`);
        const session = {
            cookies,
            csrfToken,
            timestamp: Date.now()
        };

        fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
        logSuccess(`Session tersimpan di: ${sessionPath}`);

        // === STEP 15: Close Browser ===
        logStep(15, "Menutup browser...");
        await browser.close();
        browser = null;
        logSuccess("Browser ditutup dengan bersih");

        // === SUMMARY ===
        console.log(chalk.magenta(`
╔════════════════════════════════════════════════════════════════════╗
║                         DEBUG SUMMARY                              ║
╚════════════════════════════════════════════════════════════════════╝
`));
        console.log(chalk.green("✅ Login: SUKSES"));
        console.log(chalk.green(`✅ Cookies: ${cookies.length} tersimpan`));
        console.log(chalk.green(`✅ CSRF Token: ${csrfToken ? "Ada" : "Tidak ada"}`));
        console.log(chalk.green(`✅ Session File: ${sessionPath}`));
        if (screenshotPath) {
            console.log(chalk.green(`✅ Screenshot: ${screenshotPath}`));
        }

        // List important cookies
        const importantCookies = cookies.filter(c =>
            c.name.toLowerCase().includes("session") ||
            c.name.toLowerCase().includes("xsrf") ||
            c.name.toLowerCase().includes("token")
        );
        if (importantCookies.length > 0) {
            console.log(chalk.cyan("\n[IMPORTANT COOKIES]"));
            importantCookies.forEach(c => {
                console.log(chalk.cyan(`  • ${c.name} (${c.domain})`));
            });
        }

        return { success: true };

    } catch (error) {
        console.log(chalk.red(`
╔════════════════════════════════════════════════════════════════════╗
║                           ERROR FATAL                               ║
╚════════════════════════════════════════════════════════════════════╝
`));
        logError("Debug login gagal", error);

        // Try to save error screenshot
        if (page) {
            try {
                const errorScreenshot = path.join(TEMP_DIR, `debug_fatal_${Date.now()}.png`);
                await page.screenshot({ path: errorScreenshot });
                console.log(chalk.gray(`Error screenshot: ${errorScreenshot}`));
            } catch (e) {
                // Ignore screenshot error
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

        return { success: false, error: error.message };
    }
}

// Run debug
debugLogin().then(result => {
    if (result.success) {
        console.log(chalk.green("\n🎉 Debug selesai dengan SUKSES!"));
        process.exit(0);
    } else {
        console.log(chalk.red("\n💥 Debug selesai dengan ERROR!"));
        process.exit(1);
    }
}).catch(err => {
    console.error(chalk.red("Fatal error:"), err);
    process.exit(1);
});
