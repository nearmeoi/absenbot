let schedulerEnabled = true;
let botStatus = 'online';
let botConnected = false;
let lastQR = null;
let maintenanceCommands = [];

let sentMessagesHistory = [];
const LOOP_THRESHOLD = 50;
const LOOP_WINDOW_MS = 10000;

const isSchedulerEnabled = () => schedulerEnabled;
const getBotStatus = () => botStatus;
const isBotConnected = () => botConnected;
const getLastQR = () => lastQR;
const getMaintenanceCommands = () => maintenanceCommands;
const isCommandUnderMaintenance = (cmd) => maintenanceCommands.includes(cmd.toLowerCase());

const recordSentMessage = () => {
    const now = Date.now();
    sentMessagesHistory.push(now);
    
    sentMessagesHistory = sentMessagesHistory.filter(timestamp => (now - timestamp) < LOOP_WINDOW_MS);
    
    if (sentMessagesHistory.length >= LOOP_THRESHOLD) {
        console.error(`[CRITICAL] Loop detected! ${sentMessagesHistory.length} messages sent in ${LOOP_WINDOW_MS/1000}s`);
        return true;
    }
    return false;
};

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
    if (connected) lastQR = null;
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

export {
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