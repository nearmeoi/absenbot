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

        // --- NEW LOGIC: Filter by Group Membership ---
        let participantIds = [];
        try {
            const metadata = await sock.groupMetadata(sender);
            participantIds = metadata.participants.map(p => p.id);
        } catch (e) {
            console.error(chalk.red(`[INGATKAN] Gagal ambil metadata grup: ${e.message}`));
        }

        let belumAbsen = [];
        let mentions = [];

        for (const user of allUsers) {
            // Check if user (or any of their identifiers) is in this group
            const ids = user.identifiers || [user.phone];
            if (user.lid && !ids.includes(user.lid)) ids.push(user.lid);
            
            const matchedId = ids.find(id => participantIds.includes(id));
            if (!matchedId) continue; // Skip if not in this group

            try {
                const status = await cekStatusHarian(user.email, user.password);
                if (status.success && !status.sudahAbsen) {
                    belumAbsen.push(user.phone);
                    mentions.push(matchedId);
                } else if (!status.success) {
                    belumAbsen.push(user.phone);
                    mentions.push(matchedId);
                }
            } catch (e) { }
        }

        if (belumAbsen.length > 0) {
            let msgAlert = getMessage('group_who_header') + `\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
            belumAbsen.forEach(num => (msgAlert += `- @${num.split("@")[0]}\n`));
            msgAlert += `\nSegera lengkapi laporan harian Anda.`;

            await sock.sendMessage(sender, { text: msgAlert, mentions: mentions }, { ephemeralExpiration: 86400 });
        } else {
            await sock.sendMessage(sender, { text: getMessage('group_who_all_done') }, { quoted: msgObj, ephemeralExpiration: 86400 });
        }
    }
};
