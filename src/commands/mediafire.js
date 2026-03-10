/**
 * Command: !mediafire
 * Mediafire Downloader
 */
const { mediafireDl } = require('../services/mediaDownloader');
const chalk = require('chalk');

module.exports = {
    name: 'mediafire',
    aliases: ['mf', 'mfdl'],
    description: 'Download file dari Mediafire',
    async execute(sock, msgObj, context) {
        const { sender, args } = context;

        const url = (args || "").trim();
        if (!url || !url.includes('mediafire.com')) {
            await sock.sendMessage(sender, { 
                text: "Silakan masukkan link Mediafire yang valid.\nContoh: !mediafire https://www.mediafire.com/file/..."
            }, { quoted: msgObj });
            return;
        }

        try {
            await sock.sendMessage(sender, { text: "⏳ Sedang mengambil info file..." }, { quoted: msgObj });
            
            const res = await mediafireDl(url);
            
            if (res.downloadUrl) {
                const caption = `📁 *MEDIAFIRE DOWNLOADER*\n\n*Nama:* ${res.fileName}\n*Ukuran:* ${res.fileSize}\n\n_File sedang dikirim, mohon tunggu..._`;
                await sock.sendMessage(sender, { text: caption }, { quoted: msgObj });
                
                await sock.sendMessage(sender, { 
                    document: { url: res.downloadUrl },
                    fileName: res.fileName,
                    mimetype: 'application/octet-stream'
                }, { quoted: msgObj });
            } else {
                throw new Error("File tidak ditemukan");
            }

        } catch (e) {
            console.error('[CMD:MEDIAFIRE] Error:', e.message);
            await sock.sendMessage(sender, { 
                text: "⚠️ Gagal mengambil file Mediafire. Link mungkin sudah mati atau file terlalu besar."
            }, { quoted: msgObj });
        }
    }
};
