/**
 * Bot State Management
 * Centralized state to avoid circular dependencies
 */

// Bot state variables
let schedulerEnabled = true;
let botStatus = 'online'; // 'online' | 'offline' | 'maintenance'
let botConnected = false;

// Getters
const isSchedulerEnabled = () => schedulerEnabled;
const getBotStatus = () => botStatus;
const isBotConnected = () => botConnected;

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

module.exports = {
    isSchedulerEnabled,
    getBotStatus,
    isBotConnected,
    setSchedulerEnabled,
    setBotStatus,
    setBotConnected
};
