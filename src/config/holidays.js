/**
 * Holiday Management System
 * Manages custom holidays and checks if today is a holiday
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const HOLIDAYS_FILE = path.join(__dirname, '../../data/holidays.json');
const GROUPS_FILE = path.join(__dirname, '../../data/allowed_groups.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Load holidays from file
 * @returns {Array<string>} Array of date strings (YYYY-MM-DD)
 */
function loadHolidays() {
    if (!fs.existsSync(HOLIDAYS_FILE)) {
        fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify([], null, 2));
        return [];
    }
    try {
        const data = fs.readFileSync(HOLIDAYS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error(chalk.red('[HOLIDAYS] Error loading holidays:'), e.message);
        return [];
    }
}

/**
 * Save holidays to file
 * @param {Array<string>} holidays 
 */
function saveHolidays(holidays) {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2));
    console.log(chalk.green(`[HOLIDAYS] Saved ${holidays.length} holidays`));
}

/**
 * Add a holiday date
 * @param {string} dateStr - Date in YYYY-MM-DD format
 */
function addHoliday(dateStr) {
    const holidays = loadHolidays();
    if (!holidays.includes(dateStr)) {
        holidays.push(dateStr);
        holidays.sort(); // Keep sorted
        saveHolidays(holidays);
        console.log(chalk.green(`[HOLIDAYS] Added: ${dateStr}`));
        return true;
    }
    return false;
}

/**
 * Remove a holiday date
 * @param {string} dateStr - Date in YYYY-MM-DD format
 */
function removeHoliday(dateStr) {
    const holidays = loadHolidays();
    const index = holidays.indexOf(dateStr);
    if (index > -1) {
        holidays.splice(index, 1);
        saveHolidays(holidays);
        console.log(chalk.yellow(`[HOLIDAYS] Removed: ${dateStr}`));
        return true;
    }
    return false;
}

/**
 * Check if a date is a holiday
 * @param {string} dateStr - Date in YYYY-MM-DD format (default: today)
 * @returns {boolean}
 */
function isHoliday(dateStr = null) {
    if (!dateStr) {
        dateStr = new Date().toISOString().split('T')[0];
    }

    // Check weekend (Saturday = 6, Sunday = 0)
    const date = new Date(dateStr);
    const day = date.getDay();
    if (day === 0 || day === 6) {
        return true; // Weekend
    }

    // Check custom holidays
    const holidays = loadHolidays();
    return holidays.includes(dateStr);
}

/**
 * Get all holidays
 * @returns {Array<string>}
 */
function getAllHolidays() {
    return loadHolidays();
}

// ==================== GROUP MANAGEMENT ====================

/**
 * Load allowed groups from file
 * @returns {Array<string>} Array of group IDs
 */
function loadAllowedGroups() {
    if (!fs.existsSync(GROUPS_FILE)) {
        fs.writeFileSync(GROUPS_FILE, JSON.stringify([], null, 2));
        return [];
    }
    try {
        const data = fs.readFileSync(GROUPS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error(chalk.red('[GROUPS] Error loading groups:'), e.message);
        return [];
    }
}

/**
 * Save allowed groups to file
 * @param {Array<string>} groups 
 */
function saveAllowedGroups(groups) {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
    console.log(chalk.green(`[GROUPS] Saved ${groups.length} groups`));
}

/**
 * Add a group to whitelist
 * @param {string} groupId 
 */
function addAllowedGroup(groupId) {
    const groups = loadAllowedGroups();
    if (!groups.includes(groupId)) {
        groups.push(groupId);
        saveAllowedGroups(groups);
        console.log(chalk.green(`[GROUPS] Added: ${groupId}`));
        return true;
    }
    return false;
}

/**
 * Remove a group from whitelist
 * @param {string} groupId 
 */
function removeAllowedGroup(groupId) {
    const groups = loadAllowedGroups();
    const index = groups.indexOf(groupId);
    if (index > -1) {
        groups.splice(index, 1);
        saveAllowedGroups(groups);
        console.log(chalk.yellow(`[GROUPS] Removed: ${groupId}`));
        return true;
    }
    return false;
}

/**
 * Check if a group is whitelisted
 * @param {string} groupId 
 * @returns {boolean}
 */
function isAllowedGroup(groupId) {
    const groups = loadAllowedGroups();
    return groups.includes(groupId);
}

/**
 * Get all allowed groups
 * @returns {Array<string>}
 */
function getAllowedGroups() {
    return loadAllowedGroups();
}

module.exports = {
    addHoliday,
    removeHoliday,
    isHoliday,
    getAllHolidays,
    addAllowedGroup,
    removeAllowedGroup,
    isAllowedGroup,
    getAllowedGroups
};
