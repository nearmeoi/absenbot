const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('wileys');

module.exports = {
    name: 'setsticker',
    description: 'Set stiker khusus untuk user yang ditandai',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, textMessage } = context;

        // Cek apakah ini reply ke sebuah stiker
        const quotedMsg = msgObj.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const isSticker = quotedMsg?.stickerMessage;

        if (!isSticker) {
            return sock.sendMessage(sender, { 
                text: "❌ Silakan balas (reply) pada stiker yang ingin dijadikan stiker khusus Mahabintang dengan perintah *!setsticker*." 
            }, { quoted: msgObj });
        }

        try {
            await sock.sendMessage(sender, { react: { text: '⏳', key: msgObj.key } });

            // Download stiker
            const buffer = await downloadMediaMessage(
                { message: quotedMsg },
                'buffer',
                {},
                { 
                    logger: console,
                    reuploadRequest: sock.updateMediaMessage
                }
            );

            const stickerPath = path.join(__dirname, '../../public/img/stiker_bintang.webp');
            
            // Pastikan folder ada
            const imgDir = path.dirname(stickerPath);
            if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

            fs.writeFileSync(stickerPath, buffer);

            await sock.sendMessage(sender, { react: { text: '✅', key: msgObj.key } });
            await sock.sendMessage(sender, { 
                text: "✅ Stiker khusus untuk Mahabintang berhasil diperbarui!" 
            }, { quoted: msgObj });

        } catch (err) {
            console.error('[CMD:SETSTICKER] Error:', err);
            await sock.sendMessage(sender, { text: "❌ Gagal menyimpan stiker: " + err.message }, { quoted: msgObj });
        }
    }
};
