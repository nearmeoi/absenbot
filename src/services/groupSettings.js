/**
 * Group Settings Management
 * Handles per-group configurations
 */

import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SETTINGS_FILE = path.join(__dirname, '../../data/group_settings.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Default settings for a new group
const DEFAULT_SETTINGS = {
    name: '',
    schedulerEnabled: true,
    autoReply: true,
    timezone: 'Asia/Makassar' // Default to WITA
};

// In-memory cache
let cachedSettings = null;

/**
 * Load all group settings
 */
function loadGroupSettings(forceReload = false) {
    if (cachedSettings && !forceReload) return cachedSettings;

    if (!fs.existsSync(SETTINGS_FILE)) {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}, null, 2));
        cachedSettings = {};
        return {};
    }

    try {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        cachedSettings = JSON.parse(data);
        return cachedSettings;
    } catch (e) {
        console.error(chalk.red('[GROUPS] Error loading settings:'), e);
        return {};
    }
}

function saveGroupSettings(settings) {
    cachedSettings = settings;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

/**
 * Add or update a group
 * @param {string} groupId 
 * @param {Object} updates - Partial settings object
 */
function updateGroup(groupId, updates = {}) {
    const settings = loadGroupSettings();

    if (!settings[groupId]) {
        // New group
        settings[groupId] = { ...DEFAULT_SETTINGS, ...updates };
        console.log(chalk.green(`[GROUPS] Added new group: ${groupId}`));
    } else {
        // Update existing
        settings[groupId] = { ...settings[groupId], ...updates };
        console.log(chalk.cyan(`[GROUPS] Updated group: ${groupId}`));
    }

    saveGroupSettings(settings);
    return settings[groupId];
}

/**
 * Remove a group
 * @param {string} groupId 
 */
function removeGroup(groupId) {
    const settings = loadGroupSettings();
    if (settings[groupId]) {
        delete settings[groupId];
        saveGroupSettings(settings);
        console.log(chalk.yellow(`[GROUPS] Removed group: ${groupId}`));
        return true;
    }
    return false;
}

/**
 * Get settings for a specific group
 * @param {string} groupId 
 */
function getGroup(groupId) {
    const settings = loadGroupSettings();
    return settings[groupId] || null;
}

/**
 * Check if a group is allowed (exists in settings)
 * @param {string} groupId 
 */
function isGroupAllowed(groupId) {
    const settings = loadGroupSettings();
    return !!settings[groupId];
}

/**
 * Get all groups as a list (for compatibility)
 */
function getAllGroupIds() {
    return Object.keys(loadGroupSettings());
}

export {
    loadGroupSettings,
    updateGroup,
    removeGroup,
    getGroup,
    isGroupAllowed,
    getAllGroupIds
};
