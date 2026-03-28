/**
 * Command: !absen
 * Main attendance submission command
 */
import chalk from 'chalk';
import { getUserByPhone, getUserPassword } from '../services/database.js';
import { prosesLoginDanAbsen, cekStatusHarian, getRiwayat } from '../services/magang.js';
import { generateAttendanceReport, processFreeTextToReport } from '../services/aiService.js';
import { setDraft, getDraft, deleteDraft, formatDraftPreview } from '../services/previewService.js';
import { isHoliday } from '../config/holidays.js';
import { getMessage } from '../services/messageService.js';
import { parseTagBasedReport } from '../utils/messageUtils.js';
import { setUserState, clearUserState } from '../services/stateService.js';
import { sendInteractiveMessage } from '../utils/interactiveMessage.js';

export default {
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
                const prompt = "*INPUT AKTIVITAS*\n\nSilakan langsung balas pesan ini dengan rincian aktivitas Anda hari ini (Tanpa perlu ketik !absen).\n\n_Bot akan menunggu selama 10 menit._";
                
                if (isGroup) {
                    await sock.sendMessage(sender, { text: "✅ Instruksi pengisian laporan telah dikirim ke Chat Pribadi Anda." }, { quoted: msgObj });
                    await sock.sendMessage(originalSenderId, { text: prompt });
                } else {
                    await sock.sendMessage(sender, { text: prompt }, { quoted: msgObj });
                }
                
                setUserState(senderNumber, 'AWAITING_ACTIVITY', { originalMsg: msgObj.key });
                return;
            }
        }

        // 3. Pre-check + History fetch
        const [statusCheck, history] = await Promise.all([
            cekStatusHarian(user.email, getUserPassword(user)).catch(() => ({ success: false })),
            getRiwayat(user.email, getUserPassword(user), 3).catch(() => ({ success: false, logs: [] }))
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

        console.log(chalk.cyan(`[CMD:ABSEN] Preview Text Length: ${previewText.length}`));
        if (previewText.length < 10) {
            console.error(chalk.red(`[CMD:ABSEN] CRITICAL: Preview text is too short!`), reportData);
        }

        const MONEV_URL = 'https://monev.maganghub.kemnaker.go.id/dashboard';

        const buttons = [
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'KIRIM SEKARANG', id: 'ya' }) },
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'REVISI LAGI', id: '!absen' }) },
            { name: 'cta_url', params: JSON.stringify({ display_text: 'BUKA MONEV WEB', url: MONEV_URL, merchant_url: MONEV_URL }) }
        ];

        try {
            const targetJid = isGroup ? originalSenderId : sender;
            
            if (isGroup) {
                await sock.sendMessage(sender, { text: "✅ Draf laporan telah dikirim ke Chat Pribadi Anda." }, { quoted: msgObj });
            }

            // Combine Preview Text + Buttons in ONE message
            const sentMsg = await sendInteractiveMessage(sock, targetJid, {
                body: previewText,
                footer: "Balas 'ya' untuk kirim atau klik tombol",
                buttons: buttons
            }, isGroup ? {} : { quoted: msgObj });

            // Store ID for detection
            setUserState(senderNumber, 'AWAITING_CONFIRMATION', { 
                draftId: sentMsg.key.id,
                draft: reportData 
            });

        } catch (sendErr) {
            console.error(`[CMD:ABSEN] Error:`, sendErr);
            const targetJid = isGroup ? originalSenderId : sender;
            await sock.sendMessage(targetJid, { text: previewText });
        }
    }
};
