/**
 * Bot State Management
 * Centralized state to avoid circular dependencies
 */

// Bot state variables
let schedulerEnabled = true;
let botStatus = 'online'; // 'online' | 'offline' | 'maintenance'
let botConnected = false;
let maintenanceCommands = []; // List of commands under maintenance, e.g., ['absen', 'daftar']

// Getters
const isSchedulerEnabled = () => schedulerEnabled;
const getBotStatus = () => botStatus;
const isBotConnected = () => botConnected;
const getMaintenanceCommands = () => maintenanceCommands;
const isCommandUnderMaintenance = (cmd) => maintenanceCommands.includes(cmd.toLowerCase());

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
    getMaintenanceCommands,
    isCommandUnderMaintenance,
    setSchedulerEnabled,
    setBotStatus,
    setBotConnected,
    setMaintenanceCommands,
    toggleCommandMaintenance
};
