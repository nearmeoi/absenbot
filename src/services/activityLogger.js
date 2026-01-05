/**
 * Activity Logger Service
 * Logs bot activities to memory for dashboard display
 */

const chalk = require('chalk');

// In-memory circular buffer for logs (max 200 entries)
const MAX_LOGS = 200;
const activityLogs = [];

/**
 * Log types
 */
const LOG_TYPES = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
    COMMAND: 'command',
    SCHEDULER: 'scheduler',
    AUTH: 'auth'
};

/**
 * Add a log entry
 * @param {string} type - Log type from LOG_TYPES
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
function log(type, message, meta = {}) {
    const entry = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type,
        message,
        meta
    };

    activityLogs.unshift(entry); // Add to beginning

    // Keep only last MAX_LOGS entries
    if (activityLogs.length > MAX_LOGS) {
        activityLogs.pop();
    }

    // Also console log for server visibility
    const colorMap = {
        info: chalk.blue,
        success: chalk.green,
        warning: chalk.yellow,
        error: chalk.red,
        command: chalk.cyan,
        scheduler: chalk.magenta,
        auth: chalk.gray
    };

    const colorFn = colorMap[type] || chalk.white;
    console.log(colorFn(`[${type.toUpperCase()}] ${message}`));

    // Notify listeners
    listeners.forEach(cb => cb(entry));
}

// Event listeners for real-time streaming
const listeners = [];

function onLog(callback) {
    listeners.push(callback);
}

function removeListener(callback) {
    const index = listeners.indexOf(callback);
    if (index > -1) {
        listeners.splice(index, 1);
    }
}

/**
 * Get recent logs
 * @param {number} limit - Number of logs to return
 * @param {string} type - Filter by type (optional)
 * @returns {Array}
 */
function getLogs(limit = 50, type = null) {
    let logs = activityLogs;

    if (type) {
        logs = logs.filter(l => l.type === type);
    }

    return logs.slice(0, limit);
}

/**
 * Clear all logs
 */
function clearLogs() {
    activityLogs.length = 0;
    log(LOG_TYPES.INFO, 'Activity logs cleared');
}

/**
 * Get log statistics
 * @returns {Object}
 */
function getStats() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const todayLogs = activityLogs.filter(l => l.timestamp.startsWith(today));

    return {
        total: activityLogs.length,
        today: todayLogs.length,
        byType: {
            commands: todayLogs.filter(l => l.type === LOG_TYPES.COMMAND).length,
            scheduler: todayLogs.filter(l => l.type === LOG_TYPES.SCHEDULER).length,
            errors: todayLogs.filter(l => l.type === LOG_TYPES.ERROR).length
        }
    };
}

module.exports = {
    log,
    getLogs,
    clearLogs,
    getStats,
    LOG_TYPES,
    onLog,
    removeListener
};
