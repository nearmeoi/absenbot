const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const CACHE_FILE = path.join(__dirname, '../../data/dashboard_cache.json');

// Ensure data dir exists
if (!fs.existsSync(path.dirname(CACHE_FILE))) {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
}

function loadCache() {
    if (!fs.existsSync(CACHE_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (e) {
        console.error(chalk.red('[CACHE] Error loading cache:', e.message));
        return {};
    }
}

function saveCache(data) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(chalk.red('[CACHE] Error saving cache:', e.message));
    }
}

/**
 * Save user dashboard stats
 * @param {string} email 
 * @param {object} stats 
 */
function setDashboardCache(email, stats) {
    const cache = loadCache();
    cache[email] = {
        timestamp: Date.now(),
        data: stats
    };
    saveCache(cache);
    console.log(chalk.green(`[CACHE] Saved dashboard stats for ${email}`));
}

/**
 * Get user dashboard stats
 * @param {string} email 
 * @param {number} maxAgeHours (Default: 24)
 * @returns {object|null}
 */
function getDashboardCache(email, maxAgeHours = 24) {
    const cache = loadCache();
    const userCache = cache[email];

    if (!userCache) return null;

    const ageHours = (Date.now() - userCache.timestamp) / (1000 * 60 * 60);
    if (ageHours > maxAgeHours) {
        console.log(chalk.yellow(`[CACHE] Expired for ${email} (${ageHours.toFixed(1)} hours old)`));
        return null;
    }

    console.log(chalk.green(`[CACHE] Hit for ${email} (${ageHours.toFixed(1)} hours old)`));
    return userCache.data;
}

module.exports = {
    setDashboardCache,
    getDashboardCache
};
