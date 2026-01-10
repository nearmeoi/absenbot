/**
 * Command: !cek
 * Check if user has submitted attendance today
 */
const { getUserByPhone } = require('../services/database');
const { cekStatusHarian } = require('../services/magang');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'cek',
    description: 'Cek status absensi hari ini',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber } = context;

        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('AUTH_NOT_REGISTERED') }, { quoted: msgObj });
            return;
        }

        await sock.sendMessage(sender, { react: { text: getMessage('REACTION_WAIT'), key: msgObj.key } });
        const status = await cekStatusHarian(user.email, user.password);

        if (status.success) {
            await sock.sendMessage(sender, { react: { text: getMessage('REACTION_SUCCESS'), key: msgObj.key } });
            if (status.sudahAbsen) {
                const log = status.data;
                let reply = getMessage('ABSEN_CHECK_DONE')
                    .replace('{date}', log.date)
                    .replace('{activity}', log.activity_log.substring(0, 100));
                await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { text: getMessage('ABSEN_CHECK_PENDING') }, { quoted: msgObj });
            }
        } else {
            await sock.sendMessage(sender, { react: { text: getMessage('REACTION_FAIL'), key: msgObj.key } });
            await sock.sendMessage(sender, { text: getMessage('ABSEN_CHECK_ERROR').replace('{error}', status.pesan) }, { quoted: msgObj });
        }
    }
};
