/**
 * Command: !ingatkan
 * Remind users who haven't submitted attendance
 */
import { getAllUsers } from '../services/database.js';
import { cekStatusHarian } from '../services/magang.js';
import { getMessage } from '../services/messageService.js';

export default {
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
