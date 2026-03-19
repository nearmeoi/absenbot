
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'unmark',
    description: 'Hapus tanda khusus pada user (Admin Only)',
    hidden: true,

    async execute(sock, msgObj, context) {
        const { sender, args, isOwner } = context;

        // Security: Admin Only
        if (!isOwner) return;

        let targetJid = '';

        // 1. Check for Reply
        const quotedMsg = msgObj.message.extendedTextMessage?.contextInfo;
        if (quotedMsg?.participant) {
            targetJid = quotedMsg.participant;
        } 
        // 2. Check for Args (Phone number)
        else if (args) {
            targetJid = args.trim().replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        }

        if (!targetJid) {
            return sock.sendMessage(sender, { text: "❌ Silakan reply pesan orang yang ingin dihapus tandanya atau masukkan nomor HP." }, { quoted: msgObj });
        }

        try {
            const markedFile = path.join(__dirname, '../../data/marked_users.json');
            if (!fs.existsSync(markedFile)) return;

            let data = JSON.parse(fs.readFileSync(markedFile, 'utf8'));
            
            const initialLength = data.marked_users.length;
            data.marked_users = data.marked_users.filter(u => u.phone !== targetJid && u.lid !== targetJid);

            if (data.marked_users.length < initialLength) {
                fs.writeFileSync(markedFile, JSON.stringify(data, null, 2));
                return sock.sendMessage(sender, { text: "✅ Berhasil menghapus tanda khusus pada user tersebut." }, { quoted: msgObj });
            } else {
                return sock.sendMessage(sender, { text: "❌ User tidak ditemukan dalam daftar tanda khusus." }, { quoted: msgObj });
            }

        } catch (err) {
            console.error('[CMD:UNMARK] Error:', err);
            return sock.sendMessage(sender, { text: "❌ Terjadi kesalahan saat menghapus tanda." }, { quoted: msgObj });
        }
    }
};
