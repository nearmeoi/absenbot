const { downloadMediaMessage } = require('wileys');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

module.exports = {
    name: ['toimg', 'img'],
    description: 'Ubah sticker menjadi gambar (PNG)',
    async execute(sock, msg, context) {
        const { sender } = context;
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg || !quotedMsg.stickerMessage) {
                return await sock.sendMessage(sender, { text: '⚠️ Balas sticker yang ingin diubah menjadi gambar dengan perintah *!toimg*.' }, { quoted: msg });
            }

            const sticker = quotedMsg.stickerMessage;
            if (!sticker.mediaKey) {
                return await sock.sendMessage(sender, { text: '⚠️ Media sticker tidak dapat diunduh.' }, { quoted: msg });
            }

            const msgToDownload = {
                key: { 
                    ...msg.key, 
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant || msg.key.participant
                },
                message: quotedMsg
            };

            const buffer = await downloadMediaMessage(msgToDownload, 'buffer', {});
            if (!buffer) throw new Error('Gagal mengunduh sticker.');

            const outputPath = path.join(tempDir, `output_${Date.now()}.png`);

            // Always output as PNG (takes first frame if animated)
            await sharp(buffer)
                .png()
                .toFile(outputPath);

            await sock.sendMessage(sender, { image: fs.readFileSync(outputPath) }, { quoted: msg });
            
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        } catch (error) {
            console.error('[TOIMG] Error:', error);
            await sock.sendMessage(sender, { text: '❌ Gagal mengubah sticker ke gambar.' }, { quoted: msg });
        }
    }
};