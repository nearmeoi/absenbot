/**
 * Message Handler - Slim Dispatcher
 * Routes incoming messages to appropriate command modules
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const util = require('util');
const { getCommand, getCommandKeys } = require('../commands');
const { findClosestMatch } = require('../utils/stringUtils');
const { getUserByPhone, updateUserLid, getAllUsers, saveUser, updateUsers } = require('../services/database');
const { prosesLoginDanAbsen, getRiwayat } = require('../services/magang');
const { processFreeTextToReport } = require('../services/aiService');
const { getDraft, setDraft, deleteDraft, formatDraftPreview } = require('../services/previewService');
const { getUserState, clearUserState, setUserState } = require('../services/stateService');
const botState = require('../services/botState');
const { getMessage } = require('../services/messageService');
const { BOT_PREFIX, VALIDATION } = require('../config/constants');
const { parseDraftFromMessage, normalizeToStandard } = require('../utils/messageUtils');
const { reportError } = require('../services/errorReporter');
const { sendInteractiveMessage } = require('../utils/interactiveMessage');
const DEBUG = process.env.DEBUG === 'true';

/**
 * Main message handler
 */
const messageHandler = async (sock, msg) => {
    let msgObj = msg.messages ? msg.messages[0] : msg;
    try {
        if (!msgObj || !msgObj.message) return;
        if (msgObj.key.fromMe) return;

        const botStatus = botState.getBotStatus();
        const sender = msgObj.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");

        if (botStatus === 'offline') return;

        // --- PRE-PROCESS MESSAGE CONTENT ---
        const getMsgText = (m) => {
            if (!m) return "";
            if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
            if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
            if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;

            if (m.conversation) return m.conversation;
            if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
            if (m.imageMessage?.caption) return m.imageMessage.caption;
            if (m.videoMessage?.caption) return m.videoMessage.caption;

            if (m.interactiveMessage?.body?.text) return m.interactiveMessage.body.text;
            if (m.interactiveResponseMessage?.body?.text) return m.interactiveResponseMessage.body.text;

            if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
            if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
            if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;

            const interactiveResponse = m.interactiveResponseMessage;
            if (interactiveResponse?.nativeFlowResponseMessage?.paramsJson) {
                try {
                    const params = JSON.parse(interactiveResponse.nativeFlowResponseMessage.paramsJson);
                    if (params.id) return params.id;
                } catch (e) { }
            }
            return "";
        };

        const textMessage = getMsgText(msgObj.message);
        const contextInfo = msgObj.message.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        const quotedText = quotedMsg ? getMsgText(quotedMsg) : "";
        const evaluationText = textMessage || quotedText;

        const isCommand = textMessage.trim().startsWith(BOT_PREFIX);
        const isConfirmation = (textMessage.toLowerCase().trim() === 'ya') || (textMessage === 'ya');

        const originalSenderId = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;
        const senderNumber = normalizeToStandard(originalSenderId);
        const state = getUserState(senderNumber);

        // --- PRIORITIZE COMMANDS ---
        if (isCommand && state) {
            clearUserState(senderNumber);
        }

        // --- USER IDENTIFICATION ---
        let user = getUserByPhone(senderNumber);
        
        // --- Handle AWAITING_ACTIVITY ---
        if (state?.state === 'AWAITING_ACTIVITY' && textMessage && !isCommand) {
            clearUserState(senderNumber);
            const context = { sender, senderNumber, isGroup, args: textMessage, textMessage, originalSenderId, BOT_PREFIX, user, msgObj };
            const cmdModule = getCommand('absen');
            if (cmdModule) {
                await cmdModule.execute(sock, msgObj, context);
                return;
            }
        }

        // --- COMMAND ROUTING ---
        if (isCommand) {
            const commandParts = textMessage.trim().split(/\s+/);
            const command = commandParts[0].toLowerCase();
            const cmdName = command.substring(BOT_PREFIX.length);
            const args = textMessage.trim().substring(command.length).trim();

            const cmdModule = getCommand(cmdName);
            if (cmdModule) {
                if (!user && cmdName !== 'daftar' && cmdName !== 'menu' && cmdName !== 'help') {
                    console.log(chalk.yellow(`[UNREGISTERED] Command '${cmdName}' from ${senderNumber}`));
                    await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
                    return;
                }
                const context = { sender, senderNumber, isGroup, args, textMessage, originalSenderId, BOT_PREFIX, user, msgObj };
                await cmdModule.execute(sock, msgObj, context);
                return;
            }
        }

        // --- CONFIRMATION FLOW ---
        if (isConfirmation) {
            const draft = getDraft(senderNumber);
            if (draft || state?.state === 'AWAITING_CONFIRMATION') {
                // Use the 'user' variable already defined at line 87
                if (!user) return;

                const draftData = state?.data?.draft || draft;
                if (!draftData) return;

                const loginResult = await prosesLoginDanAbsen({
                    email: user.email, password: user.password,
                    aktivitas: draftData.aktivitas, pembelajaran: draftData.pembelajaran, kendala: draftData.kendala
                });

                if (loginResult.success) {
                    const reply = getMessage('!absen_submit_success', senderNumber);
                    await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
                    console.log(chalk.blue.bold("BOT"), chalk.gray("->"), chalk.cyan(senderNumber), chalk.gray(":"), chalk.white(reply));
                    deleteDraft(senderNumber);
                    clearUserState(senderNumber);
                } else {
                    const reply = getMessage('!absen_submit_failed', senderNumber).replace('{error}', loginResult.pesan);
                    await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
                    console.log(chalk.blue.bold("BOT"), chalk.gray("->"), chalk.cyan(senderNumber), chalk.gray(":"), chalk.white(reply));
                }
                return;
            }
        }

        // --- DRAFT EDIT & AI REVISION FLOW ---
        const isReplyToDraft = quotedMsg && (
            (state?.state === 'AWAITING_CONFIRMATION' && (contextInfo.stanzaId === state.data.draftId || contextInfo.stanzaId === state.data.textMsgId)) ||
            (contextInfo.participant === (sock.user.id.split(':')[0] + '@s.whatsapp.net') && 
             (quotedText.includes("*DRAF LAPORAN ANDA*") || quotedText.includes("*DRAF DIPERBARUI*")))
        );

        const isDraftContent = evaluationText.includes("*DRAF LAPORAN ANDA*") ||
            evaluationText.includes("*DRAF LAPORAN OTOMATIS*") ||
            evaluationText.includes("Draf absen darurat") ||
            evaluationText.includes("*DRAF DIPERBARUI*");

        const isTemplate = evaluationText.includes("Aktivitas pada hari ini adalah") || evaluationText.includes("Isi dan kirim balik pesan ini");

        if ((isDraftContent || isReplyToDraft) && !isCommand && !isTemplate && textMessage) {
            const draft = getDraft(senderNumber);
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const isReplyToBot = contextInfo?.participant === botJid || contextInfo?.participant === sock.user.id;

            if (isDraftContent || isReplyToDraft || ((!isGroup || isReplyToBot) && draft)) {
                const textMessageDraft = parseDraftFromMessage(textMessage);
                const quotedTextDraft = parseDraftFromMessage(quotedText);
                const parsedEdit = textMessageDraft || quotedTextDraft;

                if (parsedEdit) {
                    const MIN_CHARS = VALIDATION.MANUAL_MIN_CHARS;
                    const errors = [];
                    if (parsedEdit.aktivitas.length < MIN_CHARS) errors.push(`Aktivitas: ${parsedEdit.aktivitas.length}/${MIN_CHARS}`);
                    if (parsedEdit.pembelajaran.length < MIN_CHARS) errors.push(`Pembelajaran: ${parsedEdit.pembelajaran.length}/${MIN_CHARS}`);
                    if (parsedEdit.kendala !== 'Tidak ada kendala.' && parsedEdit.kendala.length < MIN_CHARS) errors.push(`Kendala: ${parsedEdit.kendala.length}/${MIN_CHARS}`);

                    if (errors.length > 0) {
                        await sock.sendMessage(sender, { text: getMessage('draft_format_error', senderNumber).replace('{errors}', errors.join('\n')) }, { quoted: msgObj });
                        return;
                    }

                    if (state?.state === 'AWAITING_CONFIRMATION') clearUserState(senderNumber);
                    setDraft(senderNumber, parsedEdit);
                    const previewText = formatDraftPreview(parsedEdit, 'draft_updated');

                    const buttons = [
                        { name: 'quick_reply', params: JSON.stringify({ display_text: 'KIRIM SEKARANG', id: 'ya' }) },
                        { name: 'quick_reply', params: JSON.stringify({ display_text: 'REVISI LAGI', id: '!help' }) }
                    ];

                    if (isGroup) {
                        await sock.sendMessage(sender, { text: "✅ Draft diperbarui. Cek Chat Pribadi." }, { quoted: msgObj });
                        const sentTextMsg = await sock.sendMessage(originalSenderId, { text: previewText });
                        const sentBtnMsg = await sendInteractiveMessage(sock, originalSenderId, { body: "Konfirmasi draft terbaru?", buttons });
                        setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentBtnMsg.key.id, textMsgId: sentTextMsg.key.id, draft: parsedEdit });
                    } else {
                        const sentTextMsg = await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                        const sentBtnMsg = await sendInteractiveMessage(sock, sender, { body: "Konfirmasi draft terbaru?", buttons }, { quoted: msgObj });
                        setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentBtnMsg.key.id, textMsgId: sentTextMsg.key.id, draft: parsedEdit });
                    }
                } else if (!isGroup || isReplyToBot || isReplyToDraft) {
                    const user = getUserByPhone(senderNumber);
                    if (!user) return;
                    const history = await getRiwayat(user.email, user.password, 3);
                    const aiResult = await processFreeTextToReport(textMessage, history.success ? history.logs : []);

                    if (aiResult.success) {
                        const reportData = { ...aiResult, type: 'ai' };
                        setDraft(senderNumber, reportData);
                        const previewText = formatDraftPreview(reportData, 'draft_updated');
                        const buttons = [
                            { name: 'quick_reply', params: JSON.stringify({ display_text: 'KIRIM SEKARANG', id: 'ya' }) },
                            { name: 'quick_reply', params: JSON.stringify({ display_text: 'REVISI LAGI', id: '!help' }) }
                        ];

                        if (isGroup) {
                            await sock.sendMessage(sender, { text: "✅ Draft diperbarui (AI). Cek Chat Pribadi." }, { quoted: msgObj });
                            const sentTextMsg = await sock.sendMessage(originalSenderId, { text: previewText });
                            const sentBtnMsg = await sendInteractiveMessage(sock, originalSenderId, { body: "Konfirmasi draf AI di atas?", buttons });
                            setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentBtnMsg.key.id, textMsgId: sentTextMsg.key.id, draft: reportData });
                        } else {
                            const sentTextMsg = await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                            const sentBtnMsg = await sendInteractiveMessage(sock, sender, { body: "Konfirmasi draf AI di atas?", buttons }, { quoted: msgObj });
                            setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentBtnMsg.key.id, textMsgId: sentTextMsg.key.id, draft: reportData });
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(chalk.red("[HANDLER] Error:"), e);
    }
};

messageHandler.parseDraftFromMessage = parseDraftFromMessage;
module.exports = messageHandler;
