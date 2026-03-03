/**
 * Command: !riwayat
 * Get attendance history
 */
const { getUserByPhone } = require('../services/database');
const { getRiwayat } = require('../services/magang');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'riwayat',
    description: 'Lihat riwayat absensi',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, isGroup, args } = context;

        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
            return;
        }

        let days = 1;
        if (args && !isNaN(parseInt(args))) {
            days = Math.min(Math.max(parseInt(args), 1), 7);
        }

        const result = await getRiwayat(user.email, user.password, days);

        if (result.success && result.logs.length > 0) {
            await sock.sendMessage(sender, { react: { text: getMessage('reaction_success'), key: msgObj.key } });
            let historyText = getMessage('!riwayat_header') + '\n';

            // Filter logs based on 'days' parameter
            const limit = days;
            const displayedLogs = result.logs.slice(0, limit);

            displayedLogs.forEach(log => {
                historyText += `\n━━━━━━━━━━━━━━━━━━\n`;
                historyText += `*${log.date}*\n`;
                if (log.missing || !log.activity_log) {
                    historyText += getMessage('!riwayat_empty') + '\n';
                } else {
                    historyText += `*Aktivitas:*\n${log.activity_log}\n\n`;
                    if (log.lesson_learned) {
                        historyText += `*Pembelajaran:*\n${log.lesson_learned}\n\n`;
                    }
                    if (log.obstacles) {
                        historyText += `*Kendala:*\n${log.obstacles}\n`;
                    }
                }
            });

            const { sendInteractiveMessage } = require('../utils/interactiveMessage');
            const targetJid = isGroup ? (msgObj.key.participant || msgObj.participant || sender) : sender;
            
            if (isGroup) {
                await sock.sendMessage(sender, { text: "✅ Riwayat absen Anda telah dikirim ke Chat Pribadi." }, { quoted: msgObj });
            }
            
            const buttons = [
                {
                    name: 'quick_reply',
                    params: JSON.stringify({ display_text: 'CEK APPROVAL', id: '!cekapprove' })
                },
                {
                    name: 'quick_reply',
                    params: JSON.stringify({ display_text: 'MENU UTAMA', id: '!menu' })
                }
            ];

            await sendInteractiveMessage(sock, targetJid, {
                title: "",
                body: historyText,
                footer: "app.monev-absenbot.my.id",
                buttons: buttons
            });
        } else {
            await sock.sendMessage(sender, { react: { text: getMessage('reaction_fail'), key: msgObj.key } });
            await sock.sendMessage(sender, { text: getMessage('!riwayat_failed') }, { quoted: msgObj });
        }
    }
};
