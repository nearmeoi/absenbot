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
        const { sender, isGroup } = context;
        const allUsers = getAllUsers();

        if (allUsers.length === 0) {
            await sock.sendMessage(sender, { text: getMessage('group_list_empty') }, { quoted: msgObj });
            return;
        }

        let participantIds = [];
        if (isGroup) {
            try {
                const metadata = await sock.groupMetadata(sender);
                participantIds = metadata.participants.map(p => p.id);
            } catch (e) {
                console.error(`[LISTUSER] Gagal ambil metadata grup: ${e.message}`);
            }
        }

        let userList = isGroup ? `*Daftar User Terdaftar di Grup Ini*\n\n` : `*Daftar User Terdaftar (${allUsers.length})*\n\n`;
        const mentions = [];
        let count = 0;

        allUsers.forEach((user) => {
            const phone = user.phone;
            const ids = user.identifiers || [phone];
            if (user.lid && !ids.includes(user.lid)) ids.push(user.lid);

            const matchedId = isGroup ? ids.find(id => participantIds.includes(id)) : phone;
            
            if (matchedId) {
                count++;
                mentions.push(matchedId);
                userList += `${count}. @${phone.split('@')[0]}\n`;
            }
        });

        if (count === 0 && isGroup) {
            await sock.sendMessage(sender, { text: "Tidak ada user terdaftar bot di grup ini." }, { quoted: msgObj });
            return;
        }

        await sock.sendMessage(sender, { text: userList, mentions }, { quoted: msgObj });
    }
};
