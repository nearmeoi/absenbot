/**
 * Command: !setkonteks
 * Memberikan konteks/persona kepada AI untuk laporan yang lebih akurat
 */
const { cariUserHP, simpanKonteksUser } = require('../services/database');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'setkonteks',
    aliases: ['context', 'konteks', 'role'],
    description: 'Set profil/konteks Anda untuk AI (Personalization)',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args } = context;
        const user = cariUserHP(senderNumber);

        if (!user) {
            return await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
        }

        const newContext = args.trim();

        if (!newContext) {
            const currentCtx = user.context || '_Belum diatur_';
            const helpMsg = `*⚙️ KONTEKS AI ANDA*\n\n` +
                          `Saat ini: _"${currentCtx}"_\n\n` +
                          `*Cara Mengatur:* \n` +
                          `Ketik: *!setkonteks [peran & proyek Anda]*\n\n` +
                          `*Contoh:* \n` +
                          `_!setkonteks Akmal: Web Developer SIGAP PKM. Baru gabung tim (tahap awal)._\n\n` +
                          `_Konteks ini membantu AI agar tidak berhalusinasi dan memberikan laporan yang lebih masuk akal sesuai fase kerja Anda._`;
            return await sock.sendMessage(sender, { text: helpMsg }, { quoted: msgObj });
        }

        if (newContext.length < 10) {
            return await sock.sendMessage(sender, { text: "❌ Konteks terlalu pendek. Berikan deskripsi yang lebih jelas agar AI paham." }, { quoted: msgObj });
        }

        const success = simpanKonteksUser(user.email, newContext);

        if (success) {
            await sock.sendMessage(sender, { 
                text: `✅ *KONTEKS DISIMPAN!*\n\nAI sekarang mengenali Anda sebagai:\n_"${newContext}"_\n\nLaporan berikutnya akan menyesuaikan dengan profil ini.` 
            }, { quoted: msgObj });
        } else {
            await sock.sendMessage(sender, { text: "❌ Gagal menyimpan konteks. Silakan hubungi admin." }, { quoted: msgObj });
        }
    }
};
