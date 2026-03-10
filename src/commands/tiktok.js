/**
 * Command: !tiktok
 * TikTok Downloader
 */
const { tiktokDl } = require('../services/mediaDownloader');
const chalk = require('chalk');

module.exports = {
    name: 'tiktok',
    aliases: ['tt', 'ttdl'],
    description: 'Download video TikTok tanpa watermark',
    async execute(sock, msgObj, context) {
        const { sender, args } = context;

        const url = (args || "").trim();
        if (!url || !url.includes('tiktok.com')) {
            await sock.sendMessage(sender, { 
                text: "Silakan masukkan link TikTok yang valid.\nContoh: !tiktok https://vt.tiktok.com/ZS..."
            }, { quoted: msgObj });
            return;
        }

        try {
            await sock.sendMessage(sender, { text: "⏳ Sedang mengambil video..." }, { quoted: msgObj });
            
            const res = await tiktokDl(url);
            
            if (res.status && res.data) {
                const videoUrl = res.data.find(v => v.type === 'nowatermark_hd')?.url || 
                                 res.data.find(v => v.type === 'nowatermark')?.url;
                
                if (videoUrl) {
                    await sock.sendMessage(sender, { 
                        video: { url: videoUrl },
                        caption: `🎬 *TIKTOK DOWNLOADED*\n\n*Judul:* ${res.title}\n*Creator:* ${res.author}\n*Durasi:* ${res.duration}`
                    }, { quoted: msgObj });
                } else if (res.data[0].type === 'photo') {
                    // Slide show/foto
                    for (const img of res.data) {
                        await sock.sendMessage(sender, { image: { url: img.url } });
                    }
                }
            } else {
                throw new Error("Video tidak ditemukan");
            }

        } catch (e) {
            console.error('[CMD:TIKTOK] Error:', e.message);
            await sock.sendMessage(sender, { 
                text: "⚠️ Gagal mendownload TikTok. Pastikan link benar atau coba lagi nanti."
            }, { quoted: msgObj });
        }
    }
};
