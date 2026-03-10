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

        // Helper for countdown
        const calculateCountdown = (targetDay) => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const todayDate = now.getDate();
            
            let target = new Date(year, month, targetDay);
            if (todayDate > targetDay) {
                target = new Date(year, month + 1, targetDay);
            }
            
            const diff = target - new Date(year, month, todayDate);
            return Math.floor(diff / (1000 * 60 * 60 * 24));
        };

        // Check if user is registered
        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
            return;
        }

        const status = await cekStatusHarian(user.email, user.password);
        
        // Preparation for countdowns
        const daysToBatch3 = calculateCountdown(15);
        const daysToBatch2 = calculateCountdown(24);
        
        const countdownText = getMessage('cek_payout_info')
            .replace('{days3}', daysToBatch3)
            .replace('{days2}', daysToBatch2);

        if (status.success && status.sudahAbsen) {
            const log = status.data;
            let reply = getMessage('!cek_done', senderNumber)
                .replace('{date}', log.date || 'Hari ini')
                .replace('{activity}', log.activity_log || '-');

            await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
        } else if (status.success && !status.sudahAbsen) {
            await sock.sendMessage(sender, { text: getMessage('!cek_pending', senderNumber) + countdownText }, { quoted: msgObj });
        } else {
            await sock.sendMessage(sender, { text: getMessage('!cek_error', senderNumber).replace('{error}', status.pesan) + countdownText }, { quoted: msgObj });
        }
    }
};
