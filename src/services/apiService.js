/**
 * API Service - Axios-based fast API client for MagangHub
 * Uses saved cookies from Puppeteer login for authentication
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const crypto = require("crypto");
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

        // Flag if session is technically "stale" but let's try it anyway
        const isStale = (session.timestamp && Date.now() - session.timestamp > SESSION_TIMEOUT_MS);

        // Validate cookies exist and are not empty
        if (!session.cookies || !Array.isArray(session.cookies) || session.cookies.length === 0) {
            console.log(chalk.yellow(`[API] Invalid or empty cookies for ${email}`));
            return null;
        }

        const ageMinutes = Math.round((Date.now() - session.timestamp) / 1000 / 60);
        if (isStale) {
            console.log(chalk.yellow(`[API] Session stale for ${email} (${ageMinutes} min), but attempting reuse...`));
        } else {
            console.log(chalk.cyan(`[API] Session loaded: ${email}`));
        }
        return session;
    } catch (e) {
        console.error(chalk.red(`[API] Error loading session for ${email}:`), e.message);
        return null;
    }
}

/**
 * Save session cookies to file
 */
function saveSession(email, cookies, csrfToken = null, accessToken = null, refreshToken = null) {
    const sessionPath = path.join(SESSION_DIR, `${email}.json`);

    const session = {
        cookies,
        csrfToken,
        accessToken,
        refreshToken,
        timestamp: Date.now()
    };

    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    console.log(chalk.green(`[API] Session saved for ${email}${accessToken ? ' (with access token)' : ''}${refreshToken ? ' (with refresh token)' : ''}`));
}

/**
 * Create axios client with session cookies
 */
function createApiClient(session) {
    const jar = new CookieJar();
    
    // Restore cookies to jar
    if (session.cookies && Array.isArray(session.cookies)) {
        session.cookies.forEach(c => {
            // tough-cookie expects a certain structure, or we can use setCookie
            // But let's try to reconstruct manually if needed
            // The simplest way is to manually set them if we know the URL
            // But we have cookies for different domains.
            try {
                // Ensure domain is present (strip leading dot if needed)
                let domain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
                const cookieStr = `${c.name}=${c.value}`;
                jar.setCookieSync(cookieStr, `https://${domain}`);
            } catch (e) {
                // Ignore invalid cookies
            }
        });
    }

    const headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "Origin": "https://monev.maganghub.kemnaker.go.id",
        "Referer": "https://monev.maganghub.kemnaker.go.id/dashboard",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": session.csrfToken || "",
        "X-Requested-With": "XMLHttpRequest",
        "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"'
    };

    // Add Bearer token if available
    if (session.accessToken) {
        headers["Authorization"] = `Bearer ${session.accessToken}`;
    }

    return wrapper(axios.create({
        jar,
        withCredentials: true,
        headers,
        timeout: 30000
    }));
}

/**
 * Attempt to refresh the session using the refresh token
 */
async function refreshSession(email) {
    const session = loadSession(email);
    if (!session || !session.refreshToken) {
        console.log(chalk.yellow(`[API] No refresh token available for ${email}`));
        return false;
    }

    console.log(chalk.cyan(`[API] Attempting to refresh token for ${email}...`));

    try {
        // Experimental: Try common refresh endpoints
        // Note: This is a guess. We need to identify the real endpoint.
        const client = axios.create({
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
                "Content-Type": "application/json"
            }
        });

        // This URL is a guess based on the login URL
        const refreshUrl = "https://account.kemnaker.go.id/auth/refresh-token"; 
        
        const response = await client.post(refreshUrl, {
            refresh_token: session.refreshToken
        });

        if (response.status === 200 && response.data.access_token) {
            console.log(chalk.green(`[API] ✅ Token refreshed successfully!`));
            
            // Update cookies if provided
            let newCookies = session.cookies;
            if (response.headers['set-cookie']) {
                const cookieParser = require('cookie'); // Ensure this is available or parse manually
                const setCookie = response.headers['set-cookie'];
                
                // Simple parser for set-cookie array to object-like structure for storage
                setCookie.forEach(sc => {
                    const parts = sc.split(';')[0].split('=');
                    const name = parts[0];
                    const value = parts.slice(1).join('=');
                    
                    // Update or add
                    const existingIdx = newCookies.findIndex(c => c.name === name);
                    if (existingIdx >= 0) {
                        newCookies[existingIdx].value = value;
                    } else {
                        newCookies.push({ name, value, domain: 'account.kemnaker.go.id' });
                    }
                });
            }

            // Update session
            saveSession(
                email, 
                newCookies, 
                session.csrfToken, 
                response.data.access_token, 
                response.data.refresh_token || session.refreshToken
            );
            return true;
        }
    } catch (e) {
        console.log(chalk.red(`[API] Token refresh failed: ${e.message}`));
        if (e.response) {
            console.log(chalk.red(`[API] Response: ${e.response.status} - ${JSON.stringify(e.response.data)}`));
        }
    }
    return false;
}

const { Wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

/**
 * Direct API Login (Bypasses Puppeteer)
 */
async function directLogin(email, password) {
    console.log(chalk.cyan(`[API] Attempting Direct Login for ${email}...`));
    let monevSuccess = false;

    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://account.kemnaker.go.id',
            'Referer': 'https://account.kemnaker.go.id/auth/login'
        }
    }));

    try {
        // 1. GET Login Page for CSRF
        const pageRes = await client.get('https://account.kemnaker.go.id/auth/login');
        const csrfMatch = pageRes.data.match(/<meta name="csrf-token" content="([^"]+)">/);
        
        if (!csrfMatch) {
            throw new Error("CSRF token not found on login page");
        }
        
        const csrfToken = csrfMatch[1];
        client.defaults.headers.common['X-CSRF-TOKEN'] = csrfToken;

        // 2. POST Login
        const payload = {
            username: email,
            password: password,
            remember: true
        };

        const loginRes = await client.post('https://account.kemnaker.go.id/auth/login', payload);

        if (loginRes.status === 200 && loginRes.data.data?.authenticated) {
            console.log(chalk.green(`[API] ✅ Account Login Successful! Synchronizing SSO to Monev...`));
            
            // 3. SSO Handshake to Monev
            try {
                console.log(chalk.cyan(`[API] Initiating Natural SSO Handshake...`));
                
                // Hit the Monev login page. It should redirect to Account SSO -> Callback -> Dashboard
                // We use the same client which has the Account cookies.
                const ssoRes = await client.get('https://monev.maganghub.kemnaker.go.id/login', {
                    headers: {
                        'Referer': 'https://monev.maganghub.kemnaker.go.id/',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    maxRedirects: 20,
                    validateStatus: null // Capture any status to debug
                });
                
                const finalUrl = ssoRes.request.res.responseUrl;
                console.log(chalk.cyan(`[API] SSO Final URL: ${finalUrl}`));
                
                // If we ended up at dashboard or callback (with 200 OK), we are good
                if (finalUrl.includes('/dashboard') || (finalUrl.includes('callback') && ssoRes.status === 200)) {
                    console.log(chalk.green(`[API] ✅ SSO Handshake Complete! Monev Activated.`));
                    monevSuccess = true;
                    
                    // Final nudge if at callback
                    if (finalUrl.includes('callback')) {
                         await client.get('https://monev.maganghub.kemnaker.go.id/dashboard').catch(() => {});
                    }
                } else {
                    console.log(chalk.yellow(`[API] SSO Handshake landed on: ${finalUrl}`));
                }
            } catch (e) {
                console.log(chalk.red(`[API] SSO Handshake Error: ${e.message}`));
            }

            // Extract all cookies from the jar
            const allCookies = [];
            // Get all domains from the jar to be safe
            const domains = ['account.kemnaker.go.id', 'monev.maganghub.kemnaker.go.id', 'kemnaker.go.id', 'siapkerja.kemnaker.go.id'];
            
            for (const domain of domains) {
                const domainCookies = await jar.getCookies('https://' + domain);
                domainCookies.forEach(c => {
                    allCookies.push({
                        name: c.key,
                        value: c.value,
                        domain: c.domain || domain,
                        path: c.path || '/',
                        httpOnly: c.httpOnly,
                        secure: c.secure
                    });
                });
            }

            saveSession(email, allCookies, csrfToken);

            if (!monevSuccess) {
                 return { success: false, pesan: "SSO Handshake failed - fallback to puppeteer may be needed" };
            }
            return { success: true };
        } else {
            throw new Error(`Login failed. Status: ${loginRes.status}`);
        }

    } catch (error) {
        console.error(chalk.red(`[API] Direct Login Error:`), error.message);
        return { success: false, pesan: error.message };
    }
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
            maxRedirects: 5, // Allow following redirects for SSO
            validateStatus: status => status >= 200 && status < 400
        });

        // Check for redirect to login page (session expired)
        // Note: With maxRedirects, we might end up at the login page content (200 OK but HTML)
        // or a final redirect URL that is the login page.
        if (response.request && response.request.res && response.request.res.responseUrl) {
             const finalUrl = response.request.res.responseUrl;
             if (finalUrl.includes('login') || finalUrl.includes('auth')) {
                 // Try Direct Login
                 console.log(chalk.yellow(`[API] Redirected to login: ${finalUrl}`));
                 if (await refreshSession(email)) { // We can reuse refreshSession logic but directLogin is better call
                      // Actually refreshSession is empty/broken without token.
                      // Let's just return needsLogin to trigger the main loop in magang.js
                      return { success: false, needsLogin: true, pesan: "Session expired - redirected to login" };
                 }
                 return { success: false, needsLogin: true, pesan: "Session expired - redirected to login" };
             }
        }

        if (response.status !== 200) {
            console.log(chalk.yellow(`[API] Unexpected status: ${response.status}`));
            if (response.status === 401 || response.status === 403) {
                 if (await refreshSession(email)) {
                    return checkAttendanceStatus(email); // Retry
                }
            }
            return { success: false, needsLogin: true, pesan: `HTTP Error: ${response.status}` };
        }

        // Check if response contains login page HTML instead of JSON
        const contentType = response.headers?.['content-type'] || '';
        if (contentType.includes('text/html')) {
            console.log(chalk.yellow(`[API] Got HTML response instead of JSON - session invalid`));
             if (await refreshSession(email)) {
                return checkAttendanceStatus(email); // Retry
            }
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
             if (await refreshSession(email)) {
                return checkAttendanceStatus(email); // Retry
            }
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
            status: "PRESENT",
            activity_log: reportData.aktivitas,
            lesson_learned: reportData.pembelajaran,
            obstacles: reportData.kendala || "Tidak ada kendala"
        };

        const response = await client.post(API_ENDPOINTS.SUBMIT_ATTENDANCE, payload);

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

/**
 * Get attendance history for specified number of days
 * @param {string} email - User email
 * @param {number} days - Number of days to fetch (default: 1 = yesterday)
 * @returns {Object} { success: boolean, logs: array, pesan: string }
 */
async function getAttendanceHistory(email, days = 1, retries = 2) {
    console.log(chalk.cyan(`[API] Getting ${days} day(s) attendance history for ${email}...`));

    const session = loadSession(email);
    if (!session) {
        return { success: false, needsLogin: true, logs: [], pesan: "Session tidak ditemukan" };
    }

    try {
        const client = createApiClient(session);
        // Increase timeout for history fetch
        const response = await client.get(API_ENDPOINTS.DAILY_LOGS, {
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400,
            timeout: 60000
        });

        if (response.status !== 200) {
            return { success: false, needsLogin: true, logs: [], pesan: `HTTP Error: ${response.status}` };
        }

        const contentType = response.headers?.['content-type'] || '';
        if (contentType.includes('text/html')) {
            return { success: false, needsLogin: true, logs: [], pesan: "Session expired" };
        }

        const allLogs = response.data?.data;
        if (!Array.isArray(allLogs)) {
            return { success: false, logs: [], pesan: "Format response tidak valid" };
        }

        // Filter logs for the last N days
        const today = new Date();
        const filteredLogs = [];

        for (let i = 1; i <= days; i++) {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() - i);
            const dateStr = targetDate.toISOString().split("T")[0];

            const log = allLogs.find(l => l.date === dateStr);
            if (log) {
                filteredLogs.push(log);
            } else {
                // Add placeholder for missing days
                filteredLogs.push({ date: dateStr, activity_log: null, missing: true });
            }
        }

        console.log(chalk.green(`[API] Found ${filteredLogs.filter(l => !l.missing).length}/${days} days of history`));
        return { success: true, logs: filteredLogs };

    } catch (error) {
        // Retry logic for timeouts
        if ((error.code === 'ECONNABORTED' || error.message.includes('timeout')) && retries > 0) {
            console.log(chalk.yellow(`[API] History request timed out, retrying... (${retries} attempts left)`));
            return getAttendanceHistory(email, days, retries - 1);
        }

        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            return { success: false, needsLogin: true, logs: [], pesan: "Session expired" };
        }
        console.error(chalk.red(`[API] Error getting history:`), error.message);
        return { success: false, logs: [], pesan: error.message };
    }
}

module.exports = {
    loadSession,
    saveSession,
    checkAttendanceStatus,
    submitAttendanceReport,
    scrapeAndSaveDailyLogs,
    isSessionValid,
    clearSession,
    getAttendanceHistory,
    directLogin,
    createApiClient
};
