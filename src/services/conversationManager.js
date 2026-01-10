/**
 * Conversation Memory Engine
 * Manages per-chat context, short-term history, and core memory.
 */
const chalk = require('chalk');

// Storage: Key = remoteJid (string), Value = Session Object
const sessions = new Map();

// Configuration
const MAX_SHORT_TERM = 12; // Keep last 12 messages
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Check every 1 hour

/**
 * Session Schema
 * @typedef {Object} Session
 * @property {Array<{role: string, content: string}>} shortTerm
 * @property {Array<string>} coreMemory
 * @property {string} topic
 * @property {number} lastActive
 */

/**
 * Get or Create Session
 * @param {string} remoteJid 
 * @returns {Session}
 */
const getSession = (remoteJid) => {
    if (!sessions.has(remoteJid)) {
        sessions.set(remoteJid, {
            shortTerm: [],
            coreMemory: [],
            topic: "",
            lastActive: Date.now()
        });
        // console.log(chalk.gray(`[MEMORY] New session created for ${remoteJid}`));
    }
    return sessions.get(remoteJid);
};

/**
 * Add Message to Memory
 * @param {string} remoteJid 
 * @param {'user'|'assistant'} role 
 * @param {string} content 
 */
const addMessage = (remoteJid, role, content) => {
    const session = getSession(remoteJid);
    
    // Update timestamp
    session.lastActive = Date.now();

    // Push new message
    session.shortTerm.push({ role, content });

    // Trim history (Keep last N)
    if (session.shortTerm.length > MAX_SHORT_TERM) {
        session.shortTerm = session.shortTerm.slice(-MAX_SHORT_TERM);
    }
};

/**
 * Build Context String for AI Prompt
 * Combines Core Memory + Topic + Short Term History
 * @param {string} remoteJid 
 * @returns {string} Formatted context string
 */
const buildContext = (remoteJid) => {
    const session = getSession(remoteJid);
    let contextBuffer = "";

    // 1. Core Memory (Facts)
    if (session.coreMemory.length > 0) {
        contextBuffer += "[FAKTA PENTING USER]:\n";
        session.coreMemory.forEach(fact => contextBuffer += `- ${fact}\n`);
        contextBuffer += "\n";
    }

    // 2. Active Topic
    if (session.topic) {
        contextBuffer += `[TOPIK SAAT INI]: ${session.topic}\n\n`;
    }

    // 3. Short Term History
    if (session.shortTerm.length > 0) {
        contextBuffer += "[RIWAYAT PERCAKAPAN]:\n";
        session.shortTerm.forEach(msg => {
            const roleName = msg.role === 'user' ? 'User' : 'AI Neardev';
            contextBuffer += `${roleName}: ${msg.content}\n`;
        });
        contextBuffer += "\n(Jawab respons User terakhir berdasarkan konteks di atas)\n";
    }

    return contextBuffer;
};

/**
 * Reset Session
 * @param {string} remoteJid 
 */
const resetSession = (remoteJid) => {
    if (sessions.has(remoteJid)) {
        sessions.delete(remoteJid);
        console.log(chalk.yellow(`[MEMORY] Session reset for ${remoteJid}`));
        return true;
    }
    return false;
};

/**
 * Set User Topic manually (optional)
 */
const setTopic = (remoteJid, topic) => {
    const session = getSession(remoteJid);
    session.topic = topic;
    session.lastActive = Date.now();
};

/**
 * Auto-Cleanup Service
 * Removes sessions inactive for > 24 hours
 */
setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;
    
    for (const [jid, session] of sessions.entries()) {
        if (now - session.lastActive > SESSION_TTL_MS) {
            sessions.delete(jid);
            deletedCount++;
        }
    }
    
    if (deletedCount > 0) {
        console.log(chalk.gray(`[MEMORY] Cleanup: Removed ${deletedCount} stale sessions.`));
    }
}, CLEANUP_INTERVAL_MS);

module.exports = {
    getSession,
    addMessage,
    buildContext,
    resetSession,
    setTopic
};
