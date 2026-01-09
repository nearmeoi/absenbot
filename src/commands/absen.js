/**
 * Command: !absen
 * Main attendance submission command
 */
const chalk = require('chalk');
const { getUserByPhone } = require('../services/database');
const { prosesLoginDanAbsen, cekStatusHarian, getRiwayat } = require('../services/magang');
const { generateAttendanceReport, processFreeTextToReport } = require('../services/aiService');
const { setDraft, getDraft, deleteDraft } = require('../services/previewService');
const { isHoliday } = require('../config/holidays');
const { loadGroupSettings } = require('../services/groupSettings');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'absen',
    description: 'Submit laporan harian',

async execute(sock, msgObj, context) {
        const { sender, senderNumber, args, isGroup } = context;

        // Check if user is registered
        const user = getUserByPhone(senderNumber);
        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('not_registered') }, { quoted: msgObj });
            return;
        }

        // Pre-check: Already submitted today?
        try {
            const statusCheck = await cekStatusHarian(user.email, user.password);
            if (statusCheck.success && statusCheck.sudahAbsen) {
                const log = statusCheck.data;
                const reply = getMessage('cek_sudah_absen')
                    .replace('{date}', log.date)
                    .replace('{activity}', log.activity_log ? log.activity_log.substring(0, 50) + '...' : '-');

                await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
                return;
            }
        } catch (e) {
            console.error("[CMD:ABSEN] Error pre-check:", e);
        }

        // Zero-input mode: Auto-generate from history
        if (!args || args.trim() === '') {
            await sock.sendMessage(sender, { text: getMessage('absen_loading') }, { quoted: msgObj });

            const history = await getRiwayat(user.email, user.password, 3);
            const aiResult = await generateAttendanceReport(history.success ? history.logs : []);

            if (!aiResult.success) {
                await sock.sendMessage(sender, { text: getMessage('absen_failed_auto') }, { quoted: msgObj });
                return;
            }

            const reportData = {
                aktivitas: aiResult.aktivitas,
                pembelajaran: aiResult.pembelajaran,
                kendala: aiResult.kendala,
                type: 'ai'
            };

            console.log(chalk.yellow('\n📦 [DEBUG] DATA SIAP KIRIM (AI GENERATED):'), JSON.stringify({
                aktivitas: reportData.aktivitas,
                pembelajaran: reportData.pembelajaran,
                kendala: reportData.kendala
            }, null, 2));

            setDraft(senderNumber, reportData);

            const previewText = `*DRAF LAPORAN OTOMATIS* 🤖\n\n` +
                `*Aktivitas:* (${reportData.aktivitas.length} karakter)\n${reportData.aktivitas}\n\n` +
                `*Pembelajaran:* (${reportData.pembelajaran.length} karakter)\n${reportData.pembelajaran}\n\n` +
                `*Kendala:* (${reportData.kendala.length} karakter)\n${reportData.kendala}\n\n` +
                `Ketik *ya* untuk kirim, atau ceritakan aktivitas Anda untuk laporan baru:\n` +
                `_Contoh: !absen belajar database_`;

            if (isGroup) {
                await sock.sendMessage(sender, { text: getMessage('draft_redirect_pc') }, { quoted: msgObj });
                await sock.sendMessage(senderNumber, { text: previewText });
            } else {
                await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
            }
            return;
        }

        // With args: Process report
        let reportData = { aktivitas: '', pembelajaran: '', kendala: '', type: '' };

        // Manual tag mode
        if (args.includes('#aktivitas') || args.includes('#pembelajaran')) {
            const parseTag = (tag) => {
                const regex = new RegExp(`#${tag}\\s*([\\s\\S]*?)(?=#|$)`, 'i');
                const match = args.match(regex);
                return match ? match[1].trim() : '';
            };

            reportData = {
                aktivitas: parseTag('aktivitas'),
                pembelajaran: parseTag('pembelajaran'),
                kendala: parseTag('kendala') || "Tidak ada kendala.",
                type: 'manual'
            };

            const MIN_CHARS = 100;
            const errors = [];

            if (reportData.aktivitas.length < MIN_CHARS) {
                errors.push(`Aktivitas: ${reportData.aktivitas.length} karakter (minimal ${MIN_CHARS})`);
            }
            if (reportData.pembelajaran.length < MIN_CHARS) {
                errors.push(`Pembelajaran: ${reportData.pembelajaran.length} karakter (minimal ${MIN_CHARS})`);
            }
            if (reportData.kendala.length < MIN_CHARS && reportData.kendala !== "Tidak ada kendala.") {
                errors.push(`Kendala: ${reportData.kendala.length} karakter (minimal ${MIN_CHARS})`);
            }

            if (errors.length > 0) {
                const errorMsg = getMessage('absen_too_short').replace('{errors}', errors.join('\n'));
                await sock.sendMessage(sender, { text: errorMsg }, { quoted: msgObj });
                return;
            }
        } else {
            // AI mode
            const history = await getRiwayat(user.email, user.password, 3);
            const aiResult = await processFreeTextToReport(args, history.success ? history.logs : []);

            if (!aiResult.success) {
                await sock.sendMessage(sender, { text: getMessage('absen_failed_ai').replace('{error}', aiResult.error) }, { quoted: msgObj });
                return;
            }

            reportData = {
                aktivitas: aiResult.aktivitas,
                pembelajaran: aiResult.pembelajaran,
                kendala: aiResult.kendala,
                type: 'ai'
            };
        }

        setDraft(senderNumber, reportData);

        const previewText = getMessage('draft_preview')
            .replace('{aktivitas_len}', reportData.aktivitas.length)
            .replace('{aktivitas}', reportData.aktivitas)
            .replace('{pembelajaran_len}', reportData.pembelajaran.length)
            .replace('{pembelajaran}', reportData.pembelajaran)
            .replace('{kendala_len}', reportData.kendala.length)
            .replace('{kendala}', reportData.kendala);

        if (isGroup) {
            await sock.sendMessage(sender, { text: getMessage('draft_redirect_pc') }, { quoted: msgObj });
            await sock.sendMessage(senderNumber, { text: previewText });
        } else {
            await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
        }
    }
};
