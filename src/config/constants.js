import { fileURLToPath } from 'url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import chalk from 'chalk';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const ADMIN_NUMBERS = process.env.ADMIN_NUMBERS
    ? process.env.ADMIN_NUMBERS.split(',').map(n => {
        const num = n.trim();
        return num.includes('@') ? num : num + '@s.whatsapp.net';
    })
    : [];

const APP_URL = process.env.APP_URL || 'https://app.monev-absenbot.my.id';

const BOT_PREFIX = process.env.BOT_PREFIX || '!';

const detectEnvironment = () => {
    if (process.env.ENVIRONMENT) {
        return process.env.ENVIRONMENT.toLowerCase();
    }

    if (process.env.TERMUX_VERSION ||
        process.env.PREFIX?.includes('com.termux') ||
        fs.existsSync('/data/data/com.termux/files/usr')) {
        return 'termux';
    }

    const platform = process.platform;

    if (platform === 'win32') {
        return 'windows';
    }

    if (platform === 'darwin') {
        return 'macos';
    }

    if (platform === 'linux') {
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
            '--single-process',
            '--no-zygote'
        ],
        headless: 'new'
    },
    windows: {
        name: 'Windows',
        chromiumPaths: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--disable-canvas-aa',
            '--disable-2d-canvas-clip-aa',
            '--disable-gl-drawing-for-tests',
            '--disable-software-rasterizer',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process',
            '--disable-ipc-flooding-protection',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--js-flags=--max-old-space-size=128',
            '--memory-pressure-off',
            '--no-first-run',
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

const ENV_CONFIG = ENVIRONMENT_CONFIGS[CURRENT_ENV] || ENVIRONMENT_CONFIGS.unknown;

const getChromiumPath = () => {
    if (process.env.CHROMIUM_PATH) {
        if (fs.existsSync(process.env.CHROMIUM_PATH)) {
            return process.env.CHROMIUM_PATH;
        }
        console.warn(`[CONFIG] ⚠️ CHROMIUM_PATH not found: ${process.env.CHROMIUM_PATH}`);
    }

    for (const chromePath of ENV_CONFIG.chromiumPaths) {
        if (fs.existsSync(chromePath)) {
            return chromePath;
        }
    }

    console.warn(`[CONFIG] ⚠️ No Chromium found, using fallback: ${ENV_CONFIG.chromiumPaths[0]}`);
    return ENV_CONFIG.chromiumPaths[0];
};

const getProjectRoot = () => {
    if (process.env.PROJECT_ROOT) {
        return process.env.PROJECT_ROOT;
    }
    return process.cwd();
};

const PROJECT_ROOT = getProjectRoot();

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

const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS) || 24 * 60 * 60 * 1000;

const printEnvironmentInfo = () => {
    console.log(`\n🌍 ${ENV_CONFIG.name} | ${CURRENT_ENV} | Node ${process.version}`);
    console.log(`   Root: ${PROJECT_ROOT} | Chromium: ${getChromiumPath()}\n`);
};

if (process.env.SILENT_STARTUP !== 'true') {
    printEnvironmentInfo();
}

const SESSION_DIR = path.join(PROJECT_ROOT, 'sessions');
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp');
const USERS_FILE = path.join(PROJECT_ROOT, 'users.json');
const GROUP_ID_FILE = path.join(PROJECT_ROOT, 'group_id.txt');
const AUTH_STATE_DIR = path.join(PROJECT_ROOT, 'SesiWA');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
const CHROMIUM_PATH = getChromiumPath();
const PUPPETEER_ARGS = ENV_CONFIG.puppeteerArgs;
const PUPPETEER_HEADLESS = ENV_CONFIG.headless;

const AI_CONFIG = {
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
};

const VALIDATION = {
    MANUAL_MIN_CHARS: 100
};

export {
    CURRENT_ENV,
    ENV_CONFIG,
    detectEnvironment,
    printEnvironmentInfo,
    PROJECT_ROOT,
    SESSION_DIR,
    TEMP_DIR,
    USERS_FILE,
    GROUP_ID_FILE,
    AUTH_STATE_DIR,
    LOGS_DIR,
    CHROMIUM_PATH,
    PUPPETEER_ARGS,
    PUPPETEER_HEADLESS,
    API_BASE_URL,
    API_ENDPOINTS,
    SESSION_TIMEOUT_MS,
    APP_URL,
    ADMIN_NUMBERS,
    BOT_PREFIX,
    AI_CONFIG,
    VALIDATION
};