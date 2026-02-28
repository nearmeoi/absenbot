/**
 * Bot State Management
 * Centralized state to avoid circular dependencies
 */

// Bot state variables
let schedulerEnabled = true;
let botStatus = 'online'; // 'online' | 'offline' | 'maintenance'
let botConnected = false;
let lastQR = null;
let maintenanceCommands = []; // List of commands under maintenance, e.g., ['absen', 'daftar']

// Anti-Loop State
let sentMessagesHistory = [];
const LOOP_THRESHOLD = 10;
const LOOP_WINDOW_MS = 10000; // 10 seconds

// Getters
const isSchedulerEnabled = () => schedulerEnabled;
const getBotStatus = () => botStatus;
const isBotConnected = () => botConnected;
const getLastQR = () => lastQR;
const getMaintenanceCommands = () => maintenanceCommands;
const isCommandUnderMaintenance = (cmd) => maintenanceCommands.includes(cmd.toLowerCase());

/**
 * Record a sent message and check for spam loops
 * @returns {boolean} true if loop detected
 */
const recordSentMessage = () => {
    const now = Date.now();
    sentMessagesHistory.push(now);
    
    // Clean up history older than the window
    sentMessagesHistory = sentMessagesHistory.filter(timestamp => (now - timestamp) < LOOP_WINDOW_MS);
    
    if (sentMessagesHistory.length >= LOOP_THRESHOLD) {
        console.error(`[CRITICAL] Loop detected! ${sentMessagesHistory.length} messages sent in ${LOOP_WINDOW_MS/1000}s`);
        return true;
    }
    return false;
};

// Setters
const setSchedulerEnabled = (enabled) => {
    schedulerEnabled = enabled;
};

const setBotStatus = (status) => {
    if (['online', 'offline', 'maintenance'].includes(status)) {
        botStatus = status;
    }
};

const setBotConnected = (connected) => {
    botConnected = connected;
    if (connected) lastQR = null; // Clear QR when connected
};

const setLastQR = (qr) => {
    lastQR = qr;
};

const setMaintenanceCommands = (cmds) => {
    if (Array.isArray(cmds)) {
        maintenanceCommands = cmds.map(c => c.toLowerCase());
    }
};

const toggleCommandMaintenance = (cmd) => {
    const c = cmd.toLowerCase();
    if (maintenanceCommands.includes(c)) {
        maintenanceCommands = maintenanceCommands.filter(item => item !== c);
    } else {
        maintenanceCommands.push(c);
    }
};

module.exports = {
    isSchedulerEnabled,
    getBotStatus,
    isBotConnected,
    getLastQR,
    getMaintenanceCommands,
    isCommandUnderMaintenance,
    recordSentMessage,
    setSchedulerEnabled,
    setBotStatus,
    setBotConnected,
    setLastQR,
    setMaintenanceCommands,
    toggleCommandMaintenance
};
