const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: ['toimg', 'tovid', 'img', 'tovideo'],
    description: 'Ubah sticker menjadi gambar atau video',
    async execute(sock, msg, context) {
        const { sender } = context;
        const tempDir = path.join(process.cwd(), 'temp');

        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        try {
            // 1. Identify Sticker
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            // Target must be a quoted message containing a sticker
            if (!quotedMsg || !quotedMsg.stickerMessage) {
                return await sock.sendMessage(sender, { text: '⚠️ Silakan reply sticker yang ingin diubah menjadi gambar/video dengan caption *!toimg*.' }, { quoted: msg });
            }

            const isAnimated = quotedMsg.stickerMessage.isAnimated;

            // Construct fake message for download
            const msgToDownload = {
                key: { ...msg.key, id: msg.message.extendedTextMessage.contextInfo.stanzaId },
                message: quotedMsg
            };

            // 2. Download Sticker
            const buffer = await downloadMediaMessage(
                msgToDownload,
                'buffer',
                { },
                { logger: console }
            );

            if (!buffer) throw new Error('Gagal mengunduh sticker.');

            const timestamp = Date.now();
            const inputPath = path.join(tempDir, `sticker_${timestamp}.webp`);
            const outputPath = path.join(tempDir, `output_${timestamp}.${isAnimated ? 'mp4' : 'png'}`);

            fs.writeFileSync(inputPath, buffer);

            // 3. Convert
            if (isAnimated) {
                // Convert WebP (Animated) to MP4
                // -vf: scale to even numbers (required by some encoders), clean transparency with black background
                await execPromise(`ffmpeg -i "${inputPath}" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${outputPath}"`);
                
                await sock.sendMessage(sender, { 
                    video: fs.readFileSync(outputPath),
                    caption: '✅ Konversi ke Video Berhasil (@Neardev)'
                }, { quoted: msg });

            } else {
                // Convert WebP (Static) to PNG
                await execPromise(`ffmpeg -i "${inputPath}" "${outputPath}"`);

                await sock.sendMessage(sender, { 
                    image: fs.readFileSync(outputPath),
                    caption: '✅ Konversi ke Gambar Berhasil (@Neardev)'
                }, { quoted: msg });
            }

            // 4. Cleanup
            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);

        } catch (error) {
            console.error('[TOIMG] Error:', error);
            await sock.sendMessage(sender, { text: '❌ Gagal mengonversi sticker.' }, { quoted: msg });
        }
    }
};
