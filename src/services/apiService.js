/**
 * API Service - Axios-based fast API client for MagangHub
 * Uses saved cookies from Puppeteer login for authentication
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const crypto = require("crypto");
const { SESSION_DIR, API_ENDPOINTS, API_BASE_URL, SESSION_TIMEOUT_MS, LOGS_DIR } = require("../config/constants");
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

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
function saveSession(email, cookies, csrfToken = null, accessToken = null, refreshToken = null, participantId = null) {
    const sessionPath = path.join(SESSION_DIR, `${email}.json`);

    const session = {
        cookies,
        csrfToken,
        accessToken,
        refreshToken,
        participantId,
        timestamp: Date.now()
    };

    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    console.log(chalk.green(`[API] Session saved for ${email}${accessToken ? ' (with access token)' : ''}${participantId ? ' (with participant ID)' : ''}`));
}

/**
 * Create axios client with session cookies
 */
function createApiClient(session) {
    const jar = new CookieJar();
    
    // Restore cookies to jar
    if (session.cookies && Array.isArray(session.cookies)) {
        session.cookies.forEach(c => {
            try {
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
        return false;
    }

    console.log(chalk.cyan(`[API] Attempting to refresh token for ${email}...`));

    try {
        const client = axios.create({
            headers: {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/json"
            }
        });

        const refreshUrl = "https://account.kemnaker.go.id/auth/refresh-token"; 
        
        const response = await client.post(refreshUrl, {
            refresh_token: session.refreshToken
        });

        if (response.status === 200 && response.data.access_token) {
            console.log(chalk.green(`[API] ✅ Token refreshed successfully!`));
            
            let newCookies = session.cookies;
            if (response.headers['set-cookie']) {
                const setCookie = response.headers['set-cookie'];
                setCookie.forEach(sc => {
                    const parts = sc.split(';')[0].split('=');
                    const name = parts[0];
                    const value = parts.slice(1).join('=');
                    
                    const existingIdx = newCookies.findIndex(c => c.name === name);
                    if (existingIdx >= 0) {
                        newCookies[existingIdx].value = value;
                    } else {
                        newCookies.push({ name, value, domain: 'account.kemnaker.go.id' });
                    }
                });
            }

            saveSession(
                email, 
                newCookies, 
                session.csrfToken, 
                response.data.access_token, 
                response.data.refresh_token || session.refreshToken,
                session.participantId
            );
            return true;
        }
    } catch (e) {
        console.log(chalk.red(`[API] Token refresh failed: ${e.message}`));
    }
    return false;
}

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
            'User-Agent': USER_AGENT,
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://account.kemnaker.go.id',
            'Referer': 'https://account.kemnaker.go.id/auth/login'
        }
    }));

    try {
        const pageRes = await client.get('https://account.kemnaker.go.id/auth/login');
        const csrfMatch = pageRes.data.match(/<meta name="csrf-token" content="([^"]+)">/);
        
        if (!csrfMatch) {
            throw new Error("CSRF token not found on login page");
        }
        
        const csrfToken = csrfMatch[1];
        client.defaults.headers.common['X-CSRF-TOKEN'] = csrfToken;

        const payload = {
            username: email,
            password: password,
            remember: true
        };

        const loginRes = await client.post('https://account.kemnaker.go.id/auth/login', payload);

        if (loginRes.status === 200 && loginRes.data.data?.authenticated) {
            console.log(chalk.green(`[API] ✅ Account Login Successful! Synchronizing SSO to Monev...`));
            
            try {
                const ssoRes = await client.get('https://monev.maganghub.kemnaker.go.id/login', {
                    headers: {
                        'Referer': 'https://monev.maganghub.kemnaker.go.id/',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    maxRedirects: 20,
                    validateStatus: null
                });
                
                const finalUrl = ssoRes.request.res.responseUrl;
                if (finalUrl.includes('/dashboard') || (finalUrl.includes('callback') && ssoRes.status === 200)) {
                    monevSuccess = true;
                    if (finalUrl.includes('callback')) {
                         await client.get('https://monev.maganghub.kemnaker.go.id/dashboard').catch(() => {});
                    }
                }
            } catch (e) {}

            const allCookies = [];
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
        return { success: false, pesan: error.message };
    }
}

async function checkAttendanceStatus(email) {
    console.log(chalk.cyan(`[API] Checking attendance status for ${email}...`));
    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.DAILY_LOGS, {
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 400
        });

        if (response.request?.res?.responseUrl) {
             const finalUrl = response.request.res.responseUrl;
             if (finalUrl.includes('login') || finalUrl.includes('auth')) {
                 return { success: false, needsLogin: true, pesan: "Session expired - redirected to login" };
             }
        }

        const logs = response.data?.data;
        if (!Array.isArray(logs)) return { success: false, needsLogin: true, pesan: "Format response tidak valid" };

        const today = new Date().toISOString().split("T")[0];
        const todayLog = logs.find(log => log.date === today);

        if (todayLog) {
            return { success: true, sudahAbsen: true, data: todayLog };
        } 
        
        // --- FALLBACK CHECK: Check for "Izin/Sakit" in Attendances Endpoint ---
        // Daily Logs ONLY contains "PRESENT" logs. "ON_LEAVE" (Izin/Sakit) are only in /api/attendances
        
        let participantId = session.participantId;
        if (!participantId && logs.length > 0) {
            participantId = logs[0].participant_id;
            // Optimistic update of session file with new participantId
            saveSession(email, session.cookies, session.csrfToken, session.accessToken, session.refreshToken, participantId);
        }

        if (participantId) {
             const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
             const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
             const attendancesUrl = `${API_BASE_URL}/api/attendances?participant_id=${participantId}&start_date=${startOfMonth}&end_date=${endOfMonth}`;
             
             try {
                 const attRes = await client.get(attendancesUrl);
                 if (attRes.status === 200 && attRes.data?.data) {
                     const attendances = attRes.data.data;
                     const todayAtt = attendances.find(a => a.date === today);
                     
                     if (todayAtt) {
                         // Check for non-present statuses that count as "Absen"
                         const validStatuses = ['ON_LEAVE', 'SICK', 'PERMIT', 'PRESENT']; 
                         if (validStatuses.includes(todayAtt.status)) {
                             return { success: true, sudahAbsen: true, data: todayAtt, isIzin: true };
                         }
                     }
                 }
             } catch (e) {
                 console.log(chalk.yellow(`[API] Failed to check detailed attendances: ${e.message}`));
             }
        }
        
        return { success: true, sudahAbsen: false };

    } catch (error) {
        return { success: false, needsLogin: true, pesan: error.message };
    }
}

async function submitAttendanceReport(email, reportData) {
    console.log(chalk.cyan(`[API] Submitting attendance for ${email}...`));
    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        const today = new Date().toISOString().split("T")[0];
        const payload = {
            date: today,
            status: "PRESENT",
            activity_log: reportData.aktivitas,
            lesson_learned: reportData.pembelajaran,
            obstacles: reportData.kendala || "Tidak ada kendala"
        };

        const response = await client.post(API_ENDPOINTS.SUBMIT_ATTENDANCE, payload);
        if (response.status === 200 || response.status === 201) {
            return { success: true, pesan: "Berhasil submit via API", pesan_tambahan: "(Fast Mode - API)" };
        } else {
            return { success: false, pesan: `Unexpected status: ${response.status}` };
        }
    } catch (error) {
        return { success: false, needsLogin: true, pesan: error.message };
    }
}

async function scrapeAndSaveDailyLogs(email) {
    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.DAILY_LOGS);

        if (response.status === 200 && response.data?.data) {
            const logs = response.data.data;
            const safeEmail = email.replace(/[^a-z0-9]/gi, '_');
            const logPath = path.join(LOGS_DIR, `${safeEmail}_logs.json`);
            fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
            return { success: true, count: logs.length, path: logPath };
        }
        return { success: false, pesan: "Gagal mengambil log" };
    } catch (error) {
        return { success: false, needsLogin: true, pesan: error.message };
    }
}

async function isSessionValid(email) {
    const session = loadSession(email);
    if (!session) return false;
    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.DAILY_LOGS, { timeout: 10000 });
        return response.status === 200;
    } catch (e) { return false; }
}

function clearSession(email) {
    const sessionPath = path.join(SESSION_DIR, `${email}.json`);
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
}

async function getAttendanceHistory(email, days = 1, retries = 2) {
    console.log(chalk.cyan(`[API] Getting ${days} day(s) attendance history for ${email}...`));
    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, logs: [], pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.DAILY_LOGS, { timeout: 60000 });
        if (response.status !== 200) return { success: false, needsLogin: true, logs: [], pesan: "Error fetching logs" };

        const allLogs = response.data?.data;
        if (!Array.isArray(allLogs)) return { success: false, logs: [], pesan: "Invalid format" };

        if (allLogs.length > 0 && allLogs[0].participant_id && !session.participantId) {
            session.participantId = allLogs[0].participant_id;
            saveSession(email, session.cookies, session.csrfToken, session.accessToken, session.refreshToken, session.participantId);
        }

        // Return all logs, the consumer will filter/process them as needed
        return { success: true, logs: allLogs };
    } catch (error) {
        if (retries > 0) return getAttendanceHistory(email, days, retries - 1);
        return { success: false, logs: [], pesan: error.message };
    }
}

async function getAttendances(email, startDate, endDate) {
    console.log(chalk.cyan(`[API] Fetching detailed attendances for ${email} (${startDate} to ${endDate})...`));
    let session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        if (!session.participantId) {
            const logsRes = await client.get(API_ENDPOINTS.DAILY_LOGS);
            if (logsRes.data?.data?.length > 0) {
                session.participantId = logsRes.data.data[0].participant_id;
                saveSession(email, session.cookies, session.csrfToken, session.accessToken, session.refreshToken, session.participantId);
            } else throw new Error("Could not find participant_id");
        }

        const url = `${API_BASE_URL}/api/attendances?participant_id=${session.participantId}&start_date=${startDate}&end_date=${endDate}`;
        const response = await client.get(url);
        if (response.status === 200 && response.data?.data) return { success: true, data: response.data.data };
        return { success: false, pesan: "Gagal mengambil data" };
    } catch (error) {
        return { success: false, needsLogin: error.response?.status === 401, pesan: error.message };
    }
}

/**
 * Get monthly reports for a user
 */
async function getMonthlyReports(email) {
    console.log(chalk.cyan(`[API] Fetching monthly reports for ${email}...`));
    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        
        // Get participant_id if not in session
        if (!session.participantId) {
            const logsRes = await client.get(API_ENDPOINTS.DAILY_LOGS);
            if (logsRes.data?.data?.length > 0) {
                session.participantId = logsRes.data.data[0].participant_id;
                saveSession(email, session.cookies, session.csrfToken, session.accessToken, session.refreshToken, session.participantId);
            } else throw new Error("Could not find participant_id");
        }

        const url = `${API_ENDPOINTS.MONTHLY_REPORTS}?participant_id=${session.participantId}`;
        const response = await client.get(url);
        
        if (response.status === 200 && response.data?.data) {
            return { success: true, data: response.data.data };
        }
        return { success: false, pesan: "Gagal mengambil laporan bulanan" };
    } catch (error) {
        return { success: false, needsLogin: error.response?.status === 401, pesan: error.message };
    }
}

/**
 * Get user announcements
 */
async function getAnnouncements(email) {
    console.log(chalk.cyan(`[API] Fetching announcements for ${email}...`));
    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.ANNOUNCEMENTS);
        
        if (response.status === 200 && response.data?.data) {
            return { success: true, data: response.data.data };
        }
        return { success: false, pesan: "Gagal mengambil pengumuman" };
    } catch (error) {
        return { success: false, needsLogin: error.response?.status === 401, pesan: error.message };
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
    getAttendances,
    getMonthlyReports,
    getAnnouncements,
    directLogin,
    createApiClient
};