/**
 * Command: !daftar
 * Register user to the bot
 */
import { getUserByPhone } from '../services/database.js';
import { generateAuthUrl } from '../services/secureAuth.js';
import { getMessage } from '../services/messageService.js';

export default {
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

        const { sendInteractiveMessage } = await import('../utils/interactiveMessage.js');
        const buttons = [
            {
                name: 'cta_url',
                params: JSON.stringify({
                    display_text: 'DAFTAR SEKARANG',
                    url: authUrl,
                    merchant_url: authUrl,
                    id: '!daftar'
                })
            }
        ];

        if (isGroup) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_link_group', senderNumber) }, { quoted: msgObj, ephemeralExpiration: 86400 });
            await sendInteractiveMessage(sock, originalSenderId, {
                body: getMessage('!daftar_link_private', senderNumber).replace('{url}', authUrl),
                footer: "app.monev-absenbot.my.id",
                buttons: buttons
            });
        } else {
            await sendInteractiveMessage(sock, sender, {
                body: getMessage('!daftar_link_private', senderNumber).replace('{url}', authUrl),
                footer: "app.monev-absenbot.my.id",
                buttons: buttons
            }, { quoted: msgObj });
        }
    }
};
