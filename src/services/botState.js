/**
 * Bot State Management
 * Centralized state to avoid circular dependencies
 */

// Bot state variables
let schedulerEnabled = true;
let botStatus = 'online'; // 'online' | 'offline' | 'maintenance'
let botConnected = false;
let absenMaintenance = false; // New: Specific maintenance for !absen

// Getters
const isSchedulerEnabled = () => schedulerEnabled;
const getBotStatus = () => botStatus;
const isBotConnected = () => botConnected;
const isAbsenMaintenance = () => absenMaintenance;

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
};

const setAbsenMaintenance = (enabled) => {
    absenMaintenance = enabled;
};

module.exports = {
    isSchedulerEnabled,
    getBotStatus,
    isBotConnected,
    isAbsenMaintenance,
    setSchedulerEnabled,
    setBotStatus,
    setBotConnected,
    setAbsenMaintenance
};
