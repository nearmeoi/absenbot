/**
 * Command: Admin Group Controls
 * Replaces dashboard group management
 */
const { loadGroupSettings, updateGroup } = require('../services/groupSettings');
const { isAllowedGroup, addAllowedGroup, removeAllowedGroup, getAllowedGroups } = require('../config/holidays'); // Legacy allowed groups
const { ADMIN_NUMBERS } = require('../config/constants');
const chalk = require('chalk');

module.exports = {
    name: ['grouplist', 'groupset', 'groupallow'],
    description: 'Admin group management commands',

    async execute(sock, msgObj, context) {
        const { sender, commandName, args, log } = context;

        if (!ADMIN_NUMBERS.includes(sender)) {
            return sock.sendMessage(sender, { text: '❌ Anda tidak memiliki akses admin!' }, { quoted: msgObj });
        }

        switch (commandName) {
            case 'grouplist':
                const settings = loadGroupSettings();
                const allowedList = getAllowedGroups();

                let txt = `*DAFTAR GRUP TERDAFTAR*\n\n`;

                // Old allowed list combined with new settings view
                if (allowedList.length === 0 && Object.keys(settings).length === 0) {
                    txt += "Belum ada grup yang dimasukkan.";
                } else {
                    allowedList.forEach(groupId => {
                        const s = settings[groupId] || { schedulerEnabled: true }; // default
                        txt += `- ID: ${groupId}\n`;
                        txt += `  Scheduler (Tag): *${s.schedulerEnabled ? 'Aktif ✅' : 'Mati ❌'}*\n\n`;
                    });
                }

                txt += `\n*Gunakan:*\n!groupallow <add/del> <ID Grup> (Untuk mendaftarkan grup)\n!groupset <ID Grup> <on/off> (Untuk menyalakan/mematikan tag jadwal di grup tsb)`;

                return sock.sendMessage(sender, { text: txt }, { quoted: msgObj });

            case 'groupset':
                const targetGroupId = args[0];
                const state = args[1]?.toLowerCase();

                if (!targetGroupId || !['on', 'off'].includes(state)) {
                    return sock.sendMessage(sender, { text: '❌ Format: !groupset <GroupID> <on/off>\nContoh: !groupset 120363@g.us off' }, { quoted: msgObj });
                }

                const isEnable = (state === 'on');
                updateGroup(targetGroupId, { schedulerEnabled: isEnable });
                return sock.sendMessage(sender, { text: `✅ Scheduler / Tag Jadwal untuk grup *${targetGroupId}* sekarang *${isEnable ? 'AKTIF' : 'MATI'}*.` }, { quoted: msgObj });

            case 'groupallow':
                const allowAction = args[0]?.toLowerCase();
                const allowId = args[1];

                if (!allowId || !['add', 'del'].includes(allowAction)) {
                    return sock.sendMessage(sender, { text: '❌ Format: !groupallow <add/del> <GroupID>\n(Dapatkan GroupID dengan mengetik !gid di grup bersangkutan)' }, { quoted: msgObj });
                }

                if (allowAction === 'add') {
                    if (addAllowedGroup(allowId)) {
                        return sock.sendMessage(sender, { text: `✅ Grup *${allowId}* berhasil didaftarkan.` }, { quoted: msgObj });
                    } else {
                        return sock.sendMessage(sender, { text: `ℹ️ Grup *${allowId}* sudah terdaftar.` }, { quoted: msgObj });
                    }
                } else {
                    if (removeAllowedGroup(allowId)) {
                        return sock.sendMessage(sender, { text: `✅ Grup *${allowId}* berhasil dihapus.` }, { quoted: msgObj });
                    } else {
                        return sock.sendMessage(sender, { text: `❌ Grup *${allowId}* tidak ditemukan.` }, { quoted: msgObj });
                    }
                }
        }
    }
};
