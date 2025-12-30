/**
 * API Service - Axios-based fast API client for MagangHub
 * Uses saved cookies from Puppeteer login for authentication
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { SESSION_DIR, API_ENDPOINTS, SESSION_TIMEOUT_MS, LOGS_DIR } = require("../config/constants");

// Ensure directories exist
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Load session cookies from file
 */
function loadSession(email) {
    const sessionPath = path.join(SESSION_DIR, `${email}.json`);

    if (!fs.existsSync(sessionPath)) {
        console.log(chalk.yellow(`[API] No session file found for ${email}`));
        return null;
    }

    try {
        const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));

        // Check if session is expired
        if (session.timestamp && Date.now() - session.timestamp > SESSION_TIMEOUT_MS) {
            console.log(chalk.yellow(`[API] Session expired for ${email} (age: ${Math.round((Date.now() - session.timestamp) / 1000 / 60)} min)`));
            return null;
        }

        // Validate cookies exist and are not empty
        if (!session.cookies || !Array.isArray(session.cookies) || session.cookies.length === 0) {
            console.log(chalk.yellow(`[API] Invalid or empty cookies for ${email}`));
            return null;
        }

        // Check for essential session cookies (common session cookie names)
        const essentialCookieNames = ['laravel_session', 'XSRF-TOKEN', 'session', '_session_id'];
        const hasEssentialCookie = session.cookies.some(c =>
            essentialCookieNames.some(name => c.name.toLowerCase().includes(name.toLowerCase()))
        );

        if (!hasEssentialCookie) {
            console.log(chalk.yellow(`[API] No essential session cookie found for ${email}. Cookies: ${session.cookies.map(c => c.name).join(', ')}`));
            // Still return session but log warning - some sites may use different cookie names
        }

        const ageMinutes = Math.round((Date.now() - session.timestamp) / 1000 / 60);
        console.log(chalk.cyan(`[API] Loaded session for ${email} (age: ${ageMinutes} min, ${session.cookies.length} cookies)`));
        return session;
    } catch (e) {
        console.error(chalk.red(`[API] Error loading session for ${email}:`), e.message);
        return null;
    }
}

/**
 * Save session cookies to file
 */
function saveSession(email, cookies, csrfToken = null, accessToken = null) {
    const sessionPath = path.join(SESSION_DIR, `${email}.json`);

    const session = {
        cookies,
        csrfToken,
        accessToken,
        timestamp: Date.now()
    };

    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    console.log(chalk.green(`[API] Session saved for ${email}${accessToken ? ' (with token)' : ''}`));
}

/**
 * Create axios client with session cookies
 */
function createApiClient(session) {
    const cookieHeader = session.cookies
        .map(c => `${c.name}=${c.value}`)
        .join("; ");

    const headers = {
        "User-Agent": USER_AGENT,
        "Cookie": cookieHeader,
        "Origin": "https://monev.maganghub.kemnaker.go.id",
        "Referer": "https://monev.maganghub.kemnaker.go.id/dashboard",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": session.csrfToken || "",
        "X-Requested-With": "XMLHttpRequest"
    };

    // Add Bearer token if available
    if (session.accessToken) {
        headers["Authorization"] = `Bearer ${session.accessToken}`;
        console.log(chalk.cyan(`[API] Using Bearer token for authentication`));
    }

    return axios.create({
        headers,
        timeout: 30000
    });
}

/**
 * Check if user has submitted attendance for today
 * @returns {Object} { success: boolean, sudahAbsen: boolean, data: object|null, pesan: string }
 */
async function checkAttendanceStatus(email) {
    console.log(chalk.cyan(`[API] Checking attendance status for ${email}...`));

    const session = loadSession(email);
    if (!session) {
        return { success: false, needsLogin: true, pesan: "Session tidak ditemukan atau expired" };
    }

    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.DAILY_LOGS, {
            maxRedirects: 0, // Don't follow redirects - if redirected, it means session is invalid
            validateStatus: status => status >= 200 && status < 400 // Accept redirects as valid responses to handle them
        });

        // Check for redirect to login page (session expired)
        if (response.status === 302 || response.status === 301) {
            const location = response.headers?.location || '';
            console.log(chalk.yellow(`[API] Redirect detected: ${location}`));
            if (location.includes('login') || location.includes('auth')) {
                return { success: false, needsLogin: true, pesan: "Session expired - redirected to login" };
            }
        }

        if (response.status !== 200) {
            console.log(chalk.yellow(`[API] Unexpected status: ${response.status}`));
            return { success: false, needsLogin: true, pesan: `HTTP Error: ${response.status}` };
        }

        // Check if response contains login page HTML instead of JSON
        const contentType = response.headers?.['content-type'] || '';
        if (contentType.includes('text/html')) {
            console.log(chalk.yellow(`[API] Got HTML response instead of JSON - session invalid`));
            return { success: false, needsLogin: true, pesan: "Session expired - got HTML response" };
        }

        const logs = response.data?.data;

        if (!Array.isArray(logs)) {
            console.log(chalk.yellow(`[API] Invalid response format:`, typeof response.data));
            return { success: false, needsLogin: true, pesan: "Format response tidak valid" };
        }

        // Check if today's date exists in logs
        const today = new Date().toISOString().split("T")[0];
        const todayLog = logs.find(log => log.date === today);

        if (todayLog) {
            console.log(chalk.green(`[API] ✅ Found attendance for ${today}`));
            return { success: true, sudahAbsen: true, data: todayLog };
        } else {
            console.log(chalk.yellow(`[API] ❌ No attendance for ${today}`));
            return { success: true, sudahAbsen: false };
        }

    } catch (error) {
        // Check if it's an auth error (session expired)
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            return { success: false, needsLogin: true, pesan: "Session expired (401/403)" };
        }

        // Check for redirect errors (ERR_FR_TOO_MANY_REDIRECTS or ECONNABORTED on redirect)
        if (error.code === 'ERR_FR_TOO_MANY_REDIRECTS' ||
            (error.response && error.response.status >= 300 && error.response.status < 400)) {
            return { success: false, needsLogin: true, pesan: "Session expired - redirect loop" };
        }

        console.error(chalk.red(`[API] Error (${error.code || 'NO_CODE'}):`), error.message);
        return { success: false, needsLogin: true, pesan: error.message };
    }
}

/**
 * Submit daily attendance report via API
 * @returns {Object} { success: boolean, pesan: string }
 */
async function submitAttendanceReport(email, reportData) {
    console.log(chalk.cyan(`[API] Submitting attendance for ${email}...`));

    const session = loadSession(email);
    if (!session) {
        return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };
    }

    try {
        const client = createApiClient(session);

        // Format the date as YYYY-MM-DD
        const today = new Date().toISOString().split("T")[0];

        // Prepare the payload based on typical API structure
        const payload = {
            date: today,
            activity_log: reportData.aktivitas,
            lesson_learned: reportData.pembelajaran,
            obstacle: reportData.kendala || "Tidak ada kendala"
        };

        const response = await client.post(API_ENDPOINTS.DAILY_LOGS, payload);

        if (response.status === 200 || response.status === 201) {
            console.log(chalk.green(`[API] ✅ Attendance submitted successfully`));
            return {
                success: true,
                pesan: "Berhasil submit via API",
                pesan_tambahan: "(Fast Mode - API)"
            };
        } else {
            return { success: false, pesan: `Unexpected status: ${response.status}` };
        }

    } catch (error) {
        if (error.response) {
            const status = error.response.status;

            // Auth errors - need to re-login
            if (status === 401 || status === 403) {
                return { success: false, needsLogin: true, pesan: "Session expired" };
            }

            // Validation errors
            if (status === 422) {
                const errors = error.response.data?.errors || error.response.data?.message || "Validation failed";
                return { success: false, pesan: `Validasi gagal: ${JSON.stringify(errors)}` };
            }

            // Already submitted today
            if (status === 409 || (error.response.data?.message || "").toLowerCase().includes("already")) {
                return { success: true, sudahAbsen: true, pesan: "Sudah absen hari ini" };
            }
        }

        console.error(chalk.red("[API] Submit Error:"), error.message);
        return { success: false, needsLogin: true, pesan: error.message };
    }
}

/**
 * Scrape all daily logs and save to user's log file
 * @returns {Object} { success: boolean, count: number, path: string, pesan: string }
 */
async function scrapeAndSaveDailyLogs(email) {
    console.log(chalk.cyan(`[API] Scraping daily logs for ${email}...`));

    const session = loadSession(email);
    if (!session) {
        return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };
    }

    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.DAILY_LOGS);

        if (response.status === 200 && response.data?.data) {
            const logs = response.data.data;

            // Save to logs/email_logs.json
            // Sanitize email for filename
            const safeEmail = email.replace(/[^a-z0-9]/gi, '_');
            const logPath = path.join(LOGS_DIR, `${safeEmail}_logs.json`);

            fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
            console.log(chalk.green(`[API] ✅ Saved ${logs.length} logs for ${email}`));

            return {
                success: true,
                count: logs.length,
                path: logPath,
                pesan: `Berhasil menyimpan ${logs.length} log`
            };
        } else {
            return { success: false, pesan: `Gagal mengambil log. Status: ${response.status}` };
        }

    } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            return { success: false, needsLogin: true, pesan: "Session expired" };
        }
        console.error(chalk.red(`[API] Scrape Error:`), error.message);
        return { success: false, pesan: error.message };
    }
}

/**
 * Check if session is valid (quick ping test)
 */
async function isSessionValid(email) {
    const session = loadSession(email);
    if (!session) return false;

    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.DAILY_LOGS, { timeout: 10000 });
        return response.status === 200;
    } catch (e) {
        return false;
    }
}

/**
 * Delete session for email
 */
function clearSession(email) {
    const sessionPath = path.join(SESSION_DIR, `${email}.json`);
    if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
        console.log(chalk.yellow(`[API] Session cleared for ${email}`));
    }
}

module.exports = {
    loadSession,
    saveSession,
    checkAttendanceStatus,
    submitAttendanceReport,
    scrapeAndSaveDailyLogs,
    isSessionValid,
    clearSession
};
