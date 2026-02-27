/**
 * Command: !absen
 * Main attendance submission command
 */
const chalk = require('chalk');
const { getUserByPhone } = require('../services/database');
const { prosesLoginDanAbsen, cekStatusHarian, getRiwayat } = require('../services/magang');
const { generateAttendanceReport, processFreeTextToReport } = require('../services/aiService');
const { setDraft, getDraft, deleteDraft, formatDraftPreview } = require('../services/previewService');
const { isHoliday } = require('../config/holidays');
const { loadGroupSettings } = require('../services/groupSettings');
const { getMessage } = require('../services/messageService');
const { parseTagBasedReport } = require('../utils/messageUtils');

module.exports = {
    name: 'absen',
    description: 'Submit laporan harian',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args, isGroup, originalSenderId } = context;
        let contentToProcess = args ? args.trim() : '';

        // 2. Check if user is registered
        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
            return;
        }

        // 1. Logic: If empty args, check for template
        if (!contentToProcess) {
            if (user.template) {
                contentToProcess = user.template;
            } else {
                const hint = getMessage('!absen_hint', senderNumber);
                await sock.sendMessage(sender, { text: hint }, { quoted: msgObj });
                return;
            }
        }

        // 3. Pre-check + History fetch IN PARALLEL (saves ~2-3s)
        const [statusCheck, history] = await Promise.all([
            cekStatusHarian(user.email, user.password).catch(e => {
                console.error("[CMD:ABSEN] Error pre-check:", e.message);
                return { success: false };
            }),
            getRiwayat(user.email, user.password, 3).catch(e => ({ success: false, logs: [] }))
        ]);

        if (statusCheck.success && statusCheck.sudahAbsen) {
            const log = statusCheck.data;
            const reply = getMessage('!cek_done', senderNumber)
                .replace('{date}', log.date)
                .replace('{activity}', log.activity_log ? log.activity_log.substring(0, 50) + '...' : '-');
            await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
            return;
        }

        // With args: Process report
        let reportData = { aktivitas: '', pembelajaran: '', kendala: '', type: '' };

        // Try parsing tags first (Manual Mode)
        const parsedTags = parseTagBasedReport(contentToProcess);

        if (parsedTags) {
            reportData = parsedTags;
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
                const errorMsg = getMessage('!absen_too_short').replace('{errors}', errors.join('\n'));
                await sock.sendMessage(sender, { text: errorMsg }, { quoted: msgObj });
                return;
            }
        } else {
            // AI mode — history already fetched in parallel above
            const aiResult = await processFreeTextToReport(contentToProcess, history.success ? history.logs : []);

            if (!aiResult.success) {
                await sock.sendMessage(sender, { text: getMessage('!absen_failed_ai', senderNumber).replace('{error}', aiResult.error) }, { quoted: msgObj });
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

        let previewText = formatDraftPreview(reportData);

        // Add info footer if template was used
        if (!args || args.trim() === '') {
            previewText += `\n\n_💡 Menggunakan template tersimpan. Ketik *!absen [teks]* jika ingin laporan berbeda._`;
        }

        if (isGroup) {
            await sock.sendMessage(sender, { text: getMessage('draft_redirect_pc') }, { quoted: msgObj });
            await sock.sendMessage(originalSenderId, { text: previewText });
        } else {
            await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
        }
    }
};
