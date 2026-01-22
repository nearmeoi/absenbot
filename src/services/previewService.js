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
    // Normalization for LID/standard consistency
    const cleanSender = sender.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    console.log(chalk.cyan(`[PREVIEW] Saving draft for ${cleanSender} (Type: ${draft.type || 'ai'})`));
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
    const cleanSender = sender.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const draft = pendingPreviews.get(cleanSender);
    if (!draft) return null;

    // 30-minute timeout (updated from 5)
    const expiry = 30 * 60 * 1000;
    if (Date.now() - draft.timestamp > expiry) {
        pendingPreviews.delete(sender);
        return null;
    }

    return draft;
}

/**
 * Remove draft after use
 * @param {string} sender 
 */
function deleteDraft(sender) {
    const cleanSender = sender.split('@')[0].split(':')[0] + '@s.whatsapp.net';
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

module.exports = {
    setDraft,
    getDraft,
    deleteDraft,
    pendingPreviews // Exposed for absolute control if needed
};
