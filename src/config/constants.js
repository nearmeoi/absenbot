require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const chalk = require('chalk');

// ========================================
// KONFIGURASI ADMIN
// ========================================

// Nomor admin (format: '628xxx@s.whatsapp.net')
const ADMIN_NUMBERS = process.env.ADMIN_NUMBERS
    ? process.env.ADMIN_NUMBERS.split(',').map(n => n.trim())
    : [];

const APP_URL = process.env.APP_URL || 'https://app.monev-absenbot.my.id';

// Prefix perintah bot (default: !)
const BOT_PREFIX = process.env.BOT_PREFIX || '!';

// ========================================
// DETEKSI LINGKUNGAN
// ========================================

/**
 * Deteksi lingkungan runtime saat ini
 * @returns {'termux' | 'windows' | 'vps' | 'linux' | 'macos' | 'unknown'}
 */
const deteksiEnv = () => {
    if (process.env.ENVIRONMENT) {
        return process.env.ENVIRONMENT.toLowerCase();
    }

    if (process.env.TERMUX_VERSION ||
        process.env.PREFIX?.includes('com.termux') ||
        fs.existsSync('/data/data/com.termux/files/usr')) {
        return 'termux';
    }

    const platform = process.platform;

    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'macos';

    if (platform === 'linux') {
        const tanpaDisplay = !process.env.DISPLAY;
        const viaSSH = process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION;
        const diDocker = fs.existsSync('/.dockerenv');
        const diContainer = process.env.container || diDocker;

        if (viaSSH || tanpaDisplay || diContainer) return 'vps';
        return 'linux';
    }

    return 'unknown';
};

const ENV_SAAT_INI = deteksiEnv();

// ========================================
// KONFIGURASI PER LINGKUNGAN
// ========================================

const DAFTAR_ENV = {
    termux: {
        name: 'Termux (Android)',
        chromiumPaths: [
            '/data/data/com.termux/files/usr/bin/chromium-browser',
            '/data/data/com.termux/files/usr/bin/chromium'
        ],
        defaultProjectRoot: '/data/data/com.termux/files/home/absenbot',
        puppeteerArgs: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
            '--disable-dev-shm-usage', '--single-process', '--no-zygote'
        ],
        headless: 'new'
    },
    windows: {
        name: 'Windows',
        chromiumPaths: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Program Files\\Chromium\\Application\\chromium.exe'
        ],
        defaultProjectRoot: process.cwd(),
        puppeteerArgs: [
            '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
            '--disable-default-apps', '--disable-extensions', '--disable-sync', '--no-first-run'
        ],
        headless: 'new'
    },
    vps: {
        name: 'VPS/Server (Linux)',
        chromiumPaths: [
            '/usr/bin/chromium-browser', '/usr/bin/chromium',
            '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
            '/snap/bin/chromium'
        ],
        defaultProjectRoot: process.cwd(),
        puppeteerArgs: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--single-process', '--no-zygote',
            '--disable-gpu', '--disable-accelerated-2d-canvas', '--disable-canvas-aa',
            '--disable-2d-canvas-clip-aa', '--disable-gl-drawing-for-tests',
            '--disable-software-rasterizer',
            '--disable-background-networking', '--disable-default-apps',
            '--disable-extensions', '--disable-sync', '--disable-translate',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process',
            '--disable-ipc-flooding-protection', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--js-flags=--max-old-space-size=128', '--memory-pressure-off',
            '--no-first-run', '--hide-scrollbars', '--mute-audio'
        ],
        headless: 'new'
    },
    linux: {
        name: 'Linux Desktop',
        chromiumPaths: [
            '/usr/bin/chromium-browser', '/usr/bin/chromium',
            '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
            '/snap/bin/chromium'
        ],
        defaultProjectRoot: process.cwd(),
        puppeteerArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        headless: 'new'
    },
    macos: {
        name: 'macOS',
        chromiumPaths: [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ],
        defaultProjectRoot: process.cwd(),
        puppeteerArgs: ['--disable-gpu', '--no-first-run'],
        headless: 'new'
    },
    unknown: {
        name: 'Unknown',
        chromiumPaths: ['/usr/bin/chromium-browser'],
        defaultProjectRoot: process.cwd(),
        puppeteerArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: 'new'
    }
};

// Konfigurasi untuk lingkungan saat ini
const KONFIG_ENV = DAFTAR_ENV[ENV_SAAT_INI] || DAFTAR_ENV.unknown;

// ========================================
// RESOLUSI PATH
// ========================================

/**
 * Cari path Chromium yang tersedia
 */
const ambilPathChromium = () => {
    if (process.env.CHROMIUM_PATH) {
        if (fs.existsSync(process.env.CHROMIUM_PATH)) {
            return process.env.CHROMIUM_PATH;
        }
        console.warn(`[CONFIG] ⚠️ CHROMIUM_PATH tidak ditemukan: ${process.env.CHROMIUM_PATH}`);
    }

    for (const chromePath of KONFIG_ENV.chromiumPaths) {
        if (fs.existsSync(chromePath)) {
            return chromePath;
        }
    }

    console.warn(`[CONFIG] ⚠️ Chromium tidak ditemukan, pakai fallback: ${KONFIG_ENV.chromiumPaths[0]}`);
    return KONFIG_ENV.chromiumPaths[0];
};

/**
 * Ambil root directory proyek
 */
const ambilRootProyek = () => {
    if (process.env.PROJECT_ROOT) return process.env.PROJECT_ROOT;
    return process.cwd();
};

// ========================================
// PATH YANG SUDAH DIRESOLUSI
// ========================================

const ROOT_PROYEK = ambilRootProyek();

// API Endpoints untuk MagangHub
const API_BASE_URL = 'https://monev.maganghub.kemnaker.go.id';
const SIAPKERJA_URL = 'https://siapkerja.kemnaker.go.id';
const API_ENDPOINTS = {
    DAILY_LOGS: `${API_BASE_URL}/api/daily-logs`,
    SUBMIT_ATTENDANCE: `${API_BASE_URL}/api/attendances/with-daily-log`,
    DASHBOARD: `${API_BASE_URL}/dashboard`,
    SIAPKERJA_HOME: `${SIAPKERJA_URL}/app/home`,
    LOGIN_URL: `https://account.kemnaker.go.id/auth/login`,
    MONTHLY_REPORTS: `${API_BASE_URL}/api/monthly-reports`,
    ANNOUNCEMENTS: `${API_BASE_URL}/api/announcements/users`,
    USER_ME: `${API_BASE_URL}/api/users/me`
};

// Timeout sesi (default 24 jam)
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS) || 24 * 60 * 60 * 1000;

// ========================================
// INFO LINGKUNGAN
// ========================================

const tampilEnv = () => {
    console.log(`\n🌍 ${KONFIG_ENV.name} | ${ENV_SAAT_INI} | Node ${process.version}`);
    console.log(`   Root: ${ROOT_PROYEK} | Chromium: ${ambilPathChromium()}\n`);
};

if (process.env.SILENT_STARTUP !== 'true') {
    tampilEnv();
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
    // Info lingkungan (nama baru)
    ENV_SAAT_INI,
    KONFIG_ENV,
    deteksiEnv,
    tampilEnv,

    // Path (nama baru)
    ROOT_PROYEK,
    DIR_SESI: path.join(ROOT_PROYEK, 'sessions'),
    DIR_TEMP: path.join(ROOT_PROYEK, 'temp'),
    FILE_USER: path.join(ROOT_PROYEK, 'users.json'),
    FILE_GRUP: path.join(ROOT_PROYEK, 'data', 'group_id.txt'),
    DIR_AUTH: path.join(ROOT_PROYEK, 'SesiWA'),
    DIR_LOG: path.join(ROOT_PROYEK, 'logs'),

    // Puppeteer
    PATH_CHROMIUM: ambilPathChromium(),
    ARG_PUPPETEER: KONFIG_ENV.puppeteerArgs,
    HEADLESS_PUPPETEER: KONFIG_ENV.headless,

    // API
    API_BASE_URL,
    API_ENDPOINTS,
    SESSION_TIMEOUT_MS,

    // Konfigurasi umum
    APP_URL,
    ADMIN_NUMBERS,
    BOT_PREFIX,

    // AI & Validasi
    AI_CONFIG: {
        OPENROUTER: {
            API_URL: 'https://openrouter.ai/api/v1/chat/completions',
            MODEL: 'openrouter/auto',
            MAX_TOKENS: 1000,
            TIMEOUT: 30000
        },
        GROQ: {
            API_URL: 'https://api.groq.com/openai/v1/chat/completions',
            AUDIO_URL: 'https://api.groq.com/openai/v1/audio/transcriptions',
            MODEL: 'llama-3.3-70b-versatile',
            MAX_TOKENS: 1000,
            TIMEOUT: 30000
        },
        GEMINI: {
            API_URL_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
            TIMEOUT: 60000
        },
        REPORT: {
            MIN_CHARS: 110,
            MAX_CHARS: 300,
            TRUNCATE_BUFFER: 50
        }
    },
    VALIDATION: {
        MANUAL_MIN_CHARS: 100
    },

    // === ALIAS (backward compat) ===
    CURRENT_ENV: ENV_SAAT_INI,
    ENV_CONFIG: KONFIG_ENV,
    detectEnvironment: deteksiEnv,
    printEnvironmentInfo: tampilEnv,
    PROJECT_ROOT: ROOT_PROYEK,
    SESSION_DIR: path.join(ROOT_PROYEK, 'sessions'),
    TEMP_DIR: path.join(ROOT_PROYEK, 'temp'),
    USERS_FILE: path.join(ROOT_PROYEK, 'users.json'),
    GROUP_ID_FILE: path.join(ROOT_PROYEK, 'data', 'group_id.txt'),
    AUTH_STATE_DIR: path.join(ROOT_PROYEK, 'SesiWA'),
    LOGS_DIR: path.join(ROOT_PROYEK, 'logs'),
    CHROMIUM_PATH: ambilPathChromium(),
    PUPPETEER_ARGS: KONFIG_ENV.puppeteerArgs,
    PUPPETEER_HEADLESS: KONFIG_ENV.headless
};
