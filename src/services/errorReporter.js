import chalk from 'chalk';
import { ADMIN_NUMBERS } from '../config/constants.js';

let botSocket = null;
const reportCache = new Map();
const REPORT_COOLDOWN_MS = 60000; // 1 minute

/**
 * Initialize error reporter with bot socket
 * @param {Object} sock - Baileys socket
 */
function initErrorReporter(sock) {
    botSocket = sock;
}

/**
 * Send error report to admin
 * @param {Error|string} error - The error object or message
 * @param {string} context - Where the error occurred
 * @param {Object} metadata - Additional info (sender, command, etc)
 */
async function reportError(error, context = 'Unknown', metadata = {}) {
    console.error(chalk.bgRed.white(' [ERROR REPORT] '), error);

    if (!botSocket || ADMIN_NUMBERS.length === 0) {
        console.warn(chalk.yellow('[ERROR REPORTER] Bot socket or admin not configured. Logging only.'));
        return;
    }

    try {
        const errorMsg = typeof error === 'string' ? error : error.message;

        // --- RATE LIMITING ---
        const cacheKey = `${context}:${errorMsg}`;
        const lastReport = reportCache.get(cacheKey);
        const now = Date.now();

        if (lastReport && (now - lastReport) < REPORT_COOLDOWN_MS) {
            console.log(chalk.gray(`[ERROR REPORTER] Suppressing duplicate report: ${errorMsg}`));
            return;
        }
        reportCache.set(cacheKey, now);

        // Periodically clean cache to prevent memory leaks
        if (reportCache.size > 100) {
            for (const [key, timestamp] of reportCache.entries()) {
                if (now - timestamp > REPORT_COOLDOWN_MS * 5) reportCache.delete(key);
            }
        }

        const stack = error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'No stack trace';

        let reportText = '🚨 *SYSTEM ERROR REPORT* 🚨\n\n';
        reportText += '*Context:* ' + context + '\n';
        reportText += '*Time:* ' + new Date().toLocaleString('id-ID') + '\n';
        reportText += '*Error:* ' + errorMsg + '\n\n';

        if (Object.keys(metadata).length > 0) {
            reportText += '*Metadata:*\n' + JSON.stringify(metadata, null, 2) + '\n\n';
        }

        reportText += '*Stack Trace (Top 5):*\n```\n' + stack + '\n```';

        // Send to first admin
        await botSocket.sendMessage(ADMIN_NUMBERS[0], { text: reportText });
        console.log(chalk.green('[ERROR REPORTER] Error report sent to admin.'));
    } catch (e) {
        console.error(chalk.red('[ERROR REPORTER] Failed to send report to admin:'), e.message);
    }
}

export {
    initErrorReporter,
    reportError
};
