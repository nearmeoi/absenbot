/**
 * Command: !daftar
 * Register user to the bot
 */
const { getUserByPhone } = require('../services/database');
const { generateAuthUrl } = require('../services/secureAuth');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'daftar',
    description: 'Daftarkan akun ke bot',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, isGroup, args, originalSenderId } = context;

        // Ignore example email
        if (args.includes('emailmu@gmail.com')) return;

        // Check if user already exists
        const user = getUserByPhone(senderNumber);
        if (user) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_already_registered', senderNumber) }, { quoted: msgObj, ephemeralExpiration: 86400 });
            return;
        }

        // Generate auth URL with callback for notification
        const authUrl = await generateAuthUrl(originalSenderId, async (result) => {
            if (result.success) {
                await sock.sendMessage(originalSenderId, { text: getMessage('!daftar_success', senderNumber) });
            } else {
                await sock.sendMessage(originalSenderId, {
                    text: getMessage('!daftar_failed', senderNumber).replace('{error}', result.message || 'Terjadi kesalahan saat registrasi.')
                });
            }
        });

        if (isGroup) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_link_group', senderNumber) }, { quoted: msgObj, ephemeralExpiration: 86400 });
            await sock.sendMessage(originalSenderId, { text: getMessage('!daftar_link_private', senderNumber).replace('{url}', authUrl) });
        } else {
            await sock.sendMessage(sender, { text: getMessage('!daftar_link_private', senderNumber).replace('{url}', authUrl) }, { quoted: msgObj });
        }
    }
};
