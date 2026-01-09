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

        const existingUser = getUserByPhone(senderNumber);
        if (existingUser) {
            await sock.sendMessage(sender, { text: getMessage('already_registered') }, { quoted: msgObj, ephemeralExpiration: 86400 });
            return;
        }

        // Generate auth URL with the original sender ID (could be LID or phone)
        const authUrl = await generateAuthUrl(originalSenderId, async (result) => {
            if (result.success) {
                await sock.sendMessage(originalSenderId, { text: getMessage('registration_success') });
            } else {
                await sock.sendMessage(originalSenderId, {
                    text: getMessage('registration_failed').replace('{error}', result.message || 'Terjadi kesalahan saat registrasi.')
                });
            }
        });

        if (isGroup) {
            await sock.sendMessage(sender, { text: getMessage('registration_link_group') }, { quoted: msgObj, ephemeralExpiration: 86400 });
            await sock.sendMessage(originalSenderId, { text: getMessage('registration_link_private').replace('{url}', authUrl) });
        } else {
            await sock.sendMessage(sender, { text: getMessage('registration_link_private').replace('{url}', authUrl) }, { quoted: msgObj });
        }
    }
};
