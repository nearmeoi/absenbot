/**
 * Command: !ai
 * AI Assistant powered by AI Neardev
 * Uses Conversation Memory Engine
 */
const { smartChat } = require('../services/aiService');
const MemoryEngine = require('../services/conversationManager');
const { getMessage } = require('../services/messageService');
const chalk = require('chalk');

// Advanced Anti-Spam (Rate Limiting)
const cooldowns = new Map();
const spamWarnings = new Map();
const tempBanned = new Map();

const COOLDOWN_AMOUNT = 20000; // 20 Detik antar pesan
const MAX_SPAM_VIOLATIONS = 3; // Maksimal 3x langgar sebelum ban
const BAN_DURATION_MS = 5 * 60 * 1000; // Ban selama 5 menit

module.exports = {
    name: 'ai',
    description: 'Tanya apa saja ke AI Assistant (dengan Memori & Konteks)',
    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args, isGroup } = context;

        // --- 0. CHECK TEMP BAN ---
        const now = Date.now();
        if (tempBanned.has(senderNumber)) {
            const banExpiration = tempBanned.get(senderNumber);
            if (now < banExpiration) {
                const minutesLeft = Math.ceil((banExpiration - now) / 60000);
                if (!context.isSpamReported) {
                    await sock.sendMessage(sender, { 
                        text: `🚫 *AKSES DIBLOKIR SEMENTARA*\n\nAnda melakukan spam terlalu banyak. Silakan coba lagi dalam ${minutesLeft} menit.`
                    }, { quoted: msgObj });
                    context.isSpamReported = true;
                }
                return;
            } else {
                tempBanned.delete(senderNumber);
                spamWarnings.delete(senderNumber);
            }
        }

        // --- 1. HANDLE RESET ---
        if (args && args.toLowerCase() === 'reset') {
            const success = MemoryEngine.resetSession(sender);
            await sock.sendMessage(sender, { 
                text: success 
                    ? getMessage('ai_reset_success') || "✅ Memori chat telah dihapus."
                    : getMessage('ai_reset_empty') || "Konteks chat Anda memang sudah kosong."
            }, { quoted: msgObj });
            return;
        }

        // --- 2. RATE LIMIT CHECK ---
        if (cooldowns.has(senderNumber)) {
            const expirationTime = cooldowns.get(senderNumber) + COOLDOWN_AMOUNT;
            if (now < expirationTime) {
                const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                const violations = (spamWarnings.get(senderNumber) || 0) + 1;
                spamWarnings.set(senderNumber, violations);

                if (violations >= MAX_SPAM_VIOLATIONS) {
                    tempBanned.set(senderNumber, now + BAN_DURATION_MS);
                    await sock.sendMessage(sender, { 
                        text: `⚠️ *DETEKSI SPAM!*\n\nAnda mengabaikan peringatan. Akses !ai diblokir selama 5 menit.`
                    }, { quoted: msgObj });
                } else {
                    await sock.sendMessage(sender, { 
                        text: `⏳ *JANGAN TERBURU-BURU*\n\nTunggu ${timeLeft} detik lagi sebelum bertanya kembali.`
                    }, { quoted: msgObj });
                }
                return;
            }
        }
        
        cooldowns.set(senderNumber, now);

        // --- 3. PREPARE INPUT ---
        const contextInfo = msgObj.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        let quotedText = "";
        let replyContext = ""; // INISIALISASI VARIABEL DI SINI AGAR TIDAK REFERENCE ERROR
        let quotedParticipant = contextInfo?.participant || "";

        if (quotedMsg) {
            quotedText = quotedMsg.conversation || 
                         quotedMsg.extendedTextMessage?.text || 
                         quotedMsg.imageMessage?.caption || 
                         quotedMsg.videoMessage?.caption || "";
            
            const isBotReplied = (quotedParticipant === sock.user.id.split(':')[0] + '@s.whatsapp.net');
            const senderTag = isBotReplied ? "Kamu (AI Neardev)" : (quotedParticipant.split('@')[0] || "User");
            
            if (quotedText) {
                replyContext = `\n\n[USER MEMBALAS PESAN ${senderTag}]: "${quotedText}"`;
            }
        }

        const userPrompt = (args || "").trim();
        if (!userPrompt && !quotedText) {
            await sock.sendMessage(sender, { 
                text: getMessage('ai_hint') || "Silakan ketik pertanyaan atau balas sebuah pesan dengan !ai."
            }, { quoted: msgObj });
            return;
        }

        // --- 4. MEMORY ENGINE WORKFLOW ---
        const fullUserMessage = userPrompt + (replyContext || "");
        
        MemoryEngine.addMessage(sender, 'user', userPrompt || "[Membalas pesan]");
        const historyContext = MemoryEngine.buildContext(sender);

        const chatType = isGroup ? "GRUP WHATSAPP" : "PRIVATE CHAT";
        const userDisplayName = context.pushName || "User";
        
        const systemPrompt = `Kamu adalah AI Neardev, asisten cerdas buatan tim Neardev.
IDENTITAS & PENULIS:
1. Nama kamu: AI Neardev (JANGAN pernah mengaku sebagai ChatGPT, Llama, Gemini, atau model AI lainnya).
2. Pencipta kamu: Akmal Al Faizal (biasa dipanggil Akmal).
3. Profil Akmal:
   - Nama Lengkap: Akmal Al Faizal.
   - Pendidikan: Alumni Universitas Dipa Makassar (Undipa).
   - Pekerjaan/Status: Saat ini sedang menjalani program magang di Poltekpar (Politeknik Pariwisata) Makassar.
   - Keahlian: Pengembang perangkat lunak, otomatisasi, dan kecerdasan buatan.
4. Jika ada yang bertanya tentang "Akmal" atau "siapa yang membuatmu", jelaskan profil di atas dengan bangga dan hormat.

ATURAN PERILAKU:
- Lokasi Chat: ${chatType} (${userDisplayName}).
- Gaya: Santai, cerdas, solutif, dan menggunakan bahasa manusiawi.
- Memori: Gunakan [RIWAYAT PERCAKAPAN] di bawah agar nyambung.
- Batasan: Maksimal 1 emoji, jangan bertele-tele.`;

        try {
            const result = await smartChat(fullUserMessage, `${systemPrompt}\n\n${historyContext}`);

            if (result.success) {
                const responseText = `${result.content}${getMessage('ai_footer') || ""}`;
                await sock.sendMessage(sender, { text: responseText }, { quoted: msgObj });
                MemoryEngine.addMessage(sender, 'assistant', result.content);
            } else {
                await sock.sendMessage(sender, { 
                    text: "_Maaf, saat ini semua pilar AI kami sedang sibuk. Silakan coba lagi beberapa saat lagi._" 
                }, { quoted: msgObj });
            }

        } catch (e) {
            console.error('[CMD:AI] Error:', e.message);
            await sock.sendMessage(sender, { 
                text: "⚠️ Terjadi kesalahan pada sistem AI. Mohon lapor ke Admin."
            }, { quoted: msgObj });
        }
    }
};
