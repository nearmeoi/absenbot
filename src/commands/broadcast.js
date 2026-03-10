/**
 * Command: !broadcast
 * Send message to all registered users (Admin only)
 */
const { getAllUsers } = require('../services/database');
const { ADMIN_NUMBERS } = require('../config/constants');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'broadcast',
    description: 'Kirim pesan ke semua user (Admin)',
    adminOnly: true,

    async execute(sock, msgObj, context) {
        const { sender, args } = context;

        // Check if admin
        if (!ADMIN_NUMBERS.includes(sender.replace('@s.whatsapp.net', ''))) {
            await sock.sendMessage(sender, { text: getMessage('admin_only') }, { quoted: msgObj });
            return;
        }

        if (!args) {
            await sock.sendMessage(sender, { text: getMessage('admin_broadcast_format') }, { quoted: msgObj });
            return;
        }

        const users = getAllUsers();

        let count = 0;
        for (const user of users) {
            try {
                // Larger delay to avoid ban and be annoying
                await new Promise(r => setTimeout(r, 4000));
                await sock.sendMessage(user.phone, { text: `📢 *INFORMASI PENTING*\n\n${args}` });
                count++;
            } catch (e) {
                console.error(`Gagal kirim ke ${user.phone}:`, e.message);
            }
        }

        await sock.sendMessage(sender, { text: `${getMessage('admin_broadcast_done')} (${count}/${users.length})` }, { quoted: msgObj });
    }
};
