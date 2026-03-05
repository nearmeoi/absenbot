/**
 * Command: Admin Holiday Controls
 * Replaces dashboard holiday management
 */
const { isHoliday, addHoliday, removeHoliday, getAllHolidays } = require('../config/holidays');
const { ADMIN_NUMBERS } = require('../config/constants');

module.exports = {
    name: 'holiday',
    description: 'Admin holiday management',

    async execute(sock, msgObj, context) {
        const { sender, args } = context;

        if (!ADMIN_NUMBERS.includes(sender)) {
            return sock.sendMessage(sender, { text: '❌ Anda tidak memiliki akses admin!' }, { quoted: msgObj });
        }

        const action = args[0]?.toLowerCase();

        switch (action) {
            case 'list':
                const holidays = getAllHolidays();
                let txt = `*DAFTAR HARI LIBUR NASIONAL/PILIHAN*\n\n`;
                if (holidays.length === 0) {
                    txt += "Belum ada hari libur yang ditambahkan.";
                } else {
                    holidays.forEach(h => {
                        txt += `- ${h}\n`;
                    });
                }
                txt += `\n*Note:* Akhir pekan (Sabtu & Minggu) otomatis dihitung libur.`;
                return sock.sendMessage(sender, { text: txt }, { quoted: msgObj });

            case 'add':
                const addDate = args[1];
                if (!addDate || !/^\d{4}-\d{2}-\d{2}$/.test(addDate)) {
                    return sock.sendMessage(sender, { text: '❌ Format: !holiday add <YYYY-MM-DD>\nContoh: !holiday add 2026-08-17' }, { quoted: msgObj });
                }

                if (addHoliday(addDate)) {
                    return sock.sendMessage(sender, { text: `✅ Tanggal *${addDate}* berhasil ditambahkan ke daftar libur.` }, { quoted: msgObj });
                } else {
                    return sock.sendMessage(sender, { text: `ℹ️ Tanggal *${addDate}* sudah ada di daftar libur.` }, { quoted: msgObj });
                }

            case 'del':
                const delDate = args[1];
                if (!delDate || !/^\d{4}-\d{2}-\d{2}$/.test(delDate)) {
                    return sock.sendMessage(sender, { text: '❌ Format: !holiday del <YYYY-MM-DD>\nContoh: !holiday del 2026-08-17' }, { quoted: msgObj });
                }

                if (removeHoliday(delDate)) {
                    return sock.sendMessage(sender, { text: `✅ Tanggal *${delDate}* berhasil dihapus dari daftar libur.` }, { quoted: msgObj });
                } else {
                    return sock.sendMessage(sender, { text: `❌ Tanggal *${delDate}* tidak ditemukan.` }, { quoted: msgObj });
                }

            default:
                const helpTxt = `*COMMANDS HOLIDAY*\n` +
                    `- !holiday list (Lihat daftar libur)\n` +
                    `- !holiday add YYYY-MM-DD (Tambah libur)\n` +
                    `- !holiday del YYYY-MM-DD (Hapus libur)`;
                return sock.sendMessage(sender, { text: helpTxt }, { quoted: msgObj });
        }
    }
};
