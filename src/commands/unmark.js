
import fs from 'fs';
import path from 'path';

export default {
    name: 'unmark',
    description: 'Hapus tanda khusus pada user (Admin Only)',
    hidden: true,

    async execute(sock, msgObj, context) {
        const { sender, args } = context;
        const { ADMIN_NUMBERS } = await import('../config/constants.js');

        // Security: Admin Only
        const senderJid = msgObj.key.participant || msgObj.key.remoteJid;
        if (!ADMIN_NUMBERS.includes(senderJid)) return;

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
            const markedFile = path.join(process.cwd(), 'data/marked_users.json');
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
