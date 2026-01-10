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
            await sock.sendMessage(sender, { text: getMessage('AUTH_NOT_REGISTERED') }, { quoted: msgObj });
            return;
        }

        let days = 1;
        if (args && !isNaN(parseInt(args))) {
            days = Math.min(Math.max(parseInt(args), 1), 7);
        }

        await sock.sendMessage(sender, { react: { text: getMessage('REACTION_WAIT'), key: msgObj.key } });
        const result = await getRiwayat(user.email, user.password, days);

        if (result.success && result.logs.length > 0) {
            await sock.sendMessage(sender, { react: { text: getMessage('REACTION_SUCCESS'), key: msgObj.key } });
            let historyText = getMessage('ABSEN_HISTORY_HEADER') + '\n';

            result.logs.forEach(log => {
                historyText += `\n━━━━━━━━━━━━━━━━━━\n`;
                historyText += `*${log.date}*\n`;
                if (log.missing || !log.activity_log) {
                    historyText += getMessage('ABSEN_HISTORY_EMPTY') + '\n';
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

            const targetJid = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;
            if (isGroup) await sock.sendMessage(sender, { text: getMessage('ABSEN_HISTORY_SENT_PRIVATE') }, { quoted: msgObj });
            await sock.sendMessage(targetJid, { text: historyText });
        } else {
            await sock.sendMessage(sender, { text: getMessage('ABSEN_HISTORY_FAILED') }, { quoted: msgObj });
        }
    }
};
