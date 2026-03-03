/**
 * Command: !webapp
 * Sends the direct webapp URL to the user
 */
const { getAppUrl } = require('../services/messageService');
const { cekStatusHarian } = require('../services/magang');
const { getUserByPhone } = require('../services/database');

module.exports = {
    name: 'webapp',
    description: 'Dapatkan link Webapp Absensi',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber } = context;
        const user = getUserByPhone(senderNumber);
        
        if (!user) {
            await sock.sendMessage(sender, { text: 'Silakan daftar terlebih dahulu.' }, { quoted: msgObj });
            return;
        }

        const userUrl = getAppUrl(senderNumber);
        const MONEV_REAL_URL = 'https://monev.maganghub.kemnaker.go.id/dashboard';
        
        const status = await cekStatusHarian(user.email, user.password).catch(() => ({ success: false }));
        const isAttended = status.success && status.sudahAbsen;

        let text = "";
        if (isAttended) {
            text = `🔗 *LINK MONEV WEB*

Anda sudah absen hari ini. Gunakan link di bawah untuk melihat ringkasan atau detail di web resmi:

${MONEV_REAL_URL}`;
        } else {
            text = `🔗 *LINK ABSEN WEB*

Silakan klik link di bawah untuk mengisi laporan via Webapp:

${userUrl}`;
        }

        await sock.sendMessage(sender, { text: text }, { quoted: msgObj });
    }
};
