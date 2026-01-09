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
        const { sender, senderNumber, args } = context;

        // Admin check
        const senderDigits = senderNumber.split('@')[0].replace(/:/g, '');
        const isAdmin = ADMIN_NUMBERS.some(num => senderDigits.includes(num) || num.includes(senderDigits));

        if (!isAdmin) {
            await sock.sendMessage(sender, { text: getMessage('broadcast_admin_only') }, { quoted: msgObj });
            return;
        }

        if (!args) {
            await sock.sendMessage(sender, { text: getMessage('broadcast_format') }, { quoted: msgObj });
            return;
        }

        const allUsers = getAllUsers();
        await sock.sendMessage(sender, { react: { text: getMessage('reaction_broadcast'), key: msgObj.key } });

        for (const u of allUsers) {
            try {
                await sock.sendMessage(u.phone, { text: args });
                await new Promise(r => setTimeout(r, 500));
            } catch (e) { }
        }

        await sock.sendMessage(sender, { text: getMessage('broadcast_done') }, { quoted: msgObj });
    }
};
