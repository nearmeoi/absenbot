/**
 * Command: !hapus
 * Delete user account from the bot
 */
import { getUserByPhone, deleteUser } from '../services/database.js';
import { getMessage } from '../services/messageService.js';

export default {
    name: 'hapus',
    description: 'Hapus akun dari bot',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber } = context;

        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('!hapus_not_found') }, { quoted: msgObj });
            return;
        }

        const deleted = deleteUser(senderNumber);
        if (deleted) {
            await sock.sendMessage(sender, { text: getMessage('!hapus_success') }, { quoted: msgObj });
        } else {
            await sock.sendMessage(sender, { text: getMessage('!hapus_failed') }, { quoted: msgObj });
        }
    }
};
