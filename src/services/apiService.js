/**
 * API Service - Axios-based fast API client for MagangHub
 * Uses saved cookies from Puppeteer login for authentication
 */

import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import crypto from "node:crypto";
import { SESSION_DIR, API_ENDPOINTS, API_BASE_URL, SESSION_TIMEOUT_MS, LOGS_DIR } from "../config/constants.js";
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

// In-memory Session Cache
const sessionCache = new Map();

// Ensure directories exist
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Load session cookies from memory or file
 */
function loadSession(email) {
    // 1. Try Memory first
    if (sessionCache.has(email)) {
        return sessionCache.get(email);
    }

    // 2. Fallback to Disk
    const sessionPath = path.join(SESSION_DIR, `${email}.json`);

    if (!fs.existsSync(sessionPath)) {
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
            console.log(chalk.cyan(`[API] Session loaded from DISK: ${email}`));
        }

        // Save to memory for next time
        sessionCache.set(email, session);
        return session;
    } catch (e) {
        console.error(chalk.red(`[API] Error loading session for ${email}:`), e.message);
        return null;
    }
}

/**
 * Save session cookies to memory and file
 */
function saveSession(email, cookies, csrfToken = null, accessToken = null, refreshToken = null, participantId = null) {
    const sessionPath = path.join(SESSION_DIR, `${email}.json`);

    // Load existing session to merge data (don't overwrite with nulls)
    let existingSession = loadSession(email) || {};

    const session = {
        cookies: cookies || existingSession.cookies,
        csrfToken: csrfToken || existingSession.csrfToken,
        accessToken: accessToken || existingSession.accessToken,
        refreshToken: refreshToken || existingSession.refreshToken,
        participantId: participantId || existingSession.participantId,
        timestamp: Date.now()
    };

    // Update Memory
    sessionCache.set(email, session);

    // Persist to Disk (non-blocking)
    fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf8', (err) => {
        if (err) console.error(chalk.red(`[API] Session write error for ${email}:`), err.message);
    });
    console.log(chalk.green(`[API] Session saved for ${email}${session.accessToken ? ' (with access token)' : ''}${session.participantId ? ' (with participant ID)' : ''}`));
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

    const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        headers,
        timeout: 30000
    }));

    // Dynamic origin/referer based on URL
    client.interceptors.request.use(config => {
        const url = config.url || "";
        if (url.includes('maganghub.kemnaker.go.id') && !url.includes('monev.')) {
            config.headers['Origin'] = 'https://maganghub.kemnaker.go.id';
            config.headers['Referer'] = 'https://maganghub.kemnaker.go.id/my/profil?tab=tentang';
        } else {
            config.headers['Origin'] = 'https://monev.maganghub.kemnaker.go.id';
            config.headers['Referer'] = 'https://monev.maganghub.kemnaker.go.id/dashboard';
        }
        return config;
    });

    return client;
}

/**
 * Ensure participantId is available in the session.
 * Fetches from DAILY_LOGS if not cached yet.
 */
async function ensureParticipantId(email, client, session) {
    if (session.participantId) return session.participantId;

    const logsRes = await client.get(API_ENDPOINTS.DAILY_LOGS);
    if (logsRes.data?.data?.length > 0) {
        session.participantId = logsRes.data.data[0].participant_id;
        saveSession(email, session.cookies, session.csrfToken, session.accessToken, session.refreshToken, session.participantId);
        return session.participantId;
    }
    throw new Error("Could not find participant_id");
}

/**
 * Get simple slug from name
 */
function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

/**
 * Sync user profile data (name, slug) to database
 */
async function syncProfileToDb(email) {
    try {
        const { getAllUsers, updateUsers } = await import('./database.js');
        
        // Use getUserProfile function exported from this file
        const profileRes = await getUserProfile(email);
        if (profileRes.success && profileRes.data) {
            const data = Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data;
            if (data && data.nama) {
                const allUsers = getAllUsers();
                const uIdx = allUsers.findIndex(u => u.email === email);
                if (uIdx !== -1) {
                    let changed = false;
                    if (!allUsers[uIdx].name || allUsers[uIdx].name !== data.nama) {
                        allUsers[uIdx].name = data.nama;
                        changed = true;
                    }
                    const newSlug = slugify(data.nama);
                    if (!allUsers[uIdx].slug || allUsers[uIdx].slug !== newSlug) {
                        allUsers[uIdx].slug = newSlug;
                        changed = true;
                    }
                    if (changed) {
                        await updateUsers(allUsers);
                        console.log(chalk.green(`[API:SYNC] Profile synced for ${email}: ${data.nama} (Slug: ${newSlug})`));
                    }
                }
            }
        }
    } catch (e) {
        console.error(chalk.red(`[API:SYNC] Failed to sync profile for ${email}:`), e.message);
    }
}

/**
 * Fast API login - Skip Puppeteer if possible
 * Performs the full 3-step OIDC flow to get access and refresh tokens
 */
async function directLogin(email, password) {
    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://account.kemnaker.go.id'
        }
    }));

    try {
        console.log(chalk.cyan(`[API] Attempting Direct Login for ${email}...`));

        // 1. Get CSRF Token
        const loginPage = await client.get('https://account.kemnaker.go.id/auth/login');
        const csrfMatch = loginPage.data.match(/<meta name="csrf-token" content="([^"]+)">/);
        if (!csrfMatch) throw new Error("Could not find CSRF token");
        const csrfToken = csrfMatch[1];

        // 2. POST Login to Account
        const loginRes = await client.post('https://account.kemnaker.go.id/auth/login', {
            username: email,
            password: password,
            remember: true
        }, {
            headers: { 'X-CSRF-TOKEN': csrfToken }
        });

        if (loginRes.status === 200 && loginRes.data.data?.authenticated) {
            console.log(chalk.green(`[API] ✅ Account Login Successful! Synchronizing SSO to Monev...`));

            let monevSuccess = false;
            let accessToken = null;
            let refreshToken = null;

            try {
                // 3. Trigger OIDC Authorization
                // client_id is constant for Monev app
                const clientId = "79230891-cc02-43c8-964c-b525bce27857";
                const authUrl = `https://account.kemnaker.go.id/auth?client_id=${clientId}&redirect_uri=https%3A%2F%2Fmonev.maganghub.kemnaker.go.id%2Fsso%2Fcallback&response_type=code&scope=basic%20email`;

                const authRes = await client.get(authUrl, {
                    maxRedirects: 0,
                    validateStatus: (s) => s === 302
                });

                const callbackUrl = authRes.headers.location;
                const codeMatch = callbackUrl?.match(/code=([^&]+)/);

                if (codeMatch) {
                    const code = codeMatch[1];

                    // 4. Exchange Code for Tokens
                    const exchangeUrl = `https://monev-api.maganghub.kemnaker.go.id/authenticate/login/callback?code=${code}`;
                    const exchangeRes = await client.get(exchangeUrl, {
                        headers: {
                            'Origin': 'https://monev.maganghub.kemnaker.go.id',
                            'Referer': 'https://monev.maganghub.kemnaker.go.id/'
                        }
                    });

                    if (exchangeRes.data && exchangeRes.data.access_token) {
                        accessToken = exchangeRes.data.access_token;
                        refreshToken = exchangeRes.data.refresh_token;
                        monevSuccess = true;
                        console.log(chalk.green(`[API] 🔥 SSO Synchronized via API (No Browser!)`));
                    }
                }
            } catch (e) {
                console.log(chalk.yellow(`[API] SSO handshake failed via API: ${e.message}. Fallback to browser cookies sync may occur.`));
            }

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

            saveSession(email, allCookies, csrfToken, accessToken, refreshToken);

            // Sync profile data asynchronously
            syncProfileToDb(email).catch(() => {});

            return {
                success: true,
                sso_completed: monevSuccess,
                pesan: monevSuccess ? "Login & SSO Berhasil (API)" : "Account Login Berhasil (SSO menyusul via browser)"
            };
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

        const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Makassar' }).split(',')[0];
        const todayLog = logs.find(log => log.date === today);

        if (todayLog) {
            return { success: true, sudahAbsen: true, data: todayLog };
        }

        // --- FALLBACK CHECK: Check for "Izin/Sakit" in Attendances Endpoint ---
        // Daily Logs ONLY contains "PRESENT" logs. "ON_LEAVE" (Izin/Sakit) are only in /api/attendances

        let participantId = session.participantId || (logs.length > 0 ? logs[0].participant_id : null);
        if (participantId && !session.participantId) {
            session.participantId = participantId;
            saveSession(email, session.cookies, session.csrfToken, session.accessToken, session.refreshToken, participantId);
        }

        if (participantId) {
            const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleString('en-CA', { timeZone: 'Asia/Makassar' }).split(',')[0];
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleString('en-CA', { timeZone: 'Asia/Makassar' }).split(',')[0];
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

async function submitAttendanceReport(email, reportData, isSimulation = false) {
    console.log(chalk.cyan(`[API] Submitting attendance for ${email}...`));

    if (isSimulation) {
        console.log(chalk.magenta(`[API-SIMULATION] Simulated submission success for ${email}`));
        await new Promise(r => setTimeout(r, 1500)); // Simulate network delay
        return { success: true, pesan: "SIMULASI BERHASIL! (Laporan TIDAK dikirim ke server asli)", pesan_tambahan: "(Simulation Mode)" };
    }

    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Makassar' }).split(',')[0];
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
    sessionCache.delete(email);
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
        await ensureParticipantId(email, client, session);

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
        await ensureParticipantId(email, client, session);

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

/**
 * Get detailed participant profile (includes mentor info)
 */
async function getParticipantProfile(email) {
    console.log(chalk.cyan(`[API] Fetching participant profile for ${email}...`));
    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        await ensureParticipantId(email, client, session);

        const url = `${API_BASE_URL}/api/participants/${session.participantId}`;
        const response = await client.get(url);

        if (response.status === 200 && response.data?.data) {
            return { success: true, data: response.data.data };
        }
        return { success: false, pesan: "Gagal mengambil profil peserta" };
    } catch (error) {
        return { success: false, needsLogin: error.response?.status === 401, pesan: error.message };
    }
}

/**
 * Get current user profile (alternative to participant profile)
 */
async function getUserProfile(email) {
    console.log(chalk.cyan(`[API] Fetching user/me profile for ${email}...`));
    const session = loadSession(email);
    if (!session) return { success: false, needsLogin: true, pesan: "Session tidak ditemukan" };

    try {
        const client = createApiClient(session);
        const response = await client.get(API_ENDPOINTS.USER_ME);

        if (response.status === 200 && response.data?.data) {
            const profileData = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
            if (profileData && profileData.nama) {
                // Inline sync to avoid circular dependency or missing calls
                syncProfileToDbFromData(email, profileData).catch(() => {});
            }
            return { success: true, data: response.data.data };
        }
        return { success: false, pesan: "Gagal mengambil profil user" };
    } catch (error) {
        return { success: false, needsLogin: error.response?.status === 401, pesan: error.message };
    }
}

/**
 * Internal helper to sync profile without re-fetching
 */
async function syncProfileToDbFromData(email, data) {
    try {
        const { getAllUsers, updateUsers } = await import('./database.js');
        const nameCandidate = data?.name || data?.nama;
        
        if (nameCandidate) {
            const allUsers = getAllUsers();
            const uIdx = allUsers.findIndex(u => u.email === email);
            if (uIdx !== -1) {
                let changed = false;
                if (!allUsers[uIdx].name || allUsers[uIdx].name !== nameCandidate) {
                    allUsers[uIdx].name = nameCandidate;
                    changed = true;
                }
                const newSlug = slugify(nameCandidate);
                if (!allUsers[uIdx].slug || allUsers[uIdx].slug !== newSlug) {
                    allUsers[uIdx].slug = newSlug;
                    changed = true;
                }
                if (changed) {
                    await updateUsers(allUsers);
                    console.log(chalk.green(`[API:SYNC] Profile updated for ${email}: ${nameCandidate}`));
                }
            }
        }
    } catch (e) {
        console.error(`[API:SYNC] Error in syncProfileToDbFromData:`, e.message);
    }
}

export {
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
    getParticipantProfile,
    getUserProfile,
    directLogin,
    createApiClient,
    slugify
};
