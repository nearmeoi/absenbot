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
            await sock.sendMessage(sender, { text: getMessage('not_registered') }, { quoted: msgObj });
            return;
        }

        await sock.sendMessage(sender, { react: { text: getMessage('reaction_wait'), key: msgObj.key } });
        const status = await cekStatusHarian(user.email, user.password);

        if (status.success) {
            await sock.sendMessage(sender, { react: { text: getMessage('reaction_success'), key: msgObj.key } });
            if (status.sudahAbsen) {
                const log = status.data;
                let reply = getMessage('cek_sudah_absen')
                    .replace('{date}', log.date)
                    .replace('{activity}', log.activity_log.substring(0, 100));
                await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { text: getMessage('cek_belum_absen') }, { quoted: msgObj });
            }
        } else {
            await sock.sendMessage(sender, { react: { text: getMessage('reaction_fail'), key: msgObj.key } });
            await sock.sendMessage(sender, { text: getMessage('cek_error').replace('{error}', status.pesan) }, { quoted: msgObj });
        }
    }
};
