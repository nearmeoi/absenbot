// Load environment variables first - FORCE OVERRIDE to bypass stale system env
require('dotenv').config({ override: true });

// --- CONSOLE FILTER: Suppress noisy Baileys internal logs ---
const filterOutput = (args) => {
    const text = args.map(arg => {
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch (e) { return String(arg); }
    }).join(' ');

    return text.includes('Closing session') ||
           text.includes('SessionEntry') ||
           text.includes('_chains') ||
           text.includes('ephemeralKeyPair') ||
           text.includes('pendingPreKey');
};

const originalLog = console.log;
console.log = (...args) => {
    if (filterOutput(args)) return;
    originalLog.apply(console, args);
};

const originalInfo = console.info;
console.info = (...args) => {
    if (filterOutput(args)) return;
    originalInfo.apply(console, args);
};

const originalError = console.error;
console.error = (...args) => {
    if (filterOutput(args)) return;
    originalError.apply(console, args);
};

const connectToWhatsApp = require('./src/app');

const { reportError } = require('./src/services/errorReporter');

// Graceful Shutdown Handler (important for VPS with limited resources)
const gracefulShutdown = (signal) => {
    console.log(`\n[SHUTDOWN] Received ${signal}. Cleaning up...`);

    // Attempt to close auth server
    try {
        const { shutdownAuthServer } = require('./src/services/secureAuth');
        shutdownAuthServer();
    } catch (e) { }

    console.log('[SHUTDOWN] Cleanup complete. Exiting.');
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions to prevent silent crashes
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    reportError(err, 'UncaughtException').finally(() => {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
    reportError(reason, 'UnhandledRejection');
});

// --- AUTO LOG CLEANUP (Every 24 Hours) ---
setInterval(() => {
    const fs = require('fs');
    const path = require('path');
    const logDir = path.join(__dirname, 'logs');
    if (fs.existsSync(logDir)) {
        const files = fs.readdirSync(logDir);
        for (const file of files) {
            if (file.endsWith('.log')) {
                const filePath = path.join(logDir, file);
                const stats = fs.statSync(filePath);
                if (stats.size > 10 * 1024 * 1024) { // 10MB limit
                    fs.writeFileSync(filePath, ''); // Clear it
                    console.log(`[CLEANUP] Cleared large log file: ${file}`);
                }
            }
        }
    }
}, 24 * 60 * 60 * 1000);

// Start Application
try {
    connectToWhatsApp();
} catch (error) {
    console.error("Critical Error starting application:", error);
}