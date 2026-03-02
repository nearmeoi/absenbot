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
const { getDraft, setDraft, deleteDraft, formatDraftPreview } = require('../services/previewService');
const botState = require('../services/botState');
const { getMessage } = require('../services/messageService');
const { BOT_PREFIX, VALIDATION } = require('../config/constants');
const { parseDraftFromMessage, normalizeToStandard } = require('../utils/messageUtils');
const { reportError } = require('../services/errorReporter');
const DEBUG = process.env.DEBUG === 'true';

// In-memory cache for marked users
let cachedMarkedUsers = null;
const MARKED_USERS_FILE = path.join(__dirname, '../../data/marked_users.json');

const loadMarkedUsers = () => {
    if (DEBUG) console.log('[DEBUG] Entering loadMarkedUsers');
    try {
        if (cachedMarkedUsers !== null) {
            if (DEBUG) console.log(`[DEBUG] Returning cached users (count: ${cachedMarkedUsers.length})`);
            return cachedMarkedUsers;
        }
        
        if (fs.existsSync(MARKED_USERS_FILE)) {
            if (DEBUG) console.log('[DEBUG] Reading marked_users.json');
            const fileContent = fs.readFileSync(MARKED_USERS_FILE, 'utf8');
            const data = JSON.parse(fileContent);
            cachedMarkedUsers = (data && Array.isArray(data.marked_users)) ? data.marked_users : [];
            if (DEBUG) console.log(`[DEBUG] Loaded users: ${cachedMarkedUsers.length}`);
        } else {
            if (DEBUG) console.log('[DEBUG] marked_users.json not found, using empty array');
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
    if (DEBUG) console.log(`[DEBUG] messageHandler called for ${msgObj.key?.remoteJid}, fromMe: ${msgObj.key?.fromMe}`);
    try {
        if (!msgObj || !msgObj.message) return;

        // Ignore messages from self to prevent loops
        if (msgObj.key.fromMe) {
            if (DEBUG) console.log('[DEBUG] Ignoring message fromMe');
            return;
        }

        const botStatus = botState.getBotStatus();
        const sender = msgObj.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");

        // Bot offline - ignore all
        if (botStatus === 'offline') return;

        // --- PRE-PROCESS MESSAGE CONTENT ---
        const getMsgText = (m) => {
            if (!m) return "";
            
            // Basic text messages
            if (m.conversation) return m.conversation;
            if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
            if (m.imageMessage?.caption) return m.imageMessage.caption;
            if (m.videoMessage?.caption) return m.videoMessage.caption;

            // Buttons & List Response (Legacy)
            if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
            if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
            if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;

            // Interactive Message Response (New V2)
            if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
                try {
                    const params = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                    if (params.id) return params.id;
                } catch (e) {
                    console.error('[HANDLER] Error parsing interactive params:', e.message);
                }
            }

            return "";
        };
        const textMessage = getMsgText(msgObj.message);
        const isCommand = textMessage.trim().startsWith(BOT_PREFIX);
        const isConfirmation = textMessage.toLowerCase().trim() === 'ya';

        // Resolve sender number
        let senderNumber = isGroup
            ? msgObj.key.participant || msgObj.participant
            : sender;

        senderNumber = normalizeToStandard(senderNumber);

        // --- COMMAND ROUTING & MARKED USERS ---
        if (isCommand) {
            const commandParts = textMessage.trim().split(/\s+/);
            const command = commandParts[0].toLowerCase();
            const cmdName = command.substring(BOT_PREFIX.length);
            const args = textMessage.trim().substring(command.length).trim();

            // --- SPECIAL TREATMENT FOR MARKED USERS (Only on Commands) ---
            /*
            try {
                const markedUsers = loadMarkedUsers() || [];
                if (Array.isArray(markedUsers) && markedUsers.length > 0) {
                    const originalSender = msgObj.key.participant || msgObj.participant || sender;
                    const isMarked = markedUsers.find(u =>
                        u && (u.lid === originalSender ||
                        u.phone === originalSender ||
                        (u.phone && normalizeToStandard(u.phone) === senderNumber))
                    );

                    if (isMarked && !msgObj.key.fromMe) {
                        const stickerPath = isMarked.sticker_path ? path.join(__dirname, '../../', isMarked.sticker_path) : null;
                        if (stickerPath && fs.existsSync(stickerPath)) {
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
            */

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
            } else {
                // --- TYPO HANDLER ---
                const allCmds = getCommandKeys();
                const closest = findClosestMatch(cmdName, allCmds, 2); // Threshold 2
                if (closest) {
                    try {
                        await sock.sendMessage(sender, { react: { text: "❓", key: msgObj.key } });
                        await sock.sendMessage(sender, {
                            text: `⚠️ Perintah *!${cmdName}* tidak ditemukan. Mungkin maksud Anda *!${closest}*?`
                        }, { quoted: msgObj });
                    } catch (e) { }
                }
            }
        }

        // --- CONFIRMATION FLOW: "ya" ---
        const draft = getDraft(senderNumber);
        if (isConfirmation && draft) {
            if (draft.type === 'simulation') {
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
                aktivitas: draft.aktivitas,
                pembelajaran: draft.pembelajaran,
                kendala: draft.kendala
            });

            if (loginResult.success) {
                await sock.sendMessage(sender, { text: getMessage('!absen_submit_success', senderNumber) }, { quoted: msgObj });
                deleteDraft(senderNumber);
            } else {
                await sock.sendMessage(sender, { text: getMessage('!absen_submit_failed', senderNumber).replace('{error}', loginResult.pesan) }, { quoted: msgObj });
            }
            return;
        }

        // --- DRAFT EDIT & AI REVISION FLOW ---
        const isDraftContent = textMessage.includes("*DRAF LAPORAN ANDA*") ||
            textMessage.includes("*DRAF LAPORAN OTOMATIS*") ||
            textMessage.includes("Draf absen darurat") ||
            textMessage.includes("*DRAF DIPERBARUI*");

        const isTemplate = textMessage.includes("Aktivitas pada hari ini adalah") || textMessage.includes("Isi dan kirim balik pesan ini");

        if ((draft || isDraftContent) && !isCommand && !isTemplate) {
            const contextInfo = msgObj.message.extendedTextMessage?.contextInfo;
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const isReplyToBot = contextInfo?.participant === botJid || contextInfo?.participant === sock.user.id;

            if (isDraftContent || ((!isGroup || isReplyToBot) && draft)) {
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
                    const previewText = formatDraftPreview(parsedEdit, 'draft_updated');

                    if (isGroup) {
                        await sock.sendMessage(sender, { text: "✅ Draft berhasil diperbarui. Cek Chat Pribadi Anda." }, { quoted: msgObj });
                        const originalSenderId = msgObj.key.participant || msgObj.participant || sender;
                        await sock.sendMessage(originalSenderId, { text: previewText });
                    } else {
                        await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                    }
                } else if (!isGroup || isReplyToBot) {
                    // AI Revision (Free text reply)
                    const user = getUserByPhone(senderNumber);
                    if (!user) return;

                    await sock.sendMessage(sender, { react: { text: getMessage('reaction_write', senderNumber), key: msgObj.key } });
                    const history = await getRiwayat(user.email, user.password, 3);
                    const revisionContext = (draft && draft.type === 'ai') ? 'Revisi dari draft AI sebelumnya: ' : 'Revisi manual/baru: ';
                    const aiResult = await processFreeTextToReport(revisionContext + textMessage, history.success ? history.logs : []);

                    if (aiResult.success) {
                        const reportData = { aktivitas: aiResult.aktivitas, pembelajaran: aiResult.pembelajaran, kendala: aiResult.kendala, type: 'ai' };
                        setDraft(senderNumber, reportData);
                        const previewText = formatDraftPreview(reportData, 'draft_updated');

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
