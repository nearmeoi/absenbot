import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOLIDAYS_FILE = path.join(__dirname, '../../data/holidays.json');
const GROUPS_FILE = path.join(__dirname, '../../data/group_settings.json');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

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

function saveHolidays(holidays) {
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2));
    console.log(chalk.green(`[HOLIDAYS] Saved ${holidays.length} holidays`));
}

function addHoliday(dateStr) {
    const holidays = loadHolidays();
    if (!holidays.includes(dateStr)) {
        holidays.push(dateStr);
        holidays.sort();
        saveHolidays(holidays);
        console.log(chalk.green(`[HOLIDAYS] Added: ${dateStr}`));
        return true;
    }
    return false;
}

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

function isHoliday(dateStr = null) {
    if (!dateStr) {
        dateStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Makassar' }).split(',')[0];
    }

    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    if (day === 0 || day === 6) {
        return true;
    }

    const holidays = loadHolidays();
    return holidays.includes(dateStr);
}

function getAllHolidays() {
    return loadHolidays();
}

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

function saveAllowedGroups(groups) {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
    console.log(chalk.green(`[GROUPS] Saved ${groups.length} groups`));
}

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

function isAllowedGroup(groupId) {
    const groups = loadAllowedGroups();
    return groups.includes(groupId);
}

function getAllowedGroups() {
    return loadAllowedGroups();
}

export {
    addHoliday,
    removeHoliday,
    isHoliday,
    getAllHolidays,
    addAllowedGroup,
    removeAllowedGroup,
    isAllowedGroup,
    getAllowedGroups
};