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
const { setUserState, clearUserState } = require('../services/stateService');
const { sendInteractiveMessage } = require('../utils/interactiveMessage');

module.exports = {
    name: 'absen',
    description: 'Submit laporan harian',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args, isGroup, originalSenderId } = context;
        let contentToProcess = args ? args.trim() : '';

        // 1. Check if user is registered
        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
            return;
        }

        // 2. Logic: If empty args, check for template
        if (!contentToProcess) {
            if (user.template) {
                contentToProcess = user.template;
                console.log(`[DEBUG:ABSEN] No args, using template for ${senderNumber}`);
            } else {
                // Enter interactive state
                setUserState(senderNumber, 'AWAITING_ACTIVITY', { originalMsg: msgObj.key });
                
                const prompt = "*INPUT AKTIVITAS*\n\nSilakan langsung balas pesan ini dengan rincian aktivitas Anda hari ini (Tanpa perlu ketik !absen).\n\n_Bot akan menunggu selama 10 menit._";
                
                if (isGroup) {
                    await sock.sendMessage(sender, { text: "✅ Instruksi pengisian laporan telah dikirim ke Chat Pribadi Anda." }, { quoted: msgObj });
                    await sock.sendMessage(originalSenderId, { text: prompt });
                } else {
                    await sock.sendMessage(sender, { text: prompt }, { quoted: msgObj });
                }
                return;
            }
        }

        // 3. Pre-check + History fetch IN PARALLEL
        console.log(`[DEBUG:ABSEN] Starting parallel check/history for ${senderNumber}`);
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

        // 4. Process report
        let reportData = { aktivitas: '', pembelajaran: '', kendala: '', type: '' };
        console.log(`[DEBUG:ABSEN] Processing content: "${contentToProcess.substring(0, 30)}..."`);

        // Try parsing tags first (Manual Mode)
        const parsedTags = parseTagBasedReport(contentToProcess);

        if (parsedTags) {
            console.log(`[DEBUG:ABSEN] Manual tag-based report detected`);
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
            // AI mode
            console.log(`[DEBUG:ABSEN] Sending to AI service...`);
            const aiResult = await processFreeTextToReport(contentToProcess, history.success ? history.logs : []);

            if (!aiResult.success) {
                console.error(`[DEBUG:ABSEN] AI processing failed: ${aiResult.error}`);
                await sock.sendMessage(sender, { text: getMessage('!absen_failed_ai', senderNumber).replace('{error}', aiResult.error) }, { quoted: msgObj });
                return;
            }

            reportData = {
                aktivitas: aiResult.aktivitas,
                pembelajaran: aiResult.pembelajaran,
                kendala: aiResult.kendala,
                type: 'ai'
            };
            console.log(`[DEBUG:ABSEN] AI result generated successfully`);
        }

        // 5. Generate Preview & Send
        console.log(`[DEBUG:ABSEN] Setting draft in previewService...`);
        setDraft(senderNumber, reportData);

        let previewText = formatDraftPreview(reportData);
        if (!args || args.trim() === '') {
            previewText += `\n\n_💡 Menggunakan template tersimpan. Ketik *!absen [teks]* jika ingin laporan berbeda._`;
        }

        const buttons = [
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'KIRIM SEKARANG', id: 'ya' }) },
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'REVISI LAPORAN', id: '!help' }) }
        ];

        const draftMessage = { title: "", body: previewText, footer: "Balas 'ya' atau klik tombol di bawah.", buttons };

        try {
            if (isGroup) {
                console.log(`[DEBUG:ABSEN] Sending interactive draft to private ${originalSenderId}`);
                await sock.sendMessage(sender, { text: getMessage('draft_redirect_pc') }, { quoted: msgObj });
                const sentMsg = await sendInteractiveMessage(sock, originalSenderId, draftMessage);
                setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentMsg.key.id, draft: reportData });
            } else {
                console.log(`[DEBUG:ABSEN] Sending interactive draft to private ${sender}`);
                const sentMsg = await sendInteractiveMessage(sock, sender, draftMessage, { quoted: msgObj });
                setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentMsg.key.id, draft: reportData });
            }
            console.log(`[DEBUG:ABSEN] SUCCESS: Draft sent and state saved for ${senderNumber}`);
        } catch (sendErr) {
            console.error(`[DEBUG:ABSEN] Critical Error sending draft:`, sendErr);
            // Fallback to text
            await sock.sendMessage(isGroup ? originalSenderId : sender, { text: previewText });
        }
    }
};
