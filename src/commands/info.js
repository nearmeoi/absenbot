import { getAnnouncements } from '../services/apiService.js';
import { getUserByPhone } from '../services/database.js';
import { getMessage } from '../services/messageService.js';

export default {
    name: 'info',
    description: 'Menampilkan info/pengumuman terbaru dari Kemnaker',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber } = context;

        // 1. Authenticate User (Optional, but good for context)
        const user = getUserByPhone(senderNumber);
        
        await sock.sendMessage(sender, { react: { text: '⏳', key: msgObj.key } });

        // Use 'akmaljie12355@gmail.com' (Akmal) as the source account if the user is not registered
        // Or use the user's own account if registered.
        // For general info, using a known working account (Akmal) is reliable if the requester is not logged in.
        const sourceEmail = user ? user.email : 'akmaljie12355@gmail.com';

        const result = await getAnnouncements(sourceEmail);

        if (!result.success) {
            await sock.sendMessage(sender, { react: { text: '❌', key: msgObj.key } });
            await sock.sendMessage(sender, { text: `Gagal mengambil info: ${result.pesan}` }, { quoted: msgObj });
            return;
        }

        const announcements = result.data;

        if (!announcements || announcements.length === 0) {
            await sock.sendMessage(sender, { react: { text: '📭', key: msgObj.key } });
            await sock.sendMessage(sender, { text: 'Belum ada pengumuman terbaru dari Kemnaker.' }, { quoted: msgObj });
            return;
        }

        // Display all announcements
        let reply = `📢 *INFO KEMNAKER TERBARU*\n`;
        
        announcements.forEach((info, index) => {
            const date = new Date(info.updated_at).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            reply += `\n${index + 1}. ${info.content}\n`;
            reply += `   📅 ${date}\n`;
            if (index < announcements.length - 1) {
                reply += `   -------------------------\n`;
            }
        });

        await sock.sendMessage(sender, { react: { text: '✅', key: msgObj.key } });
        await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
    }
};
