// Load environment variables first
require('dotenv').config();

// --- CONSOLE FILTER: Suppress noisy Baileys internal logs ---
const originalLog = console.log;
console.log = (...args) => {
    const text = args.join(' ');
    // Filter out noisy Baileys session logs
    if (text.includes('Closing session') ||
        text.includes('SessionEntry') ||
        text.includes('_chains') ||
        text.includes('ephemeralKeyPair')) {
        return; // Suppress
    }
    originalLog.apply(console, args);
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

// Start Application
try {
    connectToWhatsApp();
} catch (error) {
    console.error("Critical Error starting application:", error);
}