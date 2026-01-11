/**
 * Command: !ai
 * AI Assistant powered by AI Neardev
 * Uses Conversation Memory Engine
 */
const { smartChat } = require('../services/aiService');
const MemoryEngine = require('../services/conversationManager');
const { getMessage } = require('../services/messageService');
const chalk = require('chalk');

// Rate Limiting (Spam Protection)
const cooldowns = new Map();
const COOLDOWN_AMOUNT = 10000; // 10 seconds

module.exports = {
    name: 'ai',
    description: 'Tanya apa saja ke AI Assistant (dengan Memori & Konteks)',
    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args, isGroup } = context;

        // --- 1. HANDLE RESET ---
        if (args && args.toLowerCase() === 'reset') {
            const success = MemoryEngine.resetSession(sender);
            await sock.sendMessage(sender, { 
                text: success 
                    ? getMessage('ai_reset_success')
                    : getMessage('ai_reset_empty')
            }, { quoted: msgObj });
            return;
        }

        // --- 2. RATE LIMIT CHECK ---
        const now = Date.now();
        if (cooldowns.has(senderNumber)) {
            const expirationTime = cooldowns.get(senderNumber) + COOLDOWN_AMOUNT;
            if (now < expirationTime) {
                const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                if (timeLeft > 2) {
                    await sock.sendMessage(sender, { 
                        text: getMessage('ai_cooldown').replace('{seconds}', timeLeft)
                    }, { quoted: msgObj });
                }
                return;
            }
        }
        cooldowns.set(senderNumber, now);

        // --- 3. PREPARE INPUT ---
        // Handle Reply Context
        const contextInfo = msgObj.message?.extendedTextMessage?.contextInfo;
        const quotedMessage = contextInfo?.quotedMessage;
        let replyContext = "";
        
        if (quotedMessage) {
            const quotedText = quotedMessage.conversation || 
                               quotedMessage.extendedTextMessage?.text || 
                               quotedMessage.imageMessage?.caption || "";
            if (quotedText) {
                replyContext = `\n\n[USER ME-REPLY PESAN INI]: "${quotedText}"`;
            }
        }

        // Validate Input
        if ((!args || args.trim() === '') && !replyContext) {
            await sock.sendMessage(sender, { 
                text: getMessage('ai_hint')
            }, { quoted: msgObj });
            return;
        }

        // --- 4. MEMORY ENGINE WORKFLOW ---
        const userMessage = (args || "") + replyContext;
        
        // A. Add User Message to History
        MemoryEngine.addMessage(sender, 'user', userMessage);

        // B. Build Full Context (History + Core Memory)
        const historyContext = MemoryEngine.buildContext(sender);

        // C. Construct System Prompt
        const systemPrompt = `Kamu adalah AI Neardev.
Aturan:
1. Konteks: Kamu berada di ${isGroup ? 'Grup WhatsApp' : 'Private Chat'}.
2. Memori: Jawab berdasarkan [RIWAYAT PERCAKAPAN] di atas.
3. Gaya: Santai tapi to-the-point. Gunakan emoji SANGAT SEDIKIT (maksimal 1 per pesan).
4. Ringkas: Jangan bertele-tele.`;

        try {
            // D. Call AI Service
            const result = await smartChat(userMessage, `${systemPrompt}\n\n${historyContext}`);

            if (result.success) {
                const responseText = `${result.content}${getMessage('ai_footer')}`;
                await sock.sendMessage(sender, { text: responseText }, { quoted: msgObj });

                // E. Save AI Response to History
                MemoryEngine.addMessage(sender, 'assistant', result.content);

            } else {
                await sock.sendMessage(sender, { 
                    text: getMessage('ai_empty_response') 
                }, { quoted: msgObj });
            }

        } catch (e) {
            console.error('[CMD:AI] Error:', e.message);
            await sock.sendMessage(sender, { 
                text: getMessage('ai_error_system')
            }, { quoted: msgObj });
        }
    }
};