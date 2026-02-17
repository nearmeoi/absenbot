
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'mark',
    description: 'Tandai user agar hanya menerima stiker saat memanggil bot (Admin Only)',
    hidden: true,

    async execute(sock, msgObj, context) {
        const { sender, args, isGroup } = context;
        const { ADMIN_NUMBERS } = require('../config/constants');

        // Security: Admin Only
        const senderJid = msgObj.key.participant || msgObj.key.remoteJid;
        console.log(`[DEBUG:MARK] Sender: ${senderJid} | Admins: ${JSON.stringify(ADMIN_NUMBERS)}`);
        if (!ADMIN_NUMBERS.includes(senderJid)) return;

        let targetJid = '';
        let targetName = 'User';

        // 1. Check for Reply
        const quotedMsg = msgObj.message.extendedTextMessage?.contextInfo;
        if (quotedMsg?.participant) {
            targetJid = quotedMsg.participant;
            targetName = msgObj.message.extendedTextMessage.contextInfo.quotedMessage?.conversation || "User";
        } 
        // 2. Check for Args (Phone number)
        else if (args) {
            targetJid = args.trim().replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        }

        if (!targetJid) {
            return sock.sendMessage(sender, { text: "❌ Silakan reply pesan orang yang ingin ditandai atau masukkan nomor HP." }, { quoted: msgObj });
        }

        try {
            const markedFile = path.join(__dirname, '../../data/marked_users.json');
            let data = { marked_users: [] };
            
            if (fs.existsSync(markedFile)) {
                data = JSON.parse(fs.readFileSync(markedFile, 'utf8'));
            }

            // Check if already exists
            const exists = data.marked_users.find(u => u.phone === targetJid || u.lid === targetJid);
            if (exists) return; // Silent exit

            // Add to list
            data.marked_users.push({
                name: targetName,
                phone: targetJid.includes('@lid') ? null : targetJid,
                lid: targetJid.includes('@lid') ? targetJid : null,
                sticker_path: "public/img/stiker_bintang.webp",
                reason: "Auto-marked via command"
            });

            fs.writeFileSync(markedFile, JSON.stringify(data, null, 2));
            // No response sent - SILENT MARK

        } catch (err) {
            console.error('[CMD:MARK] Silent Error:', err);
        }
    }
};
