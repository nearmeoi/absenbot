/**
 * Command: !settemplate
 * Set custom attendance template
 */
const { saveUserTemplate, getUserByPhone } = require('../services/database');
const { getMessage } = require('../services/messageService');
const { parseTagBasedReport } = require('../utils/messageUtils');

module.exports = {
    name: 'settemplate',
    description: 'Set template laporan harian otomatis',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args } = context;

        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
            return;
        }

        // View current template
        if (!args || args.trim() === '') {
            const currentTemplate = user.template;
            if (currentTemplate) {
                const parsed = parseTagBasedReport(currentTemplate);
                let displayText = "";

                if (parsed) {
                    displayText = `*TEMPLATE ANDA SAAT INI*\n\n` +
                        `*Aktivitas:* \n${parsed.aktivitas}\n\n` +
                        `*Pembelajaran:* \n${parsed.pembelajaran}\n\n` +
                        `*Kendala:* \n${parsed.kendala}`;
                } else {
                    displayText = `*TEMPLATE ANDA SAAT INI (MODE AI)*\n\n${currentTemplate}`;
                }

                await sock.sendMessage(sender, { 
                    text: displayText
                }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { 
                    text: `Anda belum memiliki template.\n\nKetik *!settemplate [teks]* untuk menyimpan.\n\nContoh Manual:\n!settemplate #aktivitas Isi aktivitas #pembelajaran Isi pembelajaran #kendala Isi kendala\n\nContoh AI:\n!settemplate Hari ini saya mengerjakan...` 
                }, { quoted: msgObj });
            }
            return;
        }

        // Save or Delete template
        const templateText = args.trim();

        // Check for delete command
        if (templateText.toLowerCase() === 'reset' || templateText.toLowerCase() === 'delete' || templateText.toLowerCase() === 'hapus') {
            saveUserTemplate(senderNumber, null); // Saving null removes the template key in DB (assuming saveUserTemplate handles it, or just sets it to null)
            // Wait, I need to check saveUserTemplate implementation. It sets `users[index].template = templateData`.
            // If templateData is null, it will be null in JSON. That works.
            
            await sock.sendMessage(sender, { 
                text: `*TEMPLATE BERHASIL DIHAPUS*\n\nAnda telah kembali ke mode manual (atau AI default).` 
            }, { quoted: msgObj });
            return;
        }
        
        // Basic validation
        if (templateText.length < 10) {
             await sock.sendMessage(sender, { text: "Template terlalu pendek. Mohon berikan detail lebih lengkap." }, { quoted: msgObj });
             return;
        }

        saveUserTemplate(senderNumber, templateText);

        await sock.sendMessage(sender, { 
            text: `*TEMPLATE BERHASIL DISIMPAN*\n\nSekarang Anda bisa ketik *!absen* untuk menggunakan template ini.\nSistem otomatis jam 23:59 juga akan menggunakan template ini.` 
        }, { quoted: msgObj });
    }
};
