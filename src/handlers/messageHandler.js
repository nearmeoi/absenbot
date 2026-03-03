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

// In-memory cache for marked users
let cachedMarkedUsers = null;
const MARKED_USERS_FILE = path.join(__dirname, '../../data/marked_users.json');

const loadMarkedUsers = () => {
    try {
        if (cachedMarkedUsers !== null) return cachedMarkedUsers;
        if (fs.existsSync(MARKED_USERS_FILE)) {
            const fileContent = fs.readFileSync(MARKED_USERS_FILE, 'utf8');
            const data = JSON.parse(fileContent);
            cachedMarkedUsers = (data && Array.isArray(data.marked_users)) ? data.marked_users : [];
        } else {
            cachedMarkedUsers = [];
        }
    } catch (e) {
        console.error('[HANDLER] Error loading marked users:', e.message);
        cachedMarkedUsers = [];
    }
    return cachedMarkedUsers || [];
};

/**
 * Main message handler
 */
const messageHandler = async (sock, msg) => {
    let msgObj = msg.messages ? msg.messages[0] : msg;
    try {
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
            
            // Unwrapping ViewOnce wrappers
            if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
            if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
            if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;

            // Basic text messages
            if (m.conversation) return m.conversation;
            if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
            if (m.imageMessage?.caption) return m.imageMessage.caption;
            if (m.videoMessage?.caption) return m.videoMessage.caption;

            // Interactive Message (New V2 Native Flow)
            if (m.interactiveMessage?.body?.text) return m.interactiveMessage.body.text;
            if (m.interactiveResponseMessage?.body?.text) return m.interactiveResponseMessage.body.text;

            // Buttons & List Response (Legacy)
            if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
            if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
            if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;

            // Interactive Message Response (New V2 Native Flow Response)
            const interactiveResponse = m.interactiveResponseMessage;
            if (interactiveResponse?.nativeFlowResponseMessage?.paramsJson) {
                try {
                    const params = JSON.parse(interactiveResponse.nativeFlowResponseMessage.paramsJson);
                    if (params.id) return params.id;
                } catch (e) { }
            }

            if (m.templateButtonReplyMessage?.selectedDisplayText) return m.templateButtonReplyMessage.selectedDisplayText;

            return "";
        };

        const textMessage = getMsgText(msgObj.message);
        const contextInfo = msgObj.message.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        const quotedText = quotedMsg ? getMsgText(quotedMsg) : "";
        
        // Final text to evaluate for draft logic (either the message itself or what it quoted)
        const evaluationText = textMessage || quotedText;

        const isCommand = textMessage.trim().startsWith(BOT_PREFIX);
        const isConfirmation = (textMessage.toLowerCase().trim() === 'ya') || (textMessage === 'ya');

        // Resolve basic sender info
        const originalSenderId = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;
        const senderNumber = normalizeToStandard(originalSenderId);
        const state = getUserState(senderNumber);

        // --- USER IDENTIFICATION (INTELLIGENT RESOLVER) ---
        let user = getUserByPhone(senderNumber);
        
        // Only attempt LID resolution if user is NOT found by phone
        if (!user && !msgObj.key.fromMe && !senderNumber.includes('@lid')) {
            try {
                const waInfo = await sock.onWhatsApp(senderNumber);
                if (waInfo && waInfo[0] && waInfo[0].lid) {
                    const resolvedLid = waInfo[0].lid;
                    const userByLid = getUserByPhone(resolvedLid);
                    if (userByLid) {
                        const allUsers = getAllUsers();
                        const uIdx = allUsers.findIndex(u => u.email === userByLid.email);
                        if (uIdx !== -1) {
                            allUsers[uIdx].identifiers = allUsers[uIdx].identifiers || [];
                            if (!allUsers[uIdx].identifiers.includes(senderNumber)) {
                                allUsers[uIdx].identifiers.push(senderNumber);
                                if (!allUsers[uIdx].phone || allUsers[uIdx].phone.includes('@lid')) {
                                    allUsers[uIdx].phone = senderNumber;
                                }
                                await updateUsers(allUsers);
                                user = allUsers[uIdx];
                            } else {
                                user = allUsers[uIdx];
                            }
                        }
                    }
                }
            } catch (lidErr) { }
        }

        // --- NEW: Handle AWAITING_ACTIVITY state (Directly from !absen) ---
        if (state?.state === 'AWAITING_ACTIVITY' && textMessage && !isCommand) {
            console.log(`[DEBUG:HANDLER] User ${senderNumber} is in AWAITING_ACTIVITY. Processing input...`);
            clearUserState(senderNumber);
            
            const context = { sender, senderNumber, isGroup, args: textMessage, textMessage, originalSenderId, BOT_PREFIX, user, msgObj };
            const cmdModule = getCommand('absen');
            if (cmdModule) {
                try {
                    await cmdModule.execute(sock, msgObj, context);
                } catch (err) {
                    console.error('[HANDLER] Error executing redirected !absen:', err);
                }
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
                if (botState.isCommandUnderMaintenance(cmdName)) {
                    await sock.sendMessage(sender, { text: `⚠️ Perintah *!${cmdName}* sedang dalam pemeliharaan.` }, { quoted: msgObj });
                    return;
                }
                if (!user && cmdName !== 'daftar' && cmdName !== 'menu' && cmdName !== 'help') {
                    await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
                    return;
                }
                const context = { sender, senderNumber, isGroup, args, textMessage, originalSenderId, BOT_PREFIX, user, msgObj };
                try {
                    await cmdModule.execute(sock, msgObj, context);
                } catch (cmdErr) {
                    console.error(chalk.bgRed(` [COMMAND ERROR: ${cmdName}] `), cmdErr);
                }
                return;
            } else {
                const allCmds = getCommandKeys();
                const closest = findClosestMatch(cmdName, allCmds, 2);
                if (closest) {
                    try {
                        await sock.sendMessage(sender, { text: `⚠️ Perintah *!${cmdName}* tidak ditemukan. Maksud Anda *!${closest}*?` }, { quoted: msgObj });
                    } catch (e) { }
                }
            }
        }

        // --- CONFIRMATION FLOW: "ya" ---
        const draft = getDraft(senderNumber);
        if (isConfirmation && (draft || state?.state === 'AWAITING_CONFIRMATION')) {
            const user = getUserByPhone(senderNumber);
            if (!user) return;

            // Use state draft if available (more precise)
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

        // --- DRAFT EDIT & AI REVISION FLOW ---
        const isReplyToDraft = quotedMsg && (
            (state?.state === 'AWAITING_CONFIRMATION' && contextInfo.stanzaId === state.data.draftId) ||
            (contextInfo.participant === (sock.user.id.split(':')[0] + '@s.whatsapp.net') && 
             (quotedText.includes("*DRAF LAPORAN ANDA*") || quotedText.includes("*DRAF DIPERBARUI*")))
        );

        const isDraftContent = evaluationText.includes("*DRAF LAPORAN ANDA*") ||
            evaluationText.includes("*DRAF LAPORAN OTOMATIS*") ||
            evaluationText.includes("Draf absen darurat") ||
            evaluationText.includes("*DRAF DIPERBARUI*");

        const isTemplate = evaluationText.includes("Aktivitas pada hari ini adalah") || evaluationText.includes("Isi dan kirim balik pesan ini");

        if ((draft || isDraftContent || isReplyToDraft) && !isCommand && !isTemplate && textMessage) {
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const isReplyToBot = contextInfo?.participant === botJid || contextInfo?.participant === sock.user.id;

            if (isDraftContent || isReplyToDraft || ((!isGroup || isReplyToBot) && draft)) {
                const textMessageDraft = parseDraftFromMessage(textMessage);
                const quotedTextDraft = parseDraftFromMessage(quotedText);
                const parsedEdit = textMessageDraft || quotedTextDraft;

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

                    if (state?.state === 'AWAITING_CONFIRMATION') clearUserState(senderNumber);
                    setDraft(senderNumber, parsedEdit);
                    const previewText = formatDraftPreview(parsedEdit, 'draft_updated');

                    const buttons = [
                        { name: 'quick_reply', params: JSON.stringify({ display_text: 'KIRIM SEKARANG', id: 'ya' }) },
                        { name: 'quick_reply', params: JSON.stringify({ display_text: 'REVISI LAGI', id: '!help' }) }
                    ];

                    if (isGroup) {
                        await sock.sendMessage(sender, { text: "✅ Draft diperbarui. Cek Chat Pribadi." }, { quoted: msgObj });
                        const sentMsg = await sendInteractiveMessage(sock, originalSenderId, { body: previewText, footer: "Balas 'ya' atau klik tombol.", buttons });
                        setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentMsg.key.id, draft: parsedEdit });
                    } else {
                        const sentMsg = await sendInteractiveMessage(sock, sender, { body: previewText, footer: "Balas 'ya' atau klik tombol.", buttons }, { quoted: msgObj });
                        setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentMsg.key.id, draft: parsedEdit });
                    }
                } else if (!isGroup || isReplyToBot || isReplyToDraft) {
                    const user = getUserByPhone(senderNumber);
                    if (!user) return;
                    const history = await getRiwayat(user.email, user.password, 3);
                    const revisionContext = (draft && draft.type === 'ai') ? 'Revisi dari draft AI sebelumnya: ' : 'Revisi manual/baru: ';
                    const aiResult = await processFreeTextToReport(revisionContext + textMessage, history.success ? history.logs : []);

                    if (aiResult.success) {
                        const reportData = { aktivitas: aiResult.aktivitas, pembelajaran: aiResult.pembelajaran, kendala: aiResult.kendala, type: 'ai' };
                        setDraft(senderNumber, reportData);
                        const previewText = formatDraftPreview(reportData, 'draft_updated');
                        const buttons = [
                            { name: 'quick_reply', params: JSON.stringify({ display_text: 'KIRIM SEKARANG', id: 'ya' }) },
                            { name: 'quick_reply', params: JSON.stringify({ display_text: 'REVISI LAGI', id: '!help' }) }
                        ];

                        if (isGroup) {
                            await sock.sendMessage(sender, { text: "✅ Draft diperbarui. Cek Chat Pribadi." }, { quoted: msgObj });
                            const sentMsg = await sendInteractiveMessage(sock, originalSenderId, { body: previewText, footer: "Balas 'ya' atau klik tombol.", buttons });
                            setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentMsg.key.id, draft: reportData });
                        } else {
                            const sentMsg = await sendInteractiveMessage(sock, sender, { body: previewText, footer: "Balas 'ya' atau klik tombol.", buttons }, { quoted: msgObj });
                            setUserState(senderNumber, 'AWAITING_CONFIRMATION', { draftId: sentMsg.key.id, draft: reportData });
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(chalk.red("[HANDLER] Error:"), e);
        if (!msg.messages?.[0]?.message?.extendedTextMessage?.text?.includes('SYSTEM ERROR REPORT')) {
            reportError(e, 'messageHandler (Internal)', { sender: msg.key?.remoteJid });
        }
    }
};

messageHandler.parseDraftFromMessage = parseDraftFromMessage;
module.exports = messageHandler;
