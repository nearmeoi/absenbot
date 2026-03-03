/**
 * Command: !menu / !hai
 * Shows the main menu with bot information
 */
const fs = require('fs');
const path = require('path');
const { getMessage } = require('../services/messageService');
const { sendInteractiveMessage } = require('../utils/interactiveMessage');
const { prepareWAMessageMedia } = require('@whiskeysockets/baileys');

const COVER_IMAGE = path.join(__dirname, '../../public/img/cover.png');

module.exports = {
    name: ['menu', 'hai', 'help'],
    description: 'Tampilkan menu utama',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber } = context;
        
        // Concise menu content
        const body = `*BOT MAGANGHUB*

Halo! Saya asisten absensi MagangHub Anda.

*FITUR UTAMA*
!absen - Kirim Lapor
!cek - Status Hari Ini
!riwayat - Log 7 Hari
!cekapprove - Status Siklus

*LAINNYA*
!ai - Tanya AI
!s - Buat Sticker
!all - Tag Semua

Pilih menu di bawah atau ketik perintahnya langsung.`;

        const buttons = [
            {
                name: 'quick_reply',
                params: JSON.stringify({
                    display_text: 'ABSEN SEKARANG',
                    id: '!absen'
                })
            },
            {
                name: 'quick_reply',
                params: JSON.stringify({
                    display_text: 'CEK STATUS',
                    id: '!cek'
                })
            },
            {
                name: 'single_select',
                params: JSON.stringify({
                    title: 'PILIH MENU',
                    sections: [
                        {
                            title: 'MENU ABSENSI',
                            rows: [
                                { title: 'Lapor (Semi-Auto)', description: 'Kirim laporan dengan bantuan AI', id: '!absen' },
                                { title: 'Cek Status', description: 'Cek status kehadiran hari ini', id: '!cek' },
                                { title: 'Riwayat Absen', description: 'Lihat riwayat laporan 7 hari terakhir', id: '!riwayat' },
                                { title: 'Cek Approve', description: 'Cek status siklus bulanan', id: '!cekapprove' }
                            ]
                        },
                        {
                            title: 'MENU TOOLS',
                            rows: [
                                { title: 'Buat Sticker', description: 'Ubah gambar/video jadi sticker', id: '!s' },
                                { title: 'Tanya AI', description: 'Tanya asisten AI apa saja', id: '!ai' },
                                { title: 'Ekstrak MP3', description: 'Ambil audio dari video', id: '!mp3' },
                                { title: 'Tag All', description: 'Tag semua anggota grup', id: '!all' }
                            ]
                        },
                        {
                            title: 'PANDUAN',
                            rows: [
                                { title: 'Cara Pakai', description: 'Panduan lengkap penggunaan bot', id: '!help' },
                                { title: 'Daftar Akun', description: 'Registrasi akun MagangHub', id: '!daftar' }
                            ]
                        }
                    ]
                })
            }
        ];

        try {
            let imageMsg;
            if (fs.existsSync(COVER_IMAGE)) {
                const media = await prepareWAMessageMedia({ image: fs.readFileSync(COVER_IMAGE) }, { upload: sock.waUploadToServer });
                imageMsg = media.imageMessage;
            }

            await sendInteractiveMessage(sock, sender, {
                title: "",
                body: body,
                footer: "app.monev-absenbot.my.id",
                buttons: buttons,
                image: imageMsg
            }, { quoted: msgObj });

        } catch (menuError) {
            console.error('[CMD:MENU] Error sending interactive menu:', menuError.message);
            // Fallback to simple text menu
            const info = getMessage('!menu', senderNumber);
            await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
        }
    }
};
