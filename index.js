// Load environment variables first
require('dotenv').config();
const chalk = require('chalk');
const figlet = require('figlet');
const { promisify } = require('util');

const connectToWhatsApp = require('./src/app');
const { reportError } = require('./src/services/errorReporter');

// Graceful Shutdown Handler (important for VPS with limited resources)
const gracefulShutdown = (signal) => {
    console.log(chalk.yellow(`\n[SHUTDOWN] Received ${signal}. Cleaning up...`));

    // Attempt to close auth server
    try {
        const { shutdownAuthServer } = require('./src/services/secureAuth');
        shutdownAuthServer();
    } catch (e) { }

    console.log(chalk.green('[SHUTDOWN] Cleanup complete. Exiting.'));
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions to prevent silent crashes
process.on('uncaughtException', (err) => {
    console.error(chalk.bgRed.white('[FATAL] Uncaught Exception:'), err);
    reportError(err, 'UncaughtException').finally(() => {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.bgRed.white('[FATAL] Unhandled Rejection at:'), promise, 'reason:', reason);
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
                    console.log(chalk.cyan(`[CLEANUP] Cleared large log file: ${file}`));
                }
            }
        }
    }
}, 24 * 60 * 60 * 1000);

// --- STARTUP SEQUENCE ---
(async () => {
    try {
        const terminalWidth = process.stdout.columns || 80;
        const maxWidth = Math.min(terminalWidth, 50);

        const asyncFiglet = promisify(figlet.text);
        const logo = await asyncFiglet('ABSENBOT', {
            font: 'ANSI Shadow',
            horizontalLayout: 'default',
            verticalLayout: 'default',
            width: maxWidth,
            whitespaceBreak: false
        });

        console.log(chalk.blue.bold(logo));

        console.log(chalk.white.bold(`${chalk.green.bold("📃  Informasi :")}         
✉️  Bot Auto Absen & Rekapan MagangHub
✉️  Versi : 2.0 (Stable)
✉️  Fitur : Auto-schedule, Dashboard, API Sync
🎁  Base Refactor : OmniBot Style

${chalk.cyan.bold("🚀  Memulai Proses Booting... Ditunggu Bosqu!")}\n`));

        console.log(chalk.green.bold('\n🎁  Menjalankan AbsenBot WhatsApp'));
        await connectToWhatsApp();

    } catch (err) {
        console.error(chalk.red.bold('\n⚠️  Terjadi Kesalahan saat startup : ' + err.message + '\n'));
    }
})();
