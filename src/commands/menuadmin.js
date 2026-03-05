/**
 * Command: !menuadmin
 * Menampilkan daftar perintah khusus admin bot
 */
const { ADMIN_NUMBERS } = require('../config/constants');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'menuadmin',
    aliases: ['adminmenu', 'adm'],
    description: 'Menampilkan menu khusus admin',

    async execute(sock, msgObj, context) {
        const { sender, isOwner } = context;

        // Cek apakah pengirim adalah admin (owner)
        if (!isOwner && !ADMIN_NUMBERS.includes(sender)) {
            await sock.sendMessage(sender, { text: "❌ Maaf, menu ini hanya dapat diakses oleh Admin Bot." }, { quoted: msgObj });
            return;
        }

        const menuText = `🛠️ *MENU ADMIN ABSENBOT* 🛠️

*🤖 BOT CONTROL*
- *!botstatus* : Cek status koneksi & scheduler
- *!setstatus <online|offline|maintenance>* : Ubah status bot
- *!maintenance <command>* : Matikan/aktifkan fitur tertentu
- *!restart* : Restart bot via PM2
- *!resetsession* : Hapus sesi WA & pairing ulang

*👥 GROUP MANAGEMENT*
- *!grouplist* : Lihat daftar grup yang terdaftar (dijadikan target tag)
- *!groupallow add <GroupID>* : Daftarkan grup baru
- *!groupallow del <GroupID>* : Hapus grup dari daftar
- *!groupset <GroupID> <on/off>* : Nyalakan/matikan tag otomatis di grup tersebut
- *!getid* : Ambil ID grup atau ID user (alias: !gid)

*📅 SCHEDULE & HOLIDAY*
- *!schedule list* : Lihat daftar jadwal pengingat
- *!schedule add* : Tambah jadwal baru
- *!holiday list* : Lihat daftar hari libur
- *!holiday add <yyyy-mm-dd> <nama>* : Tambah hari libur baru

*📢 BROADCAST*
- *!bc <pesan>* : Kirim pesan ke semua grup terdaftar
- *!bcall <pesan>* : Kirim pesan ke semua chat (personal & grup)

*👤 USER DATA*
- *!listuser* : Lihat daftar user terdaftar
- *!info <@tag/nomor>* : Lihat detail data user

_Gunakan perintah dengan bijak._`;

        await sock.sendMessage(sender, { text: menuText }, { quoted: msgObj });
    }
};
