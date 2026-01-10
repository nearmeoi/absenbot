/**
 * Command: !ingatkan
 * Remind users who haven't submitted attendance
 */
const { getAllUsers } = require('../services/database');
const { cekStatusHarian } = require('../services/magang');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'ingatkan',
    description: 'Ingatkan user yang belum absen',

    async execute(sock, msgObj, context) {
        const { sender, isGroup } = context;

        if (!isGroup) {
            await sock.sendMessage(sender, { text: getMessage('GROUP_ONLY_COMMAND') }, { quoted: msgObj });
            return;
        }

        const allUsers = getAllUsers();
        if (allUsers.length === 0) {
            await sock.sendMessage(sender, { text: getMessage('GROUP_LIST_EMPTY') }, { quoted: msgObj });
            return;
        }

        await sock.sendMessage(sender, { react: { text: getMessage('REACTION_WAIT'), key: msgObj.key } });

        let belumAbsen = [];

        for (const user of allUsers) {
            try {
                const status = await cekStatusHarian(user.email, user.password);
                if (status.success && !status.sudahAbsen) {
                    belumAbsen.push(user.phone);
                } else if (!status.success) {
                    belumAbsen.push(user.phone);
                }
            } catch (e) { }
        }

        if (belumAbsen.length > 0) {
            let msgAlert = getMessage('GROUP_WHO_HEADER') + `\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
            belumAbsen.forEach(num => (msgAlert += `- @${num.split("@")[0]}\n`));
            msgAlert += `\nSegera lengkapi laporan harian Anda.`;

            await sock.sendMessage(sender, { text: msgAlert, mentions: belumAbsen }, { ephemeralExpiration: 86400 });
        } else {
            await sock.sendMessage(sender, { text: getMessage('GROUP_WHO_ALL_DONE') }, { quoted: msgObj, ephemeralExpiration: 86400 });
        }
    }
};
