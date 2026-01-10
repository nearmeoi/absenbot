/**
 * Command: !listuser
 * List all registered users
 */
const { getAllUsers } = require('../services/database');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'listuser',
    description: 'Lihat daftar user terdaftar',

    async execute(sock, msgObj, context) {
        const { sender } = context;

        const allUsers = getAllUsers();
        if (allUsers.length === 0) {
            await sock.sendMessage(sender, { text: getMessage('GROUP_LIST_EMPTY') }, { quoted: msgObj });
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
