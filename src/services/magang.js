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
const { isHoliday } = require("../config/holidays");
const { getDashboardCache, setDashboardCache } = require("./dashboardCache");

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
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
    ];

    if (process.platform === 'linux') {
        commonArgs.push(
            "--single-process",
            "--no-zygote",
            "--renderer-process-limit=1",
            "--js-flags=--max-old-space-size=512"
        );
    }

    const allArgs = [...new Set([...PUPPETEER_ARGS, ...commonArgs])];

    return await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        executablePath: CHROMIUM_PATH,
        args: allArgs,
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
    let accessToken = null;
    let screenshotPath = null;

    try {
        browser = await launchBrowser();
        page = await browser.newPage();
        page.setDefaultTimeout(120000);
        await page.setUserAgent(USER_AGENT);

        // --- PRE-LOAD COOKIES ---
        const existingSession = apiService.loadSession(email);
        if (existingSession && existingSession.cookies) {
            console.log(chalk.cyan(`[BROWSER] Pre-loading existing cookies for ${email}...`));
            await page.setCookie(...existingSession.cookies);
        }

        const context = browser.defaultBrowserContext();
        await context.overridePermissions("https://account.kemnaker.go.id", []);
        await context.overridePermissions("https://siapkerja.kemnaker.go.id", []);
        await context.overridePermissions("https://monev.maganghub.kemnaker.go.id", []);

        await page.setRequestInterception(true);
        page.on("request", req => {
            const type = req.resourceType();
            if (["image", "media", "font", "stylesheet", "manifest", "prefetch", "websocket", "eventsource", "texttrack", "other"].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setViewport({ width: 800, height: 600 });

        let navSuccess = false;
        for (let i = 0; i < 3; i++) {
            try {
                await page.goto(API_ENDPOINTS.LOGIN_URL, {
                    waitUntil: i === 0 ? "networkidle2" : "domcontentloaded",
                    timeout: 120000
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
            const identitySelectors = ['#username', '#identity', 'input[name="username"]', 'input[name="identity"]', 'input[type="email"]'];
            let identityInput = null;

            for (const selector of identitySelectors) {
                try {
                    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
                    identityInput = selector;
                    break;
                } catch (e) { }
            }

            if (!identityInput) throw new Error(`Could not find login input. URL: ${page.url()}`);

            await new Promise(r => setTimeout(r, 1500));

            await page.evaluate((sel, user, pass) => {
                const userEl = document.querySelector(sel);
                const passEl = document.querySelector('#password') || document.querySelector('input[type="password"]');
                if (userEl) { userEl.focus(); userEl.value = user; userEl.dispatchEvent(new Event('input', { bubbles: true })); }
                if (passEl) { passEl.focus(); passEl.value = pass; passEl.dispatchEvent(new Event('input', { bubbles: true })); }
            }, identityInput, email, password);

            await new Promise(r => setTimeout(r, 1000));

            try {
                const submitted = await page.evaluate(() => {
                    const btn = document.querySelector('button[type="submit"]') || document.querySelector('button.btn-primary');
                    if (btn) { btn.click(); return true; }
                    return false;
                });
                if (!submitted) await page.keyboard.press('Enter');
            } catch (e) { }

            try {
                await page.waitForSelector('.alert-danger, .alert-error, div[role="alert"], .text-danger', { visible: true, timeout: 5000 });
                const errorText = await page.evaluate(() => {
                    const el = document.querySelector('.alert-danger, .alert-error, div[role="alert"], .text-danger');
                    return el ? el.innerText.trim() : null;
                });
                if (errorText) throw new Error(`Login Gagal: ${errorText}`);
            } catch (e) {
                if (e.message.includes('Login Gagal')) throw e;
            }

            await new Promise(r => setTimeout(r, 1500));
        }

        console.log(chalk.yellow(`[BROWSER] Direct navigation to Monev dashboard...`));
        await new Promise(r => setTimeout(r, 2000));

        try {
            await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', {
                waitUntil: 'domcontentloaded',
                timeout: 120000
            });
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) {
            const currentUrl = page.url();
            if (currentUrl.includes('/naco/auth') && currentUrl.includes('access_token=')) {
                const params = new URLSearchParams(currentUrl.split('#')[1]);
                accessToken = params.get('access_token');
                if (accessToken) {
                    const cookies = await page.cookies();
                    apiService.saveSession(email, cookies, csrfToken, accessToken);
                    await browser.close();
                    return { success: true };
                }
            }
        }

        await new Promise(r => setTimeout(r, 1500));
        const currentUrl = page.url();
        if (!currentUrl.includes('monev.maganghub') && !currentUrl.includes('dashboard') && !accessToken) {
            throw new Error(`Login Timeout - stuck at: ${currentUrl}`);
        }

        await new Promise(r => setTimeout(r, 1000));
        let siapkerjaCookies = await page.cookies();

        console.log(chalk.yellow(`[BROWSER] Waiting for session tokens to appear...`));
        let tokenFound = false;
        for (let i = 0; i < 15; i++) {
            const tokens = await page.evaluate(() => {
                return {
                    csrf: document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                    accessToken: localStorage.getItem('token') || localStorage.getItem('access_token') || sessionStorage.getItem('token') || sessionStorage.getItem('access_token'),
                    cookieToken: document.cookie.match(/accessToken=([^;]+)/)?.[1]
                };
            });
            csrfToken = tokens.csrf || csrfToken;
            accessToken = tokens.accessToken || tokens.cookieToken;
            if (accessToken) { tokenFound = true; break; }
            await new Promise(r => setTimeout(r, 1000));
        }

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

        let refreshToken = null;
        try {
            refreshToken = await page.evaluate(() => localStorage.getItem('refresh_token') || localStorage.getItem('refreshToken'));
        } catch (e) { }

        if (cookies.length > 0) {
            apiService.saveSession(email, cookies, csrfToken, accessToken, refreshToken);
        }

        if (takeScreenshot) {
            try {
                screenshotPath = path.join(TEMP_DIR, `login_${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath });
            } catch (e) { }
        }

        await browser.close();
        return { success: true, foto: screenshotPath };
    } catch (error) {
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
        page.setDefaultTimeout(120000);
        await page.setUserAgent(USER_AGENT);
        await page.setViewport({ width: 800, height: 600 });
        await page.goto(API_ENDPOINTS.LOGIN_URL, { waitUntil: "domcontentloaded" });

        const isLoggedIn = () => page.url().includes("dashboard") || page.url().includes("monev");
        if (!isLoggedIn()) {
            const identitySelectors = ['input[name="identity"]', 'input[name="username"]', 'input[type="email"]'];
            let identityInput = null;
            for (const selector of identitySelectors) {
                try {
                    await page.waitForSelector(selector, { visible: true, timeout: 5000 });
                    identityInput = selector;
                    break;
                } catch (e) { }
            }
            if (!identityInput) throw new Error("Could not find login input field");
            await page.type(identityInput, email, { delay: 20 });
            await page.type('input[type="password"]', password, { delay: 20 });
            await page.click('button[type="submit"]');
            await page.waitForFunction(() => location.href.includes("monev") || location.href.includes("dashboard"), { timeout: 120000 });
        }

        const cookies = await page.cookies();
        apiService.saveSession(email, cookies);

        if (!page.url().includes("dashboard")) {
            await page.goto(API_ENDPOINTS.DASHBOARD, { waitUntil: "domcontentloaded" });
        }

        const day = new Date().getDate();
        try {
            await page.waitForSelector("td.clickable-day, div.day", { timeout: 20000 });
            await page.evaluate((d) => {
                const days = Array.from(document.querySelectorAll('div.day-content, span.day-label, td'));
                for (let el of days) {
                    if (el.textContent.trim() == d) { el.click(); return true; }
                }
                return false;
            }, day.toString());
        } catch (e) { }

        await page.waitForSelector("textarea", { visible: true, timeout: 30000 });
        const textareas = await page.$$("textarea");
        if (textareas.length >= 3) {
            await textareas[0].type(reportData.aktivitas);
            await textareas[1].type(reportData.pembelajaran);
            await textareas[2].type(reportData.kendala);
        } else throw new Error("Form tidak ditemukan");

        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) await checkbox.click();

        const btnSimpan = await page.$x("//button[contains(., 'Simpan') or contains(., 'Kirim')]");
        if (btnSimpan.length > 0) {
            await btnSimpan[0].click();
            await new Promise(r => setTimeout(r, 5000));
            let screenshotPath = path.join(TEMP_DIR, `bukti_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath });
            await browser.close();
            return { success: true, nama: email, foto: screenshotPath, pesan_tambahan: "(Via Browser)" };
        }
        throw new Error("Tombol simpan tidak ditemukan");
    } catch (error) {
        if (browser) await browser.close();
        return { success: false, pesan: error.message };
    }
}

async function cekKredensial(email, password) {
    // 1. Try Direct Login first (it's fast)
    // We don't clear the session here because directLogin will update it
    const directResult = await apiService.directLogin(email, password);

    // If it's fully successful (including SSO), we are done!
    if (directResult.success && directResult.sso_completed) {
        console.log(chalk.green(`[MAGANG] ✅ Direct Login (Fast) successful for ${email}`));
        return directResult;
    }

    // 2. If Account login succeeded but SSO failed, proceed to Puppeteer
    // Puppeteer will use the cookies we just saved to skip the login form
    console.log(chalk.yellow(`[MAGANG] Direct Login partially successful. Completing via browser for ${email}...`));
    return await puppeteerLogin(email, password, true);
}

async function cekStatusHarian(email, password) {
    const apiResult = await apiService.checkAttendanceStatus(email);
    if (apiResult.success) return apiResult;

    if (apiResult.needsLogin) {
        // Try Direct Login (Fast Account Refresh)
        const directResult = await apiService.directLogin(email, password);

        // Even if Direct Login succeeded, if SSO handshake failed, 
        // we still need Puppeteer to get the full session (Monev tokens)
        if (directResult.success && directResult.sso_completed) {
            return await apiService.checkAttendanceStatus(email);
        }

        // Fallback to Puppeteer for full session
        console.log(chalk.yellow(`[MAGANG] Direct Login incomplete. Completing via Puppeteer...`));
        const loginResult = await puppeteerLogin(email, password, false);

        if (loginResult.success) {
            return await apiService.checkAttendanceStatus(email);
        }
        return { success: false, pesan: "Login gagal" };
    }
    return { success: false, sudahAbsen: false, pesan: apiResult.pesan || "Unknown error" };
}

async function prosesLoginDanAbsen(dataUser) {
    const { email, password, aktivitas, pembelajaran, kendala, simulation } = dataUser;
    if (simulation) {
        await new Promise(r => setTimeout(r, 1000));
        return { success: true, nama: email, foto: null, pesan_tambahan: "(MODE SIMULASI)" };
    }

    // 1. Try submitting via API using existing session
    console.log(chalk.cyan(`[PROCESS] Trying API submission for ${email}...`));
    let apiResult = await apiService.submitAttendanceReport(email, { aktivitas, pembelajaran, kendala });
    if (apiResult.success) return apiResult;

    // 2. If API failed due to auth, try Direct Login (Refresh Session)
    if (apiResult.needsLogin) {
        console.log(chalk.yellow(`[PROCESS] API failed (needs login). Attempting Direct Login for ${email}...`));
        const loginResult = await apiService.directLogin(email, password);

        if (loginResult.success && loginResult.sso_completed) {
            console.log(chalk.green(`[PROCESS] Direct Login successful. Retrying API submission...`));
            apiResult = await apiService.submitAttendanceReport(email, { aktivitas, pembelajaran, kendala });
            if (apiResult.success) return apiResult;
        } else if (loginResult.success) {
            console.log(chalk.yellow(`[PROCESS] Direct Login partially successful (Account OK, SSO pending). Fallback to Puppeteer...`));
        } else {
            console.log(chalk.red(`[PROCESS] Direct Login failed: ${loginResult.pesan}`));
        }
    }

    // 3. Fallback to Puppeteer if all else fails
    console.log(chalk.yellow(`[PROCESS] Fallback to Puppeteer for ${email}...`));
    return await puppeteerSubmit(email, password, { aktivitas, pembelajaran, kendala });
}

async function getRiwayat(email, password, days = 1) {
    const apiResult = await apiService.getAttendanceHistory(email, days);
    if (apiResult.success) return apiResult;
    if (apiResult.needsLogin) {
        const directResult = await apiService.directLogin(email, password);
        if (directResult.success && directResult.sso_completed) return await apiService.getAttendanceHistory(email, days);

        console.log(chalk.yellow(`[MAGANG] Direct Login incomplete for riwayat. Completing via Puppeteer...`));
        const loginResult = await puppeteerLogin(email, password, false);
        if (loginResult.success) return await apiService.getAttendanceHistory(email, days);
    }
    return { success: false, logs: [], pesan: "Gagal mengambil riwayat" };
}

/**
 * Get Dashboard Stats using the NEW API endpoint discovered (Much faster & reliable)
 */
async function getDashboardStats(email, password, referenceDate = null, useCache = true) {
    try {
        const today = referenceDate ? new Date(referenceDate) : new Date();
        const isCurrentMonth = today.getMonth() === new Date().getMonth() && today.getFullYear() === new Date().getFullYear();

        // 0. Check Cache First (Only for CURRENT month, and if requested)
        if (useCache && isCurrentMonth) {
            const cached = getDashboardCache(email, 2); // 2 hours max age
            if (cached) {
                console.log(chalk.green(`[STATS] Using cached dashboard stats for ${email}`));
                return { success: true, data: cached, cached: true };
            }
        }

        console.log(chalk.cyan(`[STATS] Fetching dashboard stats via API for ${email}...`));

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

        // Previous Month for Supplement (Dec 24 - Jan 24 cycle)
        const prevMonthDate = new Date(today);
        prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const startOfPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1).toISOString().split('T')[0];
        const endOfPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).toISOString().split('T')[0];

        // Fetch BOTH months in parallel AND Monthly Reports
        let [currentMonthRes, prevMonthRes, monthlyReportsRes] = await Promise.all([
            apiService.getAttendances(email, startOfMonth, endOfMonth),
            apiService.getAttendances(email, startOfPrevMonth, endOfPrevMonth),
            apiService.getMonthlyReports(email)
        ]);

        // Re-login if session expired
        if ((!currentMonthRes.success && currentMonthRes.needsLogin) ||
            (!prevMonthRes.success && prevMonthRes.needsLogin) ||
            (!monthlyReportsRes.success && monthlyReportsRes.needsLogin)) {

            console.log(chalk.yellow(`[STATS] Session expired, re-logging...`));
            const loginResult = await apiService.directLogin(email, password);
            if (!loginResult.success || !loginResult.sso_completed) {
                await puppeteerLogin(email, password, false);
            }

            // Retry fetch
            [currentMonthRes, prevMonthRes, monthlyReportsRes] = await Promise.all([
                apiService.getAttendances(email, startOfMonth, endOfMonth),
                apiService.getAttendances(email, startOfPrevMonth, endOfPrevMonth),
                apiService.getMonthlyReports(email)
            ]);
        }

        if (!currentMonthRes.success) return currentMonthRes;

        const data = [...(currentMonthRes.data || []), ...(prevMonthRes.data || [])];
        const uniqueData = Array.from(new Map(data.map(item => [item.date, item])).values());

        // Process Monthly Reports Status (Check for Specific Month)
        let raporStatus = 'Belum ada';

        if (monthlyReportsRes.success && monthlyReportsRes.data && Array.isArray(monthlyReportsRes.data)) {
            // Determine Target Month based on Cycle
            // Cycle: 24th Prev Month -> 24th This Month
            // User Rule: "Desember-Januari ya bulan Januari"
            // So we target the month where the cycle ENDS.

            let targetDate = new Date(today);
            if (today.getDate() <= 24) {
                // If today is 1-24, we are in the cycle ending THIS month.
                // e.g. Jan 15 -> Cycle Dec 24 - Jan 24. Target: Jan.
                // No change needed to targetDate (it is Jan).
            } else {
                // If today is 25-31, we are in the cycle ending NEXT month.
                // e.g. Jan 25 -> Cycle Jan 24 - Feb 24. Target: Feb.
                targetDate.setMonth(targetDate.getMonth() + 1);
            }

            // Format target YYYY-MM-01
            const yyyy = targetDate.getFullYear();
            const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
            const targetYearMonth = `${yyyy}-${mm}-01`;

            const hasReport = monthlyReportsRes.data.some(r => r.year_month === targetYearMonth);
            if (hasReport) {
                raporStatus = 'Sudah ada';
            }
        }

        // Filter for Current Month stats (compatibility)
        const currentMonthData = uniqueData.filter(d => d.date >= startOfMonth && d.date <= endOfMonth);

        const results = {
            hadir: 0,
            izin: 0,
            revisi: 0,
            tidakHadirKet: 0,
            tidakHadirTanpaKet: 0,
            ditolak: 0,
            rapor: raporStatus,
            periode: today.toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
            calendar: {
                approved: [],
                rejected: [],
                revision: [],
                pending: [],
                permission: [],
                alpha: []
            },
            full_attendances: uniqueData
        };

        // Map current month status
        currentMonthData.forEach(item => {
            const day = new Date(item.date).getDate().toString();
            const status = (item.approval_status || '').toUpperCase();
            const attendanceStatus = (item.status || '').toUpperCase();

            if (attendanceStatus === 'ON_LEAVE' || attendanceStatus === 'SICK' || attendanceStatus === 'PERMIT') {
                results.izin++;
                results.calendar.permission.push(day);
                return;
            }

            if (status === 'APPROVED') {
                results.hadir++;
                results.calendar.approved.push(day);
            } else if (status === 'REJECTED' || status === 'DITOLAK') {
                results.ditolak++;
                results.calendar.rejected.push(day);
            } else if (status === 'REVISION' || status.includes('REVISI')) {
                results.revisi++;
                results.calendar.revision.push(day);
            } else {
                results.calendar.pending.push(day);
            }
        });

        // Determine Alphas (Missing reports on workdays - Current Month)
        const lastDay = today.getDate();
        const realTodayStr = new Date().toISOString().split('T')[0];

        for (let i = 1; i <= lastDay; i++) {
            const d = new Date(today.getFullYear(), today.getMonth(), i);
            if (d > today) break;
            const dStr = d.toISOString().split('T')[0];

            // Skip today for Alpha calculation (don't flag as Alpha if check is done before submission)
            if (dStr === realTodayStr) continue;

            if (!isHoliday(dStr)) {
                if (!currentMonthData.some(item => item.date === dStr)) {
                    results.tidakHadirTanpaKet++;
                    results.calendar.alpha.push(i.toString());
                }
            }
        }

        console.log(chalk.green(`[STATS] API Extraction complete: Hadir=${results.hadir}, Izin=${results.izin}, Rapor=${results.rapor}`));

        // Save to cache (only if it's the current month)
        if (isCurrentMonth) {
            setDashboardCache(email, results);
        }

        return { success: true, data: results };

    } catch (error) {
        console.error(chalk.red(`[STATS] Error: ${error.message}`));
        return { success: false, pesan: error.message };
    }
}

async function getAnnouncements(email) {
    // Delegate to API service (or Puppeteer fallback if we ever implement it)
    return await apiService.getAnnouncements(email);
}

async function getParticipantProfile(email) {
    return await apiService.getParticipantProfile(email);
}

async function getUserProfile(email) {
    return await apiService.getUserProfile(email);
}

/**
 * Automatically detect Cycle Day (Batch 2 vs Batch 3)
 * Analyzes monthly reports from Kemnaker
 */
async function detectCycleDay(email, password) {
    try {
        console.log(chalk.cyan(`[CYCLE] Detecting cycle day for ${email}...`));
        let reportsRes = await apiService.getMonthlyReports(email);

        if (!reportsRes.success && reportsRes.needsLogin) {
            const directResult = await apiService.directLogin(email, password);
            if (!directResult.success || !directResult.sso_completed) {
                await puppeteerLogin(email, password, false);
            }
            reportsRes = await apiService.getMonthlyReports(email);
        }

        if (reportsRes.success && reportsRes.data && Array.isArray(reportsRes.data) && reportsRes.data.length > 0) {
            // Check the last 3 reports to be sure
            const samples = reportsRes.data.slice(0, 3);
            let count16 = 0;
            let count24 = 0;

            samples.forEach(r => {
                if (r.start_date) {
                    const day = parseInt(r.start_date.split('-')[2]);
                    if (day === 16) count16++;
                    else if (day === 24) count24++;
                }
            });

            if (count16 > count24) return 16;
            if (count24 > count16) return 24;
        }

        // Fallback default
        return 24;
    } catch (e) {
        console.error(`[CYCLE] Detection error: ${e.message}`);
        return 24;
    }
}

module.exports = {
    prosesLoginDanAbsen,
    cekKredensial,
    cekStatusHarian,
    getRiwayat,
    getDashboardStats,
    getAnnouncements,
    getParticipantProfile,
    getUserProfile,
    detectCycleDay
};