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

        // 3. Pre-check + History fetch
        const [statusCheck, history] = await Promise.all([
            cekStatusHarian(user.email, user.password).catch(() => ({ success: false })),
            getRiwayat(user.email, user.password, 3).catch(() => ({ success: false, logs: [] }))
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
        const parsedTags = parseTagBasedReport(contentToProcess);

        if (parsedTags) {
            reportData = parsedTags;
            const MIN_CHARS = 100;
            const errors = [];
            if (reportData.aktivitas.length < MIN_CHARS) errors.push(`Aktivitas: ${reportData.aktivitas.length}/${MIN_CHARS}`);
            if (reportData.pembelajaran.length < MIN_CHARS) errors.push(`Pembelajaran: ${reportData.pembelajaran.length}/${MIN_CHARS}`);
            if (reportData.kendala.length < MIN_CHARS && reportData.kendala !== "Tidak ada kendala.") errors.push(`Kendala: ${reportData.kendala.length}/${MIN_CHARS}`);

            if (errors.length > 0) {
                const errorMsg = getMessage('!absen_too_short').replace('{errors}', errors.join('\n'));
                await sock.sendMessage(sender, { text: errorMsg }, { quoted: msgObj });
                return;
            }
        } else {
            // AI mode
            const aiResult = await processFreeTextToReport(contentToProcess, history.success ? history.logs : []);
            if (!aiResult.success) {
                await sock.sendMessage(sender, { text: getMessage('!absen_failed_ai', senderNumber).replace('{error}', aiResult.error) }, { quoted: msgObj });
                return;
            }
            reportData = { ...aiResult, type: 'ai' };
        }

        // 5. Generate Preview & Send
        setDraft(senderNumber, reportData);
        let previewText = formatDraftPreview(reportData);
        if (!args || args.trim() === '') {
            previewText += `\n\n_💡 Menggunakan template tersimpan._`;
        }

        const buttons = [
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'KIRIM SEKARANG', id: 'ya' }) },
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'REVISI LAPORAN', id: '!help' }) }
        ];

        try {
            const targetJid = isGroup ? originalSenderId : sender;
            if (isGroup) await sock.sendMessage(sender, { text: getMessage('draft_redirect_pc') }, { quoted: msgObj });

            // SPLIT FLOW: Send full text as regular message first to avoid truncation
            const sentTextMsg = await sock.sendMessage(targetJid, { text: previewText });
            
            // Then send small interactive buttons message
            const sentBtnMsg = await sendInteractiveMessage(sock, targetJid, {
                title: "",
                body: "Konfirmasi laporan di atas?",
                footer: "Klik tombol atau balas 'ya'",
                buttons: buttons
            });

            // Store both IDs for detection
            setUserState(senderNumber, 'AWAITING_CONFIRMATION', { 
                draftId: sentBtnMsg.key.id,
                textMsgId: sentTextMsg.key.id,
                draft: reportData 
            });

        } catch (sendErr) {
            console.error(`[CMD:ABSEN] Error:`, sendErr);
            await sock.sendMessage(isGroup ? originalSenderId : sender, { text: previewText });
        }
    }
};
