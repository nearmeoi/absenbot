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

        // 1. Immediate check for empty input (FAST RESPONSE)
        if (!args || args.trim() === '') {
            const hint = `Silakan berikan keterangan aktivitas Anda hari ini setelah *!absen*.\n\n` +
                `_Contoh: !absen Hari ini saya belajar membuat API dan melakukan testing._\n\n` +
                `Atau gunakan format manual dengan bantuan template:\n` +
                `Ketik *!template* untuk mendapatkan format isian manual.`;
            
            await sock.sendMessage(sender, { text: hint }, { quoted: msgObj });
            return;
        }

        // 2. Check if user is registered
        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('AUTH_NOT_REGISTERED') }, { quoted: msgObj });
            return;
        }

        // 3. Pre-check: Already submitted today? (NETWORK CALL)
        try {
            const statusCheck = await cekStatusHarian(user.email, user.password);
            if (statusCheck.success && statusCheck.sudahAbsen) {
                const log = statusCheck.data;
                const reply = getMessage('ABSEN_CHECK_DONE')
                    .replace('{date}', log.date)
                    .replace('{activity}', log.activity_log ? log.activity_log.substring(0, 50) + '...' : '-');

                await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
                return;
            }
        } catch (e) {
            console.error("[CMD:ABSEN] Error pre-check:", e);
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
                const errorMsg = getMessage('ABSEN_TOO_SHORT').replace('{errors}', errors.join('\n'));
                await sock.sendMessage(sender, { text: errorMsg }, { quoted: msgObj });
                return;
            }
        } else {
            // AI mode
            const history = await getRiwayat(user.email, user.password, 3);
            const aiResult = await processFreeTextToReport(args, history.success ? history.logs : []);

            if (!aiResult.success) {
                await sock.sendMessage(sender, { text: getMessage('ABSEN_FAILED_AI').replace('{error}', aiResult.error) }, { quoted: msgObj });
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

        const previewText = getMessage('DRAFT_PREVIEW')
            .replace('{aktivitas_len}', reportData.aktivitas.length)
            .replace('{aktivitas}', reportData.aktivitas)
            .replace('{pembelajaran_len}', reportData.pembelajaran.length)
            .replace('{pembelajaran}', reportData.pembelajaran)
            .replace('{kendala_len}', reportData.kendala.length)
            .replace('{kendala}', reportData.kendala);

        if (isGroup) {
            await sock.sendMessage(sender, { text: getMessage('DRAFT_REDIRECT_PC') }, { quoted: msgObj });
            await sock.sendMessage(senderNumber, { text: previewText });
        } else {
            await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
        }
    }
};
