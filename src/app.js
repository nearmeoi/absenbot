const { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    generateWAMessageFromContent,
    proto,
    prepareWAMessageMedia
} = require("wileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const { Boom } = require("@hapi/boom")
const fs = require('fs');
const path = require('path');
const { AUTH_STATE_DIR } = require('./config/constants');
const { initScheduler, setBotSocket } = require('./services/scheduler');
const { initAuthServer } = require('./services/secureAuth');
const messageHandler = require('./handlers/messageHandler');

const { initErrorReporter, reportError } = require('./services/errorReporter');

const usePairingCode = true;
const DEBUG = true; // Paksa debug aktif
let schedulerInitialized = false; 
let authServerInitialized = false; 

const question = (query) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
};

function getMessageContent(msg) {
    if (!msg.message) return "";
    const m = msg.message;

    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;

    if (m.ephemeralMessage?.message) {
        const sub = m.ephemeralMessage.message;
        if (sub.conversation) return sub.conversation;
        if (sub.extendedTextMessage?.text) return sub.extendedTextMessage.text;
        if (sub.imageMessage?.caption) return sub.imageMessage.caption;
    }

    if (m.viewOnceMessageV2?.message) {
        const sub = m.viewOnceMessageV2.message;
        if (sub.conversation) return sub.conversation;
        if (sub.extendedTextMessage?.text) return sub.extendedTextMessage.text;
        if (sub.imageMessage?.caption) return sub.imageMessage.caption;
    }

    if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
    if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
    if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;

    if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const params = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            if (params.id) return params.id;
        } catch (e) { }
    }

    return "";
}

const groupCache = new Map();
async function getGroupMetadata(sock, jid) {
    if (groupCache.has(jid)) {
        const cached = groupCache.get(jid);
        if (Date.now() - cached.timestamp < 3600000) return cached.metadata;
    }
    try {
        const metadata = await sock.groupMetadata(jid);
        groupCache.set(jid, { metadata, timestamp: Date.now() });
        return metadata;
    } catch (e) { return null; }
}

async function pruneSession() {
    try {
        if (!fs.existsSync(AUTH_STATE_DIR)) return;
        const files = fs.readdirSync(AUTH_STATE_DIR);
        if (files.length < 100) return;
        let count = 0;
        for (const file of files) {
            if (file === 'creds.json') continue;
            try { fs.unlinkSync(path.join(AUTH_STATE_DIR, file)); count++; } catch (e) { }
        }
        console.log(chalk.green(`[SESSION] Deleted ${count} junk files.`));
    } catch (e) { }
}

async function connectToWhatsApp(isInitial = true) {
    if (isInitial) await pruneSession();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR)
    const { version } = await fetchLatestBaileysVersion()

    console.log(chalk.cyan(`🤖 Memulai Bot (v${version.join('.')}) [WILEYS-DEBUG] + SCHEDULER`))

    let phoneNumberForPairing = process.env.PAIRING_NUMBER ? process.env.PAIRING_NUMBER.replace(/[^0-9]/g, '') : null;
    if (usePairingCode && !state.creds.registered && !phoneNumberForPairing) {
        phoneNumberForPairing = await question(chalk.green('Nomor WA: '));
    }

    const NodeCache = require("node-cache");
    const msgRetryCounterCache = new NodeCache();

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Safari", "18.1"],
        version,
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
        getMessage: async (key) => { return { conversation: "" }; },
        patchMessageBeforeSending: (message) => { return message; }
    });

    // --- SMART SEND MESSAGE OVERRIDE ---
    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options = {}) => {
        if (content.interactiveButtons && Array.isArray(content.interactiveButtons)) {
            let { text, footer, interactiveButtons } = content;
            
            // 1. Paksa Hapus URL Footer
            if (footer) footer = footer.replace(/app\.monev-absenbot\.my\.id/g, '').trim();
            if (text) text = text.replace(/app\.monev-absenbot\.my\.id/g, '').trim();

            let wButtons = [];
            let fallbackText = (text || "") + "\n";

            interactiveButtons.forEach((btn, i) => {
                try {
                    let btnLabel = "";
                    let btnId = "";

                    let p = {};
                    if (typeof btn.params === 'string') { try { p = JSON.parse(btn.params); } catch (e) {} }
                    else if (typeof btn.buttonParamsJson === 'string') { try { p = JSON.parse(btn.buttonParamsJson); } catch (e) {} }
                    else { p = btn.params || btn.buttonParamsJson || {}; }

                    btnLabel = p.display_text || p.title || btn.displayText || btn.text || "";
                    btnId = p.id || btn.id || btn.buttonId || "";

                    if (!btnLabel) btnLabel = `Opsi ${i+1}`;
                    if (!btnId) btnId = `cmd-${i+1}`;
                    
                    wButtons.push({
                        buttonId: btnId,
                        buttonText: { displayText: btnLabel },
                        type: 1
                    });

                    fallbackText += `\n*• ${btnLabel}* (Ketik: ${btnId})`;
                } catch (e) {
                    fallbackText += `\n*• Opsi ${i+1}*`;
                }
            });

            if (footer && footer.length > 0) fallbackText += `\n\n_${footer}_`;

            // If it has media (image/video/doc)
            if (content.image || content.video || content.document) {
                const mediaType = content.image ? 'image' : (content.video ? 'video' : 'document');
                return await originalSendMessage(jid, {
                    [mediaType]: content[mediaType],
                    caption: fallbackText,
                    buttons: wButtons,
                    headerType: mediaType === 'image' ? 4 : (mediaType === 'video' ? 5 : 3),
                    viewOnce: true,
                    contextInfo: { mentionedJid: options.mentions || [], ...content.contextInfo }
                }, options);
            }

            // Text only fallback
            return await originalSendMessage(jid, {
                text: fallbackText,
                footer: footer || "",
                buttons: wButtons,
                headerType: 1,
                viewOnce: true,
                contextInfo: { mentionedJid: options.mentions || [], ...content.contextInfo }
            }, options);
        }
        return await originalSendMessage(jid, content, options);
    };

    if (usePairingCode && !sock.authState.creds.registered && phoneNumberForPairing) {
        try {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const code = await sock.requestPairingCode(phoneNumberForPairing.trim())
            console.log(`🎁 Pairing Code : ${code}`)
        } catch (err) { }
    }

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(chalk.red(`❌ Koneksi Terputus (${reason})`));
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(() => connectToWhatsApp(false), 5000);
            } else { process.exit(1); }
        } else if (connection === "open") {
            console.log(chalk.green("✔ Bot Terhubung"));
            initErrorReporter(sock);
            if (!authServerInitialized) { initAuthServer(); authServerInitialized = true; }
            setBotSocket(sock);
            if (!schedulerInitialized) { initScheduler(sock); schedulerInitialized = true; }
        }
    })

    const processedMessages = new Set();
    sock.ev.on("messages.upsert", async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message) continue;

            const msgId = msg.key.id;
            if (processedMessages.has(msgId)) continue;
            processedMessages.add(msgId);
            if (processedMessages.size > 1000) processedMessages.delete(processedMessages.values().next().value);

            // --- DEBUG: LOG SETIAP PESAN MASUK ---
            const remoteJid = msg.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');
            const originalSenderId = isGroup ? (msg.key.participant || msg.participant) : remoteJid;
            
            // JID Decoder
            const decodeJid = (jid) => {
                if (!jid) return jid;
                return jid.split(':')[0] + '@' + jid.split('@')[1];
            };
            const senderId = decodeJid(originalSenderId);
            const text = getMessageContent(msg);
            
            // --- ENHANCED DEBUG LOGGING ---
            const pushName = msg.pushName || "Unknown";
            let groupName = "";
            if (isGroup) {
                const metadata = await getGroupMetadata(sock, remoteJid);
                groupName = metadata ? `[${metadata.subject}] ` : "[Group] ";
            }
            
            // The "WA ->" format from your logs (simulated here for consistency)
            console.log(chalk.green(`WA -> ${groupName}${pushName} (${senderId.split('@')[0]}) : ${text || "[Media/Other]"}`));
            
            if (DEBUG) {
                console.log(chalk.yellow(`[DEBUG-MSG] Type: ${Object.keys(msg.message)[0]} | ID: ${msgId}`));
                if (isGroup && (text.startsWith("!") || text.startsWith("/"))) {
                    // Log full message for commands in groups to see structure
                    console.log(chalk.gray(`[RAW] ${JSON.stringify(msg.message).substring(0, 500)}`));
                }
            }

            if (remoteJid === 'status@broadcast' || remoteJid.includes('@newsletter')) continue;

            try {
                msg.sender = senderId;
                msg.bodyTeks = text;
                await messageHandler(sock, msg);
            } catch (e) {
                console.error(chalk.bgRed(" HANDLER ERROR "), e);
            }
        }
    })
}

module.exports = connectToWhatsApp;
