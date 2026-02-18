/**
 * Message Handler - Slim Dispatcher
 * Routes incoming messages to appropriate command modules
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { getCommand, getCommandKeys } = require('../commands');
const { findClosestMatch } = require('../utils/stringUtils');
const { getUserByPhone, updateUserLid } = require('../services/database');
const { prosesLoginDanAbsen, getRiwayat } = require('../services/magang');
const { processFreeTextToReport } = require('../services/aiService');
const { getDraft, setDraft, deleteDraft } = require('../services/previewService');
const botState = require('../services/botState');
const { getMessage } = require('../services/messageService');
const { BOT_PREFIX, VALIDATION } = require('../config/constants');
const { parseDraftFromMessage, normalizeToStandard } = require('../utils/messageUtils');
const { reportError } = require('../services/errorReporter');

/**
 * Main message handler
 */
const messageHandler = async (sock, msg) => {
    try {
        let msgObj = msg.messages ? msg.messages[0] : msg;
        if (!msgObj || !msgObj.message) return;

        // Ignore messages from self to prevent loops
        if (msgObj.key.fromMe) return;

        const botStatus = botState.getBotStatus();
        const sender = msgObj.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");

        // Bot offline - ignore all
        if (botStatus === 'offline') return;

        // --- PRE-PROCESS MESSAGE CONTENT ---
        const getMsgText = (m) => {
            if (!m) return "";
            return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || "";
        };
        const textMessage = getMsgText(msgObj.message);
        const isCommand = textMessage.trim().startsWith(BOT_PREFIX);
        const isConfirmation = textMessage.toLowerCase().trim() === 'ya';

        // Resolve sender number
        let senderNumber = isGroup
            ? msgObj.key.participant || msgObj.participant
            : sender;

        // --- AUTOMATIC GROUP EXPORT (siapa suruh kesini) ---
        if (isGroup) {
            try {
                const updateGroupExport = async () => {
                    const metadata = await sock.groupMetadata(sender);
                    const groupSubject = metadata.subject.toLowerCase();

                    if (/siapa\s+suruh\s+ke?\s*sini/i.test(groupSubject)) {

                        const dataDir = path.join(__dirname, '../../data');
                        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

                        const exportData = {
                            groupName: metadata.subject,
                            groupId: metadata.id,
                            lastActivity: new Date().toISOString(),
                            totalParticipants: metadata.participants.length,
                            members: metadata.participants.map(p => ({
                                id: p.id,
                                isLid: p.id.includes('@lid'),
                                phoneNumber: p.phoneNumber || null
                            }))
                        };

                        fs.writeFileSync(
                            path.join(dataDir, 'siapa_suruh_kesini_members.json'),
                            JSON.stringify(exportData, null, 2)
                        );
                    }
                };
                updateGroupExport().catch(() => { });
            } catch (e) { }
        }

        // --- PROACTIVE LID MAPPING ---
        if (senderNumber && senderNumber.includes('@lid')) {
            const userByLid = getUserByPhone(senderNumber);
            if (userByLid) {
                senderNumber = userByLid.phone;
            } else if (isGroup) {
                try {
                    const metadata = await sock.groupMetadata(sender);
                    const participant = metadata.participants.find(p => p.id === senderNumber);
                    if (participant && participant.phoneNumber) {
                        const realPhone = participant.phoneNumber.split('@')[0] + '@s.whatsapp.net';
                        console.log(chalk.blue(`[HANDLER] Mapping LID ${senderNumber} to ${realPhone}`));
                        updateUserLid(realPhone, senderNumber);
                        senderNumber = realPhone;
                    }
                } catch (e) { }
            }
        }

        senderNumber = normalizeToStandard(senderNumber);

        // --- COMMAND ROUTING & MARKED USERS ---
        if (isCommand) {
            const commandParts = textMessage.trim().split(/\s+/);
            const command = commandParts[0].toLowerCase();
            const cmdName = command.substring(BOT_PREFIX.length);
            const args = textMessage.trim().substring(command.length).trim();

            // --- SPECIAL TREATMENT FOR MARKED USERS (Only on Commands) ---
            try {

                const markedFile = path.join(__dirname, '../../data/marked_users.json');
                if (fs.existsSync(markedFile)) {
                    const { marked_users } = JSON.parse(fs.readFileSync(markedFile, 'utf8'));
                    const originalSender = msgObj.key.participant || msgObj.participant || sender;

                    const isMarked = marked_users.find(u =>
                        u.lid === originalSender ||
                        u.phone === originalSender ||
                        (u.phone && normalizeToStandard(u.phone) === senderNumber)
                    );

                    if (isMarked && !msgObj.key.fromMe) {
                        const stickerPath = path.join(__dirname, '../../', isMarked.sticker_path);
                        if (fs.existsSync(stickerPath)) {
                            await sock.sendMessage(sender, {
                                sticker: fs.readFileSync(stickerPath)
                            }, { quoted: msgObj });
                        } else {
                            await sock.sendMessage(sender, { react: { text: "⭐", key: msgObj.key } });
                        }
                        return;
                    }
                }
            } catch (e) {
                console.error('[HANDLER] Error in marked users logic:', e.message);
            }

            const cmdModule = getCommand(cmdName);
            if (cmdModule) {

                if (botState.isCommandUnderMaintenance(cmdName)) {
                    await sock.sendMessage(sender, {
                        text: `⚠️ Perintah *!${cmdName}* sedang dalam pemeliharaan (maintenance). Mohon coba lagi nanti.`
                    }, { quoted: msgObj });
                    return;
                }

                try {
                    sock.sendMessage(sender, {
                        react: { text: getMessage('reaction_wait') || '⏳', key: msgObj.key }
                    }).catch(() => { });
                } catch (e) { }

                const originalSenderId = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;
                const context = { sender, senderNumber, isGroup, args, textMessage, originalSenderId, BOT_PREFIX };

                await cmdModule.execute(sock, msgObj, context);

                const manualReactionCmds = ['cek', 'riwayat', 'broadcast'];
                if (!manualReactionCmds.includes(cmdName)) {
                    try {
                        await sock.sendMessage(sender, { react: { text: "", key: msgObj.key } });
                    } catch (e) { }
                }
                return;
            }
        }

        // --- CONFIRMATION FLOW: "ya" ---
        const hasPendingDraft = !!getDraft(senderNumber);
        if (isConfirmation && hasPendingDraft) {
            const cachedDraft = getDraft(senderNumber);
            if (!cachedDraft) return;

            if (cachedDraft.type === 'simulation') {
                await sock.sendMessage(sender, { react: { text: "🛠️", key: msgObj.key } });
                await new Promise(r => setTimeout(r, 1000));
                await sock.sendMessage(sender, {
                    text: `✅ *[SIMULASI BERHASIL]*\n\nDraft ini valid, tapi TIDAK dikirim ke server karena ini mode test.\n\n_Draft dihapus dari memori._`
                }, { quoted: msgObj });
                deleteDraft(senderNumber);
                return;
            }

            const user = getUserByPhone(senderNumber);
            if (!user) return;

            await sock.sendMessage(sender, { react: { text: getMessage('reaction_rocket'), key: msgObj.key } });

            const loginResult = await prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas: cachedDraft.aktivitas,
                pembelajaran: cachedDraft.pembelajaran,
                kendala: cachedDraft.kendala
            });

            if (loginResult.success) {
                await sock.sendMessage(sender, { text: getMessage('!absen_submit_success', senderNumber) }, { quoted: msgObj });
                deleteDraft(senderNumber);
            } else {
                await sock.sendMessage(sender, { text: getMessage('!absen_submit_failed', senderNumber).replace('{error}', loginResult.pesan) }, { quoted: msgObj });
            }
            return;
        }

        // --- DRAFT EDIT FLOW ---
        const isDraftContent = textMessage.includes("*DRAF LAPORAN ANDA*") ||
            textMessage.includes("*DRAF LAPORAN OTOMATIS*") ||
            textMessage.includes("Draf absen darurat") ||
            textMessage.includes("*DRAF DIPERBARUI*");

        const isTemplate = textMessage.includes("Aktivitas pada hari ini adalah") || textMessage.includes("Isi dan kirim balik pesan ini");

        if ((hasPendingDraft || isDraftContent) && !isCommand && !isTemplate) {
            const contextInfo = msgObj.message.extendedTextMessage?.contextInfo;
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const isReplyToBot = contextInfo?.participant === botJid || contextInfo?.participant === sock.user.id;

            if (isDraftContent || ((!isGroup || isReplyToBot) && hasPendingDraft)) {
                const parsedEdit = parseDraftFromMessage(textMessage);

                if (parsedEdit) {
                    const MIN_CHARS = VALIDATION.MANUAL_MIN_CHARS;
                    const errors = [];
                    if (parsedEdit.aktivitas.length < MIN_CHARS) errors.push(`Aktivitas kurang (${parsedEdit.aktivitas.length}/${MIN_CHARS})`);
                    if (parsedEdit.pembelajaran.length < MIN_CHARS) errors.push(`Pembelajaran kurang (${parsedEdit.pembelajaran.length}/${MIN_CHARS})`);
                    if (parsedEdit.kendala !== 'Tidak ada kendala.' && parsedEdit.kendala.length < MIN_CHARS) errors.push(`Kendala kurang (${parsedEdit.kendala.length}/${MIN_CHARS})`);

                    if (errors.length > 0) {
                        await sock.sendMessage(sender, { text: getMessage('draft_format_error', senderNumber).replace('{errors}', errors.join('\n')) }, { quoted: msgObj });
                        return;
                    }

                    setDraft(senderNumber, parsedEdit);
                    const previewText = getMessage('draft_updated', senderNumber)
                        .replace('{aktivitas_len}', parsedEdit.aktivitas.length)
                        .replace('{aktivitas}', parsedEdit.aktivitas)
                        .replace('{pembelajaran_len}', parsedEdit.pembelajaran.length)
                        .replace('{pembelajaran}', parsedEdit.pembelajaran)
                        .replace('{kendala_len}', parsedEdit.kendala.length)
                        .replace('{kendala}', parsedEdit.kendala);

                    if (isGroup) {
                        await sock.sendMessage(sender, { text: "✅ Draft berhasil diperbarui. Cek Chat Pribadi Anda." }, { quoted: msgObj });
                        const originalSenderId = msgObj.key.participant || msgObj.participant || sender;
                        await sock.sendMessage(originalSenderId, { text: previewText });
                    } else {
                        await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                    }
                } else {
                    // AI Revision
                    const user = getUserByPhone(senderNumber);
                    if (!user) return;

                    await sock.sendMessage(sender, { react: { text: getMessage('reaction_write', senderNumber), key: msgObj.key } });
                    const history = await getRiwayat(user.email, user.password, 3);
                    const revisionContext = (hasPendingDraft && getDraft(senderNumber).type === 'ai') ? 'Revisi dari draft AI sebelumnya: ' : 'Revisi manual/baru: ';
                    const aiResult = await processFreeTextToReport(revisionContext + textMessage, history.success ? history.logs : []);

                    if (aiResult.success) {
                        const reportData = { aktivitas: aiResult.aktivitas, pembelajaran: aiResult.pembelajaran, kendala: aiResult.kendala, type: 'ai' };
                        setDraft(senderNumber, reportData);
                        const previewText = getMessage('draft_updated', senderNumber)
                            .replace('{aktivitas_len}', reportData.aktivitas.length)
                            .replace('{aktivitas}', reportData.aktivitas)
                            .replace('{pembelajaran_len}', reportData.pembelajaran.length)
                            .replace('{pembelajaran}', reportData.pembelajaran)
                            .replace('{kendala_len}', reportData.kendala.length)
                            .replace('{kendala}', reportData.kendala);

                        if (isGroup) {
                            await sock.sendMessage(sender, { text: "✅ Draft berhasil diperbarui. Cek Chat Pribadi Anda." }, { quoted: msgObj });
                            const originalSenderId = msgObj.key.participant || msgObj.participant || sender;
                            await sock.sendMessage(originalSenderId, { text: previewText });
                        } else {
                            await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(chalk.red("[HANDLER] Error:"), e);
        // Only report if it's NOT the admin reporting error to avoid loop
        if (!msg.messages?.[0]?.message?.extendedTextMessage?.text?.includes('SYSTEM ERROR REPORT')) {
            reportError(e, 'messageHandler (Internal)', { sender: msg.key?.remoteJid });
        }
    }
};

messageHandler.parseDraftFromMessage = parseDraftFromMessage;
module.exports = messageHandler;
