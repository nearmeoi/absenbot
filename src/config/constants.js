require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');

// ========================================
// ENVIRONMENT DETECTION
// ========================================

/**
 * Detect the current running environment
 * @returns {'termux' | 'windows' | 'vps' | 'linux' | 'macos' | 'unknown'}
 */
const detectEnvironment = () => {
    // Allow manual override via .env
    if (process.env.ENVIRONMENT) {
        return process.env.ENVIRONMENT.toLowerCase();
    }

    // Detect Termux (Android)
    if (process.env.TERMUX_VERSION ||
        process.env.PREFIX?.includes('com.termux') ||
        fs.existsSync('/data/data/com.termux/files/usr')) {
        return 'termux';
    }

    // Detect platform
    const platform = process.platform;

    if (platform === 'win32') {
        return 'windows';
    }

    if (platform === 'darwin') {
        return 'macos';
    }

    if (platform === 'linux') {
        // Check if running on VPS/server (headless environment)
        const isHeadless = !process.env.DISPLAY;
        const isSSH = process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION;
        const isDocker = fs.existsSync('/.dockerenv');
        const isContainer = process.env.container || isDocker;

        if (isSSH || isHeadless || isContainer) {
            return 'vps';
        }
        return 'linux';
    }

    return 'unknown';
};

const CURRENT_ENV = detectEnvironment();

// ========================================
// ENVIRONMENT-SPECIFIC CONFIGURATIONS
// ========================================

const ENVIRONMENT_CONFIGS = {
    termux: {
        name: 'Termux (Android)',
        chromiumPaths: [
            '/data/data/com.termux/files/usr/bin/chromium-browser',
            '/data/data/com.termux/files/usr/bin/chromium'
        ],
        defaultProjectRoot: '/data/data/com.termux/files/home/absenbot',
        puppeteerArgs: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--single-process',  // Required for Termux
            '--no-zygote'        // Required for Termux
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
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--no-first-run'
        ],
        headless: 'new'
    },
    vps: {
        name: 'VPS/Server (Linux)',
        chromiumPaths: [
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/snap/bin/chromium'
        ],
        defaultProjectRoot: process.cwd(),
        puppeteerArgs: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--no-first-run',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio'
        ],
        headless: 'new'
    },
    linux: {
        name: 'Linux Desktop',
        chromiumPaths: [
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/snap/bin/chromium'
        ],
        defaultProjectRoot: process.cwd(),
        puppeteerArgs: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu'
        ],
        headless: 'new'
    },
    macos: {
        name: 'macOS',
        chromiumPaths: [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ],
        defaultProjectRoot: process.cwd(),
        puppeteerArgs: [
            '--disable-gpu',
            '--no-first-run'
        ],
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

// Get current environment config
const ENV_CONFIG = ENVIRONMENT_CONFIGS[CURRENT_ENV] || ENVIRONMENT_CONFIGS.unknown;

// ========================================
// PATH RESOLUTION FUNCTIONS
// ========================================

/**
 * Find the first existing Chromium path
 */
const getChromiumPath = () => {
    // Priority 1: Environment variable override
    if (process.env.CHROMIUM_PATH) {
        if (fs.existsSync(process.env.CHROMIUM_PATH)) {
            return process.env.CHROMIUM_PATH;
        }
        console.warn(`[CONFIG] ⚠️ CHROMIUM_PATH not found: ${process.env.CHROMIUM_PATH}`);
    }

    // Priority 2: Auto-detect from environment config
    for (const chromePath of ENV_CONFIG.chromiumPaths) {
        if (fs.existsSync(chromePath)) {
            return chromePath;
        }
    }

    // Fallback: Return first path (may not exist)
    console.warn(`[CONFIG] ⚠️ No Chromium found, using fallback: ${ENV_CONFIG.chromiumPaths[0]}`);
    return ENV_CONFIG.chromiumPaths[0];
};

/**
 * Get project root directory
 */
const getProjectRoot = () => {
    // Priority 1: Environment variable override
    if (process.env.PROJECT_ROOT) {
        return process.env.PROJECT_ROOT;
    }
    // Priority 2: Current working directory (most reliable)
    return process.cwd();
};

// ========================================
// RESOLVED PATHS
// ========================================

const PROJECT_ROOT = getProjectRoot();

// API Endpoints for MagangHub
const API_BASE_URL = 'https://monev.maganghub.kemnaker.go.id';
const SIAPKERJA_URL = 'https://siapkerja.kemnaker.go.id';
const API_ENDPOINTS = {
    DAILY_LOGS: `${API_BASE_URL}/api/daily-logs`,
    DASHBOARD: `${API_BASE_URL}/dashboard`,
    SIAPKERJA_HOME: `${SIAPKERJA_URL}/app/home`,
    LOGIN_URL: `https://account.kemnaker.go.id/auth/login`
};

// Session timeout (default 24 hours)
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS) || 24 * 60 * 60 * 1000;

// ========================================
// LOGGING ENVIRONMENT INFO
// ========================================

const printEnvironmentInfo = () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              🌍 ENVIRONMENT DETECTION                       ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Platform    : ${process.platform.padEnd(44)}║`);
    console.log(`║  Environment : ${CURRENT_ENV.padEnd(44)}║`);
    console.log(`║  Env Name    : ${ENV_CONFIG.name.padEnd(44)}║`);
    console.log(`║  Project Root: ${PROJECT_ROOT.substring(0, 44).padEnd(44)}║`);
    console.log(`║  Chromium    : ${getChromiumPath().substring(0, 44).padEnd(44)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');
};

// Print on startup (can be disabled via env)
if (process.env.SILENT_STARTUP !== 'true') {
    printEnvironmentInfo();
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
    // Environment info
    CURRENT_ENV,
    ENV_CONFIG,
    detectEnvironment,
    printEnvironmentInfo,

    // Paths
    PROJECT_ROOT,
    SESSION_DIR: path.join(PROJECT_ROOT, 'sessions'),
    TEMP_DIR: path.join(PROJECT_ROOT, 'temp'),
    USERS_FILE: path.join(PROJECT_ROOT, 'users.json'),
    GROUP_ID_FILE: path.join(PROJECT_ROOT, 'group_id.txt'),
    AUTH_STATE_DIR: path.join(PROJECT_ROOT, 'SesiWA'),

    // Puppeteer config
    CHROMIUM_PATH: getChromiumPath(),
    PUPPETEER_ARGS: ENV_CONFIG.puppeteerArgs,
    PUPPETEER_HEADLESS: ENV_CONFIG.headless,

    // API
    API_BASE_URL,
    API_ENDPOINTS,
    SESSION_TIMEOUT_MS
};
