/**
 * Command: !cek
 * Check if user has submitted attendance today
 */
const { getUserByPhone } = require('../services/database');
const { cekStatusHarian } = require('../services/magang');
const { getMessage } = require('../services/messageService');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

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

        const sendInteractiveButtons = async (text, footer, buttons) => {
            const msg = generateWAMessageFromContent(sender, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            body: proto.Message.InteractiveMessage.Body.create({ text: text }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: buttons.map(btn => ({
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: btn.displayText,
                                        id: btn.id
                                    })
                                }))
                            })
                        })
                    }
                }
            }, { quoted: msgObj });

            await sock.relayMessage(sender, msg.message, { messageId: msg.key.id });
        };

        if (status.success && status.sudahAbsen) {
            await sock.sendMessage(sender, { react: { text: getMessage('reaction_success'), key: msgObj.key } });
            const log = status.data;
            let reply = getMessage('!cek_done', senderNumber)
                .replace('{date}', log.date || 'Hari ini')
                .replace('{activity}', log.activity_log || '-');

            await sendInteractiveButtons(reply, "AbsenBot Interactive 🪄", [
                { displayText: "📜 Lihat Rapor", id: "!rapor" },
                { displayText: "📊 Dashboard", id: "!dashboard" }
            ]);
        } else if (status.success && !status.sudahAbsen) {
            const reply = getMessage('!cek_pending', senderNumber) + countdownText;
            await sendInteractiveButtons(reply, "AbsenBot Interactive 🪄", [
                { displayText: "✅ Absen Sekarang", id: "!absen" },
                { displayText: "🔄 Refresh Status", id: "!cek" }
            ]);
        } else {
            await sock.sendMessage(sender, { react: { text: getMessage('reaction_fail'), key: msgObj.key } });
            const reply = getMessage('!cek_error', senderNumber).replace('{error}', status.pesan) + countdownText;
            await sendInteractiveButtons(reply, "AbsenBot Interactive 🪄", [
                { displayText: "🔄 Coba Lagi (!cek)", id: "!cek" },
                { displayText: "⚙️ Pengaturan Panel", id: "!panel" }
            ]);
        }
    }
};
