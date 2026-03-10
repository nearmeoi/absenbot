/**
 * Command: !ttsnatural
 * AI Natural Voice (ElevenLabs via Termai)
 */
const { textToSpeechNatural } = require('../services/extraApiService');
const chalk = require('chalk');

module.exports = {
    name: 'ttsnatural',
    aliases: ['ttsai', 'suara'],
    description: 'Ubah teks menjadi suara manusia alami (AI)',
    async execute(sock, msgObj, context) {
        const { sender, args } = context;

        const text = (args || "").trim();
        if (!text) {
            await sock.sendMessage(sender, { 
                text: "Silakan masukkan teks yang ingin diubah menjadi suara.\nContoh: !ttsnatural halo semuanya, selamat siang!"
            }, { quoted: msgObj });
            return;
        }

        if (text.length > 500) {
            return sock.sendMessage(sender, { text: "Teks terlalu panjang (maksimal 500 karakter)." }, { quoted: msgObj });
        }

        try {
            // Typing/Recording effect
            await sock.sendPresenceUpdate('recording', sender);
            
            const audioBuffer = await textToSpeechNatural(text);
            
            await sock.sendMessage(sender, { 
                audio: audioBuffer,
                mimetype: 'audio/mp4',
                ptt: true // Send as Voice Note
            }, { quoted: msgObj });

        } catch (e) {
            console.error('[CMD:TTSNATURAL] Error:', e.message);
            await sock.sendMessage(sender, { 
                text: "⚠️ Gagal memproses suara. Silakan coba lagi nanti."
            }, { quoted: msgObj });
        }
    }
};
