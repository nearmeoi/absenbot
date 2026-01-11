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
            await sock.sendMessage(sender, { text: getMessage('group_only_command') }, { quoted: msgObj });
            return;
        }

        const allUsers = getAllUsers();
        if (allUsers.length === 0) {
            await sock.sendMessage(sender, { text: getMessage('group_list_empty') }, { quoted: msgObj });
            return;
        }

        await sock.sendMessage(sender, { react: { text: getMessage('reaction_wait'), key: msgObj.key } });

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
            let msgAlert = getMessage('group_who_header') + `\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
            belumAbsen.forEach(num => (msgAlert += `- @${num.split("@")[0]}\n`));
            msgAlert += `\nSegera lengkapi laporan harian Anda.`;

            await sock.sendMessage(sender, { text: msgAlert, mentions: belumAbsen }, { ephemeralExpiration: 86400 });
        } else {
            await sock.sendMessage(sender, { text: getMessage('group_who_all_done') }, { quoted: msgObj, ephemeralExpiration: 86400 });
        }
    }
};
