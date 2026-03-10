/**
 * Command: !bot
 * Autonomous Server Bridge via Gemini CLI
 * WARNING: Powerful command. Admin only.
 */
const { executeGeminiPrompt } = require('../services/geminiCliService');
const chalk = require('chalk');

module.exports = {
    name: 'bot',
    description: 'Akses Gemini CLI langsung di server (Admin Only)',
    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args, isOwner } = context;

        // --- 1. SECURITY CHECK (Admin Only) ---
        if (!isOwner) {
            console.warn(chalk.yellow(`[CMD:BOT] Unauthorized attempt from ${senderNumber}`));
            await sock.sendMessage(sender, { 
                text: "⛔ Maaf, perintah ini hanya untuk Admin/Owner."
            }, { quoted: msgObj });
            return;
        }

        // --- 2. VALIDATE INPUT ---
        if (!args || args.trim() === '') {
            await sock.sendMessage(sender, { 
                text: "💡 Gunakan: !bot [prompt]\nContoh: !bot list folder di server kamu"
            }, { quoted: msgObj });
            return;
        }

        // --- 3. PROCESS GEMINI CLI ---
        try {
            // Memberikan indikasi bahwa bot sedang memproses
            await sock.sendMessage(sender, { text: "⏳ Sedang memproses ke Gemini CLI..." }, { quoted: msgObj });

            const result = await executeGeminiPrompt(args);

            if (result.success) {
                // Berikan output hasil eksekusi
                const responseText = `🤖 *Gemini CLI Output:*\n\n${result.output}`;
                
                // Jika output terlalu panjang, pecah atau beri info
                if (responseText.length > 4000) {
                    const chunks = responseText.match(/.{1,4000}/gs);
                    for (const chunk of chunks) {
                        await sock.sendMessage(sender, { text: chunk });
                    }
                } else {
                    await sock.sendMessage(sender, { text: responseText }, { quoted: msgObj });
                }

            } else {
                await sock.sendMessage(sender, { 
                    text: `❌ Gagal memproses prompt.\n\n*Error:*\n${result.error || 'Terjadi kesalahan internal'}`
                }, { quoted: msgObj });
            }

        } catch (e) {
            console.error('[CMD:BOT] Error:', e.message);
            await sock.sendMessage(sender, { 
                text: `🔥 Fatal Error: ${e.message}`
            }, { quoted: msgObj });
        }
    }
};
