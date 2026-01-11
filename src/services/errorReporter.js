const chalk = require('chalk');

// Admin number for error notifications
const ADMIN_NUMBER = '6285657025300@s.whatsapp.net';
let botSocket = null;

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

    if (!botSocket) {
        console.warn(chalk.yellow('[ERROR REPORTER] Bot socket not initialized. Logging only.'));
        return;
    }

    try {
        const errorMsg = typeof error === 'string' ? error : error.message;
        const stack = error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'No stack trace';
        
        let reportText = '🚨 *SYSTEM ERROR REPORT* 🚨\n\n';
        reportText += '*Context:* ' + context + '\n';
        reportText += '*Time:* ' + new Date().toLocaleString('id-ID') + '\n';
        reportText += '*Error:* ' + errorMsg + '\n\n';
        
        if (Object.keys(metadata).length > 0) {
            reportText += '*Metadata:*\n' + JSON.stringify(metadata, null, 2) + '\n\n';
        }
        
        // Use triple backticks for markdown code block
        reportText += '*Stack Trace (Top 5):*\n```\n' + stack + '\n```';

        await botSocket.sendMessage(ADMIN_NUMBER, { text: reportText });
        console.log(chalk.green('[ERROR REPORTER] Error report sent to admin.'));
    } catch (e) {
        console.error(chalk.red('[ERROR REPORTER] Failed to send report to admin:'), e.message);
    }
}

module.exports = {
    initErrorReporter,
    reportError
};