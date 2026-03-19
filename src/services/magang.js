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

/**
 * Centralized Error Handler for Magang Service
 */
function handleMagangError(error) {
    const msg = error.message || "";
    if (msg.includes("Timeout") || msg.includes("timeout") || msg.includes("504") || msg.includes("502") || msg.includes("503") || msg.includes("Navigation failed")) {
        return "Website Kemnaker sedang down/gangguan (Timeout/Down). Silakan coba beberapa saat lagi.";
    }
    return msg;
}

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

    if (!allArgs.includes('--disable-gpu')) allArgs.push('--disable-gpu');
    if (!allArgs.includes('--disable-dev-shm-usage')) allArgs.push('--disable-dev-shm-usage');
    if (!allArgs.includes('--no-sandbox')) allArgs.push('--no-sandbox');

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
        return { success: false, pesan: handleMagangError(error) };
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
        return { success: false, pesan: handleMagangError(error) };
    }
}

async function cekKredensial(email, password) {
    const directResult = await apiService.directLogin(email, password);
    if (directResult.success && directResult.sso_completed) {
        console.log(chalk.green(`[MAGANG] ✅ Direct Login successful for ${email}`));
        return directResult;
    }
    console.log(chalk.yellow(`[MAGANG] Direct Login partially successful. Completing via browser for ${email}...`));
    return await puppeteerLogin(email, password, true);
}

async function cekStatusHarian(email, password, retries = 3) {
    let lastError = null;
    
    for (let i = 0; i < retries; i++) {
        const apiResult = await apiService.checkAttendanceStatus(email);
        
        // If successful or explicitly confirmed already attended, return immediately
        if (apiResult.success) return apiResult;

        // If it's a "down" error, return it immediately
        if (apiResult.pesan && apiResult.pesan.includes("down")) return apiResult;

        // If it's a login issue, try to fix it once
        if (apiResult.needsLogin) {
            console.log(chalk.yellow(`[MAGANG] Session expired for ${email}. Attempting Direct Login (Retry ${i+1}/${retries})...`));
            const directResult = await apiService.directLogin(email, password);
            
            if (directResult.success) {
                const retryApi = await apiService.checkAttendanceStatus(email);
                if (retryApi.success) return retryApi;
            }

            console.log(chalk.yellow(`[MAGANG] API check failed after Direct Login. Completing via Puppeteer...`));
            const loginResult = await puppeteerLogin(email, password, false);
            if (loginResult.success) {
                const finalCheck = await apiService.checkAttendanceStatus(email);
                if (finalCheck.success) return finalCheck;
            }
            lastError = "Login gagal";
        } else {
            lastError = apiResult.pesan || "Unknown error";
            console.log(chalk.red(`[MAGANG] Server error checking status for ${email}: ${lastError}. Retrying... (${i+1}/${retries})`));
            // Small delay before retry if it's a server error
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    return { success: false, sudahAbsen: false, pesan: lastError || "Gagal setelah beberapa kali percobaan" };
}

async function prosesLoginDanAbsen(dataUser, retries = 2) {
    const { email, password, aktivitas, pembelajaran, kendala, simulation } = dataUser;
    if (simulation) {
        await new Promise(r => setTimeout(r, 1000));
        return { success: true, nama: email, foto: null, pesan_tambahan: "(MODE SIMULASI)" };
    }

    let lastError = null;
    for (let i = 0; i <= retries; i++) {
        console.log(chalk.cyan(`[PROCESS] Trying API submission for ${email}... (Attempt ${i+1}/${retries+1})`));
        let apiResult = await apiService.submitAttendanceReport(email, { aktivitas, pembelajaran, kendala });
        
        if (apiResult.success) {
            console.log(chalk.green(`[PROCESS] API submission successful for ${email}`));
            return apiResult;
        }

        // If it's a "down" error, return it immediately
        if (apiResult.pesan && apiResult.pesan.includes("down")) return apiResult;

        // Jika error 400 dan alasannya karena "sudah absen", jangan retry atau fallback
        if (apiResult.pesan && apiResult.pesan.toLowerCase().includes("sudah absen")) {
            console.log(chalk.blue(`[PROCESS] User ${email} confirmed already attended via API.`));
            return { success: true, sudahAbsen: true, pesan: "Sudah absen hari ini (API Check)" };
        }

        console.log(chalk.yellow(`[PROCESS] API submission failed for ${email}: ${apiResult.pesan}`));

        if (apiResult.needsLogin) {
            console.log(chalk.yellow(`[PROCESS] API failed (needs login). Attempting Direct Login for ${email}...`));
            const loginResult = await apiService.directLogin(email, password);

            if (loginResult.success) {
                console.log(chalk.green(`[PROCESS] Direct Login successful. Retrying API submission...`));
                apiResult = await apiService.submitAttendanceReport(email, { aktivitas, pembelajaran, kendala });
                if (apiResult.success) return apiResult;
            }
        }
        
        lastError = apiResult.pesan;
        if (i < retries) await new Promise(r => setTimeout(r, 2000));
    }

    console.log(chalk.yellow(`[PROCESS] Final API attempt failed (${lastError}). Fallback to Puppeteer for ${email}...`));
    return await puppeteerSubmit(email, password, { aktivitas, pembelajaran, kendala });
}

async function getRiwayat(email, password, days = 1) {
    const apiResult = await apiService.getAttendanceHistory(email, days);
    if (apiResult.success) return apiResult;
    
    // If it's a "down" error, return it immediately
    if (apiResult.pesan && apiResult.pesan.includes("down")) return apiResult;

    if (apiResult.needsLogin) {
        const directResult = await apiService.directLogin(email, password);
        if (directResult.success) {
            const retry = await apiService.getAttendanceHistory(email, days);
            if (retry.success) return retry;
        }
        const loginResult = await puppeteerLogin(email, password, false);
        if (loginResult.success) return await apiService.getAttendanceHistory(email, days);
    }
    return { success: false, logs: [], pesan: "Gagal mengambil riwayat" };
}

async function getDashboardStats(email, password, referenceDate = null, useCache = true) {
    try {
        const today = referenceDate ? new Date(referenceDate) : new Date();
        const isCurrentMonth = today.getMonth() === new Date().getMonth() && today.getFullYear() === new Date().getFullYear();

        if (useCache && isCurrentMonth) {
            const cached = getDashboardCache(email, 2);
            if (cached) return { success: true, data: cached, cached: true };
        }

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
        const prevMonthDate = new Date(today);
        prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const startOfPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1).toISOString().split('T')[0];
        const endOfPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).toISOString().split('T')[0];

        let [currentMonthRes, prevMonthRes, monthlyReportsRes] = await Promise.all([
            apiService.getAttendances(email, startOfMonth, endOfMonth),
            apiService.getAttendances(email, startOfPrevMonth, endOfPrevMonth),
            apiService.getMonthlyReports(email)
        ]);

        if ((!currentMonthRes.success && currentMonthRes.needsLogin) ||
            (!prevMonthRes.success && prevMonthRes.needsLogin) ||
            (!monthlyReportsRes.success && monthlyReportsRes.needsLogin)) {
            const loginResult = await apiService.directLogin(email, password);
            if (!loginResult.success) await puppeteerLogin(email, password, false);
            [currentMonthRes, prevMonthRes, monthlyReportsRes] = await Promise.all([
                apiService.getAttendances(email, startOfMonth, endOfMonth),
                apiService.getAttendances(email, startOfPrevMonth, endOfPrevMonth),
                apiService.getMonthlyReports(email)
            ]);
        }

        if (!currentMonthRes.success) return currentMonthRes;
        const data = [...(currentMonthRes.data || []), ...(prevMonthRes.data || [])];
        const uniqueData = Array.from(new Map(data.map(item => [item.date, item])).values());
        let raporStatus = 'Belum ada';

        if (monthlyReportsRes.success && monthlyReportsRes.data && Array.isArray(monthlyReportsRes.data)) {
            let targetDate = new Date(today);
            if (today.getDate() > 24) targetDate.setMonth(targetDate.getMonth() + 1);
            const targetYearMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-01`;
            if (monthlyReportsRes.data.some(r => r.year_month === targetYearMonth)) raporStatus = 'Sudah ada';
        }

        const results = {
            hadir: 0, izin: 0, revisi: 0, tidakHadirKet: 0, tidakHadirTanpaKet: 0, ditolak: 0, rapor: raporStatus,
            periode: today.toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
            calendar: { approved: [], rejected: [], revision: [], pending: [], permission: [], alpha: [] },
            full_attendances: uniqueData
        };

        // Calculate ALPA across the cycle
        // A cycle is defined as 24th of previous month to current date (if <= 24)
        // OR 24th of current month to current date (if > 24)
        let cycleStart;
        const cycleDay = 24;
        if (today.getDate() > cycleDay) {
            cycleStart = new Date(today.getFullYear(), today.getMonth(), cycleDay + 1);
        } else {
            cycleStart = new Date(today.getFullYear(), today.getMonth() - 1, cycleDay + 1);
        }

        const realTodayStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Makassar' }).split(',')[0];
        
        // Clear counts to recalculate across full range
        results.hadir = 0;
        results.izin = 0;
        results.revisi = 0;
        results.tidakHadirTanpaKet = 0;
        results.ditolak = 0;
        results.calendar = { approved: [], rejected: [], revision: [], pending: [], permission: [], alpha: [] };

        for (let d = new Date(cycleStart); d <= today; d.setDate(d.getDate() + 1)) {
            const dStr = d.toLocaleString('en-CA', { timeZone: 'Asia/Makassar' }).split(',')[0];
            if (dStr === realTodayStr) continue; // Don't count today as Alpa yet

            const item = uniqueData.find(it => it.date === dStr);
            const isWorkDay = !isHoliday(dStr);

            if (item) {
                const status = (item.approval_status || item.state || '').toUpperCase();
                const attStatus = (item.status || '').toUpperCase();
                const dayLabel = d.getDate().toString();

                if (['ON_LEAVE', 'SICK', 'PERMIT'].includes(attStatus)) { 
                    results.izin++; 
                    results.calendar.permission.push(dayLabel); 
                } else if (status === 'APPROVED') { 
                    results.hadir++; 
                    results.calendar.approved.push(dayLabel); 
                } else if (status === 'REJECTED' || status === 'DITOLAK') { 
                    results.ditolak++; 
                    results.calendar.rejected.push(dayLabel); 
                } else if (status === 'REVISION' || status.includes('REVISI')) { 
                    results.revisi++; 
                    results.calendar.revision.push(dayLabel); 
                } else {
                    results.calendar.pending.push(dayLabel);
                }
            } else if (isWorkDay) {
                results.tidakHadirTanpaKet++;
                results.calendar.alpha.push(d.getDate().toString());
            }
        }

        if (isCurrentMonth) setDashboardCache(email, results);
        return { success: true, data: results };
    } catch (error) {
        return { success: false, pesan: handleMagangError(error) };
    }
}

async function getAnnouncements(email) { return await apiService.getAnnouncements(email); }
async function getParticipantProfile(email) { return await apiService.getParticipantProfile(email); }
async function getUserProfile(email) { return await apiService.getUserProfile(email); }

async function detectCycleDay(email, password) {
    try {
        let reportsRes = await apiService.getMonthlyReports(email);
        if (!reportsRes.success && reportsRes.needsLogin) {
            const directResult = await apiService.directLogin(email, password);
            if (!directResult.success) await puppeteerLogin(email, password, false);
            reportsRes = await apiService.getMonthlyReports(email);
        }
        if (reportsRes.success && reportsRes.data?.length > 0) {
            const samples = reportsRes.data.slice(0, 3);
            let c16 = 0, c24 = 0;
            samples.forEach(r => { if (r.start_date) { const d = parseInt(r.start_date.split('-')[2]); if (d === 16) c16++; else if (d === 24) c24++; } });
            if (c16 > c24) return 16;
            if (c24 > c16) return 24;
        }
        return 24;
    } catch (e) { return 24; }
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
