/**
 * Preview Service
 * Manages temporary attendance drafs shared between Handler and Scheduler
 */

const chalk = require('chalk');

// In-memory cache: sender -> { aktivitas, pembelajaran, kendala, type, timestamp }
// type: 'ai' or 'manual'
const pendingPreviews = new Map();

/**
 * Save or Update a draft
 * @param {string} sender 
 * @param {Object} draft { aktivitas, pembelajaran, kendala, type }
 */
function setDraft(sender, draft) {
    // Normalization: Keep LID as is, but normalize standard JIDs
    const cleanSender = sender.includes('@lid') ? sender.split(':')[0] : (sender.split('@')[0].split(':')[0] + '@s.whatsapp.net');
    console.log(chalk.cyan(`[PREVIEW SERVICE] 💾 Saving draft for ${cleanSender}`));
    pendingPreviews.set(cleanSender, {
        ...draft,
        timestamp: Date.now()
    });
}

/**
 * Get draft for a user (Checks for expiration)
 * @param {string} sender 
 * @returns {Object|null}
 */
function getDraft(sender) {
    const cleanSender = sender.includes('@lid') ? sender.split(':')[0] : (sender.split('@')[0].split(':')[0] + '@s.whatsapp.net');
    const draft = pendingPreviews.get(cleanSender);
    
    if (!draft) return null;

    // 30-minute timeout
    const expiry = 30 * 60 * 1000;
    if (Date.now() - draft.timestamp > expiry) {
        console.log(chalk.red(`[PREVIEW SERVICE] ⚠️ Draft expired for ${cleanSender}`));
        pendingPreviews.delete(cleanSender);
        return null;
    }

    return draft;
}

/**
 * Remove draft after use
 * @param {string} sender 
 */
function deleteDraft(sender) {
    const cleanSender = sender.includes('@lid') ? sender.split(':')[0] : (sender.split('@')[0].split(':')[0] + '@s.whatsapp.net');
    pendingPreviews.delete(cleanSender);
}

/**
 * Cleanup stale drafts
 */
function cleanup() {
    const now = Date.now();
    const expiry = 30 * 60 * 1000; // 30 minutes

    let count = 0;
    for (const [sender, data] of pendingPreviews.entries()) {
        if (now - data.timestamp > expiry) {
            pendingPreviews.delete(sender);
            count++;
        }
    }
    if (count > 0) console.log(chalk.gray(`[PREVIEW] Cleaned up ${count} stale drafts.`));
}

// Auto-cleanup every hour
setInterval(cleanup, 60 * 60 * 1000);

/**
 * Format draft data into preview message text
 * @param {Object} reportData { aktivitas, pembelajaran, kendala }
 * @param {string} messageKey - Message template key (default: 'draft_preview')
 * @returns {string} Formatted preview text
 */
function formatDraftPreview(reportData, messageKey = 'draft_preview') {
    const { getMessage } = require('./messageService');
    return getMessage(messageKey)
        .replace('{aktivitas_len}', reportData.aktivitas.length)
        .replace('{aktivitas}', reportData.aktivitas)
        .replace('{pembelajaran_len}', reportData.pembelajaran.length)
        .replace('{pembelajaran}', reportData.pembelajaran)
        .replace('{kendala_len}', reportData.kendala.length)
        .replace('{kendala}', reportData.kendala);
}

module.exports = {
    setDraft,
    getDraft,
    deleteDraft,
    formatDraftPreview,
    pendingPreviews // Exposed for absolute control if needed
};
