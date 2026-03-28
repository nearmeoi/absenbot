/**
 * Command: !template
 * Sends an empty manual report template for copy-pasting
 */
import { getMessage } from '../services/messageService.js';

export default {
    name: 'template',
    description: 'Kirim format laporan manual',
    async execute(sock, msgObj, context) {
        const { sender } = context;

        const aText = "Aktivitas pada hari ini adalah ...";
        const pText = "Pembelajaran pada hari ini adalah ...";
        const kText = "Kendala pada hari ini adalah tidak ada.";

        const templateText = `*DRAF LAPORAN ANDA*\n\n` +
            `*Aktivitas:* (${aText.length} karakter)\n${aText}\n\n` +
            `*Pembelajaran:* (${pText.length} karakter)\n${pText}\n\n` +
            `*Kendala:* (${kText.length} karakter)\n${kText}\n\n` +
            `_Isi dan kirim balik pesan ini (min. 100 karakter)._`;

        const tipText = `Tips: Ingin lebih cepat? Ketik *!absen [cerita kegiatan]* dan biarkan AI menyusun laporannya untuk Anda!`;

        await sock.sendMessage(sender, { text: templateText }, { quoted: msgObj });
        await sock.sendMessage(sender, { text: tipText });
    }
};
