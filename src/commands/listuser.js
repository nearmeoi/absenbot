/**
 * Command: !listuser
 * List all registered users
 */
import { getAllUsers } from '../services/database.js';
import { getMessage } from '../services/messageService.js';

export default {
    name: 'listuser',
    description: 'Lihat daftar user terdaftar',

    async execute(sock, msgObj, context) {
        const { sender } = context;
        const users = getAllUsers();

        if (users.length === 0) {
            await sock.sendMessage(sender, { text: getMessage('group_list_empty') }, { quoted: msgObj });
            return;
        }

        let userList = `*Daftar User Terdaftar (${allUsers.length})*\n\n`;
        const mentions = [];

        allUsers.forEach((user, index) => {
            const phone = user.phone;
            mentions.push(phone);
            userList += `${index + 1}. @${phone.split('@')[0]}\n`;
        });

        await sock.sendMessage(sender, { text: userList, mentions }, { quoted: msgObj });
    }
};
