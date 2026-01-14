/**
 * Message Handler - Slim Dispatcher
 * Routes incoming messages to appropriate command modules
 */
const chalk = require('chalk');
const { getCommand } = require('../commands');
const { getUserByPhone, updateUserLid } = require('../services/database');
const { prosesLoginDanAbsen, getRiwayat } = require('../services/magang');
const { processFreeTextToReport } = require('../services/aiService');
const { getDraft, setDraft, deleteDraft } = require('../services/previewService');
const { getBotStatus } = require('../services/botState');
const { getMessage } = require('../services/messageService');
const { BOT_PREFIX } = require('../config/constants');
const { parseDraftFromMessage, normalizeToStandard } = require('../utils/messageUtils');





const { reportError } = require('../services/errorReporter');

/**
 * Main message handler
 */
const messageHandler = async (sock, msg) => {
    try {
        let msgObj = msg.messages ? msg.messages[0] : msg;
        if (!msgObj || !msgObj.message) return;

        const botStatus = getBotStatus();
        const sender = msgObj.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");

        // Bot offline - ignore all
        if (botStatus === 'offline') return;

        // Resolve sender number
        let senderNumber = isGroup
            ? msgObj.key.participant || msgObj.participant
            : sender;

        // Handle LID in groups
        if (isGroup && senderNumber && senderNumber.includes('@lid')) {
            const userByLid = getUserByPhone(senderNumber);
            if (userByLid) {
                senderNumber = userByLid.phone;
            } else {
                try {
                    const metadata = await sock.groupMetadata(sender);
                    const userAsli = metadata.participants.find(p => p.id === senderNumber);
                    if (userAsli && userAsli.phoneNumber) {
                        updateUserLid(userAsli.phoneNumber, senderNumber);
                        senderNumber = userAsli.phoneNumber;
                    }
                } catch (e) {
                    console.error(chalk.red('[HANDLER] Error getting group metadata:'), e.message);
                }
            }
        }

        senderNumber = normalizeToStandard(senderNumber);

        // Get message text
        const getMsgText = (m) => {
            if (!m) return "";
            return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || "";
        };
        const textMessage = getMsgText(msgObj.message);

        // Determine message type
        const isCommand = textMessage.trim().startsWith(BOT_PREFIX);
        const isConfirmation = textMessage.toLowerCase().trim() === 'ya';
        const hasPendingDraft = !!getDraft(senderNumber);

        const isDraftContent = textMessage.includes("*DRAF LAPORAN ANDA*") ||
            textMessage.includes("*DRAF LAPORAN OTOMATIS*") ||
            textMessage.includes("*DRAF DIPERBARUI*");

        // Ignore own messages (except commands from scheduler or draft interactions)
        if (msgObj.key.fromMe && !textMessage.startsWith(BOT_PREFIX) && !isDraftContent && !isConfirmation) return;

        // Early exit for irrelevant messages
        if (!isCommand && !isDraftContent && !isConfirmation && !hasPendingDraft) return;

        // Maintenance mode (Global Status)
        if (botStatus === 'maintenance') {
            await sock.sendMessage(sender, { text: getMessage('system_maintenance', senderNumber) }, { quoted: msgObj });
            return;
        }

        // Parse command
        const command = textMessage.trim().split(/\s+/)[0].toLowerCase();
        const args = textMessage.trim().substring(command.length).trim();

        // Original sender ID (for registration)
        const originalSenderId = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;

        // Build context object
        const context = {
            sender,
            senderNumber,
            isGroup,
            args,
            textMessage,
            originalSenderId,
            BOT_PREFIX
        };

        // --- COMMAND ROUTING ---
        if (isCommand) {
            const cmdName = command.substring(BOT_PREFIX.length);
            const cmdModule = getCommand(cmdName);

            if (cmdModule) {
                // Check granular maintenance for this command
                const botState = require('../services/botState');
                if (botState.isCommandUnderMaintenance(cmdName)) {
                    await sock.sendMessage(sender, { 
                        text: `⚠️ Perintah *!${cmdName}* sedang dalam pemeliharaan (maintenance). Mohon coba lagi nanti.` 
                    }, { quoted: msgObj });
                    return;
                }

                // Global loading reaction for all commands (NON-BLOCKING)
                try {
                    sock.sendMessage(sender, { 
                        react: { 
                            text: getMessage('reaction_wait') || '⏳', 
                            key: msgObj.key 
                        } 
                    }).catch(e => console.error('[HANDLER] Async reaction error:', e.message));
                } catch (e) {
                    console.error('[HANDLER] Failed to trigger loading reaction:', e.message);
                }

                await cmdModule.execute(sock, msgObj, context);
                
                // Clear loading reaction (success) UNLESS command manages it manually
                const manualReactionCmds = ['cek', 'riwayat', 'broadcast'];
                if (!manualReactionCmds.includes(cmdName)) {
                    try {
                        await sock.sendMessage(sender, { react: { text: "", key: msgObj.key } });
                    } catch (e) {
                        console.error('[HANDLER] Failed to clear reaction:', e.message);
                    }
                }
                return;
            }
        }

        // --- CONFIRMATION FLOW: "ya" ---
        if (isConfirmation && hasPendingDraft) {
            const cachedDraft = getDraft(senderNumber);
            if (!cachedDraft) return;

            // Simulation mode
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
        const pendingDraft = getDraft(senderNumber);
        const isTemplate = textMessage.includes("Aktivitas pada hari ini adalah") || textMessage.includes("Isi dan kirim balik pesan ini");

        if ((pendingDraft || isDraftContent) && !isCommand && !isTemplate) {
            const lowerText = textMessage.toLowerCase();

            const hasAllKeywords = lowerText.includes('aktivitas') &&
                lowerText.includes('pembelajaran') &&
                lowerText.includes('kendala');

            const hasDraftHeader = lowerText.includes('draf laporan otomatis') ||
                lowerText.includes('draf laporan anda') ||
                lowerText.includes('draf diperbarui');

            const contextInfo = msgObj.message.extendedTextMessage?.contextInfo;
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const isReplyToBot = contextInfo?.participant === botJid || contextInfo?.participant === sock.user.id;

            const shouldProcessRevision = hasDraftHeader || ((!isGroup || isReplyToBot) && pendingDraft);

            if (shouldProcessRevision) {
                const parsedEdit = parseDraftFromMessage(textMessage);

                // Manual edit
                if (parsedEdit) {
                    const MIN_CHARS = 100;
                    const errors = [];

                    if (parsedEdit.aktivitas.length < MIN_CHARS) errors.push(`Aktivitas kurang (${parsedEdit.aktivitas.length}/${MIN_CHARS})`);
                    if (parsedEdit.pembelajaran.length < MIN_CHARS) errors.push(`Pembelajaran kurang (${parsedEdit.pembelajaran.length}/${MIN_CHARS})`);
                    if (parsedEdit.kendala !== 'Tidak ada kendala.' && parsedEdit.kendala.length < MIN_CHARS) {
                        errors.push(`Kendala kurang (${parsedEdit.kendala.length}/${MIN_CHARS})`);
                    }

                    if (errors.length > 0) {
                        await sock.sendMessage(sender, { text: getMessage('draft_format_error', senderNumber).replace('{errors}', errors.join('\n')) }, { quoted: msgObj });
                        return;
                    }

                    // Loop Prevention: If content is identical to current draft, ignore (it's likely the bot's own echo)
                    const existingDraft = getDraft(senderNumber);
                    if (existingDraft &&
                        existingDraft.aktivitas === parsedEdit.aktivitas &&
                        existingDraft.pembelajaran === parsedEdit.pembelajaran &&
                        existingDraft.kendala === parsedEdit.kendala
                    ) {
                        console.log(chalk.gray('[HANDLER] Ignored identical draft update (Loop Prevention)'));
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
                        await sock.sendMessage(originalSenderId, { text: previewText });
                    } else {
                        await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                    }
                    return;
                }
                                    // AI revision
                                    else {
                                        const user = getUserByPhone(senderNumber);
                                        if (!user) {
                                             await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered', senderNumber) }, { quoted: msgObj });
                                             return;
                                        }
                
                                        await sock.sendMessage(sender, { react: { text: getMessage('reaction_write', senderNumber), key: msgObj.key } });
                                        await sock.sendMessage(sender, { text: getMessage('draft_update_loading', senderNumber) }, { quoted: msgObj });
                
                                        const history = await getRiwayat(user.email, user.password, 3);


                    // Fallback if no pending draft (new session from copy-paste)
                    const revisionContext = (pendingDraft && pendingDraft.type === 'ai')
                        ? 'Revisi dari draft AI sebelumnya: '
                        : 'Revisi manual/baru: ';

                    const aiResult = await processFreeTextToReport(revisionContext + textMessage, history.success ? history.logs : []);

                    if (!aiResult.success) {
                        await sock.sendMessage(sender, { text: getMessage('draft_update_failed', senderNumber) }, { quoted: msgObj });
                        return;
                    }

                    const reportData = {
                        aktivitas: aiResult.aktivitas,
                        pembelajaran: aiResult.pembelajaran,
                        kendala: aiResult.kendala,
                        type: 'ai'
                    };

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
                        await sock.sendMessage(originalSenderId, { text: previewText });
                    } else {
                        await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                    }
                    return;
                }
            }
        }

    } catch (e) {
        console.error(chalk.red("[HANDLER] Error:"), e);
        reportError(e, 'messageHandler (Internal)', { sender: msg.key.remoteJid });
    }
};

// Export for compatibility
// messageHandler.parseDraftFromMessage = parseDraftFromMessage; // No longer needed on exports if not used externally from here, or keep it for backward compat
messageHandler.parseDraftFromMessage = parseDraftFromMessage;
module.exports = messageHandler;
