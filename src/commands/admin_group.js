/**
 * Command: Admin Group Controls
 * Replaces dashboard group management
 */
const { loadGroupSettings, updateGroup } = require('../services/groupSettings');
const { isAllowedGroup, addAllowedGroup, removeAllowedGroup, getAllowedGroups } = require('../config/holidays'); // Legacy allowed groups
const { ADMIN_NUMBERS } = require('../config/constants');
const { reloadScheduler } = require('../services/scheduler');
const chalk = require('chalk');

module.exports = {
    name: ['grouplist', 'groupset', 'groupallow', 'grouptz', 'groupfind'],
    description: 'Admin group management commands',

    async execute(sock, msgObj, context) {
        const { sender, commandName, args, argsArray, isOwner } = context;

        if (!isOwner) {
            return sock.sendMessage(sender, { text: '❌ Anda tidak memiliki akses admin!' }, { quoted: msgObj });
        }

        switch (commandName) {
            case 'grouplist':
                try {
                    const searchTerm = args?.toLowerCase().trim() || '';

                    // Ambil semua grup di mana bot sedang bergabung
                    const groups = await sock.groupFetchAllParticipating();
                    let groupIds = Object.keys(groups);

                    // Filter jika ada kata kunci pencarian
                    if (searchTerm) {
                        groupIds = groupIds.filter(id =>
                            groups[id].subject.toLowerCase().includes(searchTerm) ||
                            id.includes(searchTerm)
                        );
                    }

                    if (groupIds.length === 0) {
                        const failMsg = searchTerm ? `❌ Tidak ditemukan grup dengan kata kunci: *${searchTerm}*` : "❌ Bot belum bergabung di grup mana pun.";
                        return sock.sendMessage(sender, { text: failMsg }, { quoted: msgObj });
                    }

                    // Pengaturan lama untuk info tambahan
                    const settings = loadGroupSettings();
                    const allowedList = getAllowedGroups();

                    let txt = searchTerm ? `🔍 *HASIL PENCARIAN GRUP: "${searchTerm}"*\n\n` : `*DAFTAR GRUP BOT ABSEN*\n\n`;
                    txt += `Ditemukan: *${groupIds.length}* grup\n\n`;

                    for (const id of groupIds) {
                        const group = groups[id];
                        const s = settings[id] || { schedulerEnabled: true };
                        const isAllowed = allowedList.includes(id);

                        // Menampilkan Nama Grup dan ID
                        txt += `*${group.subject}*\n`;
                        txt += `- ID: ${id}\n`;
                        txt += `- Scheduler: ${s.schedulerEnabled ? 'Aktif ✅' : 'Mati ❌'}\n`;
                        txt += `- Whitelist Mode: ${isAllowed ? 'Terdaftar ✅' : 'Belum ❌'}\n\n`;
                    }

                    txt += `*Keterangan Command:*\n`;
                    txt += `- !groupallow add <ID> : Masukkan grup ke whitelist liburan\n`;
                    txt += `- !groupset <ID> off/on : Matikan/Nyala tag jadwal di grup`;

                    return sock.sendMessage(sender, { text: txt }, { quoted: msgObj });
                } catch (e) {
                    console.error("Gagal mengambil daftar grup:", e);
                    return sock.sendMessage(sender, { text: "❌ Gagal mengambil daftar grup dari server WhatsApp." }, { quoted: msgObj });
                }

            case 'groupset':
                const targetGroupId = argsArray[0];
                const state = argsArray[1]?.toLowerCase();

                if (!targetGroupId || !['on', 'off'].includes(state)) {
                    return sock.sendMessage(sender, { text: '❌ Format: !groupset <GroupID> <on/off>\nContoh: !groupset 120363@g.us off' }, { quoted: msgObj });
                }

                const isEnable = (state === 'on');
                updateGroup(targetGroupId, { schedulerEnabled: isEnable });
                return sock.sendMessage(sender, { text: `✅ Scheduler / Tag Jadwal untuk grup *${targetGroupId}* sekarang *${isEnable ? 'AKTIF' : 'MATI'}*.` }, { quoted: msgObj });

            case 'groupallow':
                const allowAction = argsArray[0]?.toLowerCase();
                const allowId = argsArray[1];

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

            case 'grouptz':
                const tzGroupId = argsArray[0];
                const tzLabel = argsArray[1]?.toLowerCase();

                if (!tzGroupId || !['wib', 'wita', 'wit'].includes(tzLabel)) {
                    return sock.sendMessage(sender, { text: '❌ Format: !grouptz <GroupID> <wib/wita/wit>\nContoh: !grouptz 120363@g.us wib' }, { quoted: msgObj });
                }

                let tzValue = '';
                if (tzLabel === 'wib') tzValue = 'Asia/Jakarta';
                else if (tzLabel === 'wita') tzValue = 'Asia/Makassar';
                else if (tzLabel === 'wit') tzValue = 'Asia/Jayapura';

                updateGroup(tzGroupId, { timezone: tzValue });
                reloadScheduler();
                return sock.sendMessage(sender, { text: `✅ Zona waktu untuk grup *${tzGroupId}* berhasil diatur ke *${tzLabel.toUpperCase()}*.\n\nScheduler telah dimuat ulang.` }, { quoted: msgObj });

            case 'groupfind':
                try {
                    const query = args?.toLowerCase().trim();
                    if (!query) {
                        return sock.sendMessage(sender, { text: "❌ Format: !groupfind <nama_atau_id_grup>" }, { quoted: msgObj });
                    }

                    const groups = await sock.groupFetchAllParticipating();
                    const groupIds = Object.keys(groups);
                    const matches = groupIds.filter(id =>
                        groups[id].subject.toLowerCase().includes(query) ||
                        id.includes(query)
                    );

                    if (matches.length === 0) {
                        return sock.sendMessage(sender, { text: `❌ Tidak ditemukan grup yang cocok dengan: *${query}*` }, { quoted: msgObj });
                    }

                    let searchResult = `🔍 *HASIL PENCARIAN GRUP: "${query}"*\n\n`;
                    for (const id of matches) {
                        searchResult += `*${groups[id].subject}*\n- ID: ${id}\n\n`;
                    }
                    searchResult += `_Gunakan ID di atas untuk !groupallow atau !groupset._`;

                    return sock.sendMessage(sender, { text: searchResult }, { quoted: msgObj });
                } catch (e) {
                    console.error("Gagal cari grup:", e);
                    return sock.sendMessage(sender, { text: "❌ Terjadi error saat mencari grup." }, { quoted: msgObj });
                }
        }
    }
};
