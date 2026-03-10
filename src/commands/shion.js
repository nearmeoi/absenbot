/**
 * Command: !shion
 * Roleplay AI Chat Assistant
 */
const { chatWithShion } = require('../services/extraApiService');
const chalk = require('chalk');

module.exports = {
    name: 'shion',
    aliases: ['shionai'],
    description: 'Chat dengan Shion (AI Roleplay)',
    async execute(sock, msgObj, context) {
        const { sender, args } = context;

        const prompt = (args || "").trim();
        if (!prompt) {
            await sock.sendMessage(sender, { 
                text: "Hai! Aku Shion. Mau ngobrol apa hari ini? Contoh: !shion halo shion, lagi apa?"
            }, { quoted: msgObj });
            return;
        }

        try {
            // Typing effect
            await sock.sendPresenceUpdate('composing', sender);
            
            const response = await chatWithShion(prompt);
            
            await sock.sendMessage(sender, { 
                text: response 
            }, { quoted: msgObj });

        } catch (e) {
            console.error('[CMD:SHION] Error:', e.message);
            await sock.sendMessage(sender, { 
                text: "⚠️ Shion lagi istirahat sebentar, coba lagi nanti ya!"
            }, { quoted: msgObj });
        }
    }
};
