/**
 * Command: !pin
 * Pinterest Downloader/Search
 */
const { pinterestSearch } = require('../services/mediaDownloader');
const chalk = require('chalk');

module.exports = {
    name: 'pin',
    aliases: ['pinterest', 'pinterset'],
    description: 'Cari gambar dari Pinterest',
    async execute(sock, msgObj, context) {
        const { sender, args } = context;

        const query = (args || "").trim();
        if (!query) {
            await sock.sendMessage(sender, { 
                text: "Silakan masukkan kata kunci pencarian.\nContoh: !pin wallpaper aesthetic"
            }, { quoted: msgObj });
            return;
        }

        try {
            await sock.sendMessage(sender, { text: "⏳ Sedang mencari gambar..." }, { quoted: msgObj });
            
            const results = await pinterestSearch(query);
            
            if (results && results.length > 0) {
                // Ambil 3 hasil teratas saja agar tidak spam
                const topResults = results.slice(0, 3);
                
                for (const res of topResults) {
                    if (res.image) {
                        await sock.sendMessage(sender, { 
                            image: { url: res.image },
                            caption: `📌 *PINTEREST: ${query}*\n*Judul:* ${res.title || "Tanpa Judul"}`
                        }, { quoted: msgObj });
                    }
                }
            } else {
                await sock.sendMessage(sender, { text: "❌ Tidak menemukan gambar untuk kata kunci tersebut." }, { quoted: msgObj });
            }

        } catch (e) {
            console.error('[CMD:PIN] Error:', e.message);
            await sock.sendMessage(sender, { 
                text: "⚠️ Gagal mencari di Pinterest. Coba lagi nanti."
            }, { quoted: msgObj });
        }
    }
};
