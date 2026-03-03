/**
 * Command: !cek
 * Check if user has submitted attendance today
 */
const { getUserByPhone } = require('../services/database');
const { cekStatusHarian } = require('../services/magang');
const { getMessage } = require('../services/messageService');
const chalk = require('chalk');

module.exports = {
    name: 'cek',
    description: 'Cek status absensi hari ini',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, isGroup } = context;

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

        const { getAppUrl } = require('../services/messageService');
        const webUrl = getAppUrl(senderNumber);

        const { sendInteractiveMessage } = require('../utils/interactiveMessage');

        const buttonsData = [];
        let footerText = "app.monev-absenbot.my.id";
        const userUrl = getAppUrl(senderNumber);
        const targetJid = sender; // Send back to where it came from

        if (status.success && status.sudahAbsen) {
            const reply = "*SUDAH ABSEN*\n\nAnda telah absen hari ini.";

            buttonsData.push({
                name: 'quick_reply',
                params: JSON.stringify({ display_text: 'CEK APPROVE', id: '!cekapprove' })
            });
            buttonsData.push({
                name: 'quick_reply',
                params: JSON.stringify({ display_text: 'RIWAYAT 7 HARI', id: '!riwayat' })
            });
            buttonsData.push({
                name: 'quick_reply',
                params: JSON.stringify({ display_text: 'MENU UTAMA', id: '!menu' })
            });

            await sendInteractiveMessage(sock, targetJid, {
                title: "",
                body: reply + "\n" + countdownText.trim(),
                footer: footerText,
                buttons: buttonsData
            }, { quoted: msgObj });

        } else if (status.success && !status.sudahAbsen) {
            const reply = "*BELUM ABSEN*\n\nAnda belum mengirim laporan hari ini.";
            
            buttonsData.push({
                name: 'quick_reply',
                params: JSON.stringify({ display_text: 'ABSEN SEKARANG', id: '!absen' })
            });
            buttonsData.push({
                name: 'cta_url',
                params: JSON.stringify({ display_text: 'ABSEN WEB', url: userUrl, merchant_url: userUrl })
            });

            await sendInteractiveMessage(sock, targetJid, {
                title: "",
                body: reply + "\n" + countdownText.trim(),
                footer: footerText,
                buttons: buttonsData
            }, { quoted: msgObj });

        } else {
            const reply = getMessage('!cek_error', senderNumber).replace('{error}', status.pesan);
            
            buttonsData.push({
                name: 'quick_reply',
                params: JSON.stringify({ display_text: 'COBA LAGI', id: '!cek' })
            });
            buttonsData.push({
                name: 'quick_reply',
                params: JSON.stringify({ display_text: 'MENU UTAMA', id: '!menu' })
            });

            await sendInteractiveMessage(sock, targetJid, {
                title: "",
                body: reply + "\n" + (countdownText ? countdownText.trim() : ""),
                footer: footerText,
                buttons: buttonsData
            }, { quoted: msgObj });
        }
    }
};
