const fs = require('fs');
const path = require('path');
const { getUserByPhone } = require('./database');
const DEBUG = process.env.DEBUG === 'true';

const MESSAGES_DIR = path.join(__dirname, '../config/messages');
const LEGACY_MESSAGES_FILE = path.join(__dirname, '../config/messages.json');

// In-memory cache
let cachedMessages = null;

/**
 * Load all messages from JSON files in the messages directory
 */
function loadMessages(forceReload = false) {
    if (cachedMessages && !forceReload) return cachedMessages;

    let messages = {};

    // 1. Load Legacy File (if exists, for migration safety)
    if (fs.existsSync(LEGACY_MESSAGES_FILE)) {
        try {
            const legacyData = JSON.parse(fs.readFileSync(LEGACY_MESSAGES_FILE, 'utf8'));
            messages = { ...messages, ...legacyData };
        } catch (e) {
            console.error('Error loading legacy messages:', e);
        }
    }

    // 2. Load Modular Files
    if (fs.existsSync(MESSAGES_DIR)) {
        const files = fs.readdirSync(MESSAGES_DIR).filter(file => file.endsWith('.json'));

        files.forEach(file => {
            try {
                const filePath = path.join(MESSAGES_DIR, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                messages = { ...messages, ...data };
            } catch (e) {
                console.error(`Error loading message file ${file}:`, e);
            }
        });
    }

    cachedMessages = messages;
    return messages;
}

/**
 * Get Web App URL helper
 */
function getAppUrl(phone = '') {
    const { APP_URL } = require('../config/constants');
    if (!phone) return APP_URL;

    // Try to find user to get slug
    try {
        const user = getUserByPhone(phone);
        if (user && user.slug) {
            return `${APP_URL}?u=${user.slug}`;
        }

        // Fallback to phone logic if no slug
        if (user) {
            if (user.phone && !user.phone.includes('@lid') && user.phone.includes('@s.whatsapp.net')) {
                phone = user.phone;
            }
        }
    } catch (e) {
        if (DEBUG) console.error(`[DEBUG] DB Error in getAppUrl: ${e.message}`);
    }

    const cleanPhone = phone.split('@')[0].split(':')[0];
    return `${APP_URL}?phone=${cleanPhone}`;
}

/**
 * Get message content by key
 */
function getMessage(key, phone = '') {
    const messages = loadMessages();
    let msg = messages[key] || '';

    if (msg && msg.includes('{app_url}')) {
        const url = getAppUrl(phone);
        msg = msg.split('{app_url}').join(url);
    }

    return msg;
}

/**
 * Get message and replace {app_url} placeholder (Alias for getMessage)
 */
function getMessageWithUrl(key, phone = '') {
    return getMessage(key, phone);
}

/**
 * Update a specific message key
 * Intelligent update: Finds which file contains the key and updates it there.
 * If key is new, adds it to 'custom.json'
 */
function updateMessage(key, content) {
    let updated = false;
    let targetFile = path.join(MESSAGES_DIR, 'custom.json');

    // 1. Check if key exists in any existing file in directory
    if (fs.existsSync(MESSAGES_DIR)) {
        const files = fs.readdirSync(MESSAGES_DIR).filter(file => file.endsWith('.json'));

        for (const file of files) {
            const filePath = path.join(MESSAGES_DIR, file);
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (data.hasOwnProperty(key)) {
                    data[key] = content;
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                    updated = true;
                    targetFile = filePath;
                    break;
                }
            } catch (e) { }
        }
    }

    // 2. If not found in modular files, check legacy
    if (!updated && fs.existsSync(LEGACY_MESSAGES_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(LEGACY_MESSAGES_FILE, 'utf8'));
            if (data.hasOwnProperty(key)) {
                data[key] = content;
                fs.writeFileSync(LEGACY_MESSAGES_FILE, JSON.stringify(data, null, 2));
                updated = true;
            }
        } catch (e) { }
    }

    // 3. If still not updated (New Key), write to custom.json
    if (!updated) {
        try {
            let customData = {};
            if (fs.existsSync(targetFile)) {
                customData = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
            }
            customData[key] = content;
            fs.writeFileSync(targetFile, JSON.stringify(customData, null, 2));
        } catch (e) {
            console.error('Error writing new message key:', e);
        }
    }

    // Clear cache to force reload
    cachedMessages = null;
    return loadMessages();
}

module.exports = {
    loadMessages,
    getMessage,
    updateMessage,
    getAppUrl,
    getMessageWithUrl
};
