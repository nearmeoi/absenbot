const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const { AUTH_STATE_DIR } = require('./config/constants');
const { initScheduler, setBotSocket } = require('./services/scheduler');
const { initAuthServer } = require('./services/secureAuth');
const messageHandler = require('./handlers/messageHandler');

const { initErrorReporter, reportError } = require('./services/errorReporter');

const usePairingCode = true;
let schedulerInitialized = false; // Prevent multiple scheduler init
let authServerInitialized = false; // Prevent multiple auth server init

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve) => rl.question(text, (ans) => { rl.close(); resolve(ans) }))
}

function getMessageContent(msg) {
    if (!msg.message) return "";
    const m = msg.message;
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage && m.extendedTextMessage.text) return m.extendedTextMessage.text;
    if (m.imageMessage && m.imageMessage.caption) return m.imageMessage.caption;
    if (m.ephemeralMessage && m.ephemeralMessage.message) {
        const sub = m.ephemeralMessage.message;
        if (sub.conversation) return sub.conversation;
        if (sub.extendedTextMessage) return sub.extendedTextMessage.text;
    }
    return "";
}

// Group Metadata Cache
const groupCache = new Map();

async function getGroupMetadata(sock, jid) {
    if (groupCache.has(jid)) {
        const cached = groupCache.get(jid);
        if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
            return cached.metadata;
        }
    }
    try {
        const metadata = await sock.groupMetadata(jid);
        groupCache.set(jid, { metadata, timestamp: Date.now() });
        return metadata;
    } catch (e) {
        return null;
    }
}

async function pruneSession() {
    try {
        if (!fs.existsSync(AUTH_STATE_DIR)) return;
        
        const files = fs.readdirSync(AUTH_STATE_DIR);
        if (files.length < 1000) return; // Only prune if it's getting very large

        console.log(chalk.yellow(`[SESSION] Pruning ${files.length} session files to improve stability...`));
        let count = 0;
        
        for (const file of files) {
            // ONLY keep creds.json - everything else is recreatable junk
            if (file === 'creds.json') continue;
            
            try {
                fs.unlinkSync(path.join(AUTH_STATE_DIR, file));
                count++;
            } catch (e) {}
        }
        console.log(chalk.green(`[SESSION] Deleted ${count} junk files. Session is now lean.`));
    } catch (e) {
        console.error(chalk.red('[SESSION] Pruning error:'), e.message);
    }
}

async function connectToWhatsApp() {
    await pruneSession();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR)
    const { version } = await fetchLatestBaileysVersion()

    console.log(chalk.cyan(`🤖 Memulai Bot (v${version.join('.')}) + SCHEDULER`))

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: state,
        browser: ['AbsenBot', 'Chrome', '1.0.0'],
        version,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        shouldSyncHistoryMessage: () => false, // Don't sync history
        retryRequestDelayMs: 5000,
        defaultQueryTimeoutMs: 0, // No timeout
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
    })

    // --- ANTI-LOOP WRAPPER ---
    const originalSendMessage = sock.sendMessage.bind(sock);
    const { recordSentMessage } = require('./services/botState');
    
    sock.sendMessage = async (...args) => {
        const isLoop = recordSentMessage();
        if (isLoop) {
            console.error(chalk.bgRed.white(" [ANTI-LOOP] CRITICAL: Too many outgoing messages! Shutting down to prevent spam. "));
            
            // Try to notify admin before crashing if possible (one last shot)
            try {
                const { ADMIN_NUMBERS } = require('./config/constants');
                if (ADMIN_NUMBERS && ADMIN_NUMBERS.length > 0) {
                    await originalSendMessage(ADMIN_NUMBERS[0], { 
                        text: "⚠️ *CRITICAL ALERT*\n\nBot mendeteksi aktivitas mencurigakan (SPAM LOOP). Proses dihentikan otomatis untuk keamanan." 
                    });
                }
            } catch (e) {}

            process.exit(1); // Force exit, PM2 will handle restart
        }
        return originalSendMessage(...args);
    };

    // Pairing code logic
    if (usePairingCode && !sock.authState.creds.registered) {
        const phoneNumber = await question(chalk.green('Nomor WA (628xxx): '))
        const code = await sock.requestPairingCode(phoneNumber.trim())
        console.log(chalk.green(`Kode Pairing: `) + chalk.yellow.bold(code))
    }

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update
        if (connection === "close") {
            const reason = lastDisconnect.error?.output?.statusCode;
            let failureReason = 'Unknown Error';

            if (reason === DisconnectReason.badSession) failureReason = 'Bad Session File - Delete Session & Re-scan';
            else if (reason === DisconnectReason.connectionClosed) failureReason = 'Connection Closed';
            else if (reason === DisconnectReason.connectionLost) failureReason = 'Connection Lost from Server';
            else if (reason === DisconnectReason.connectionReplaced) failureReason = 'Connection Replaced - Another Session Opened';
            else if (reason === DisconnectReason.loggedOut) failureReason = 'Device Logged Out - Delete Session & Re-scan';
            else if (reason === DisconnectReason.restartRequired) failureReason = 'Restart Required';
            else if (reason === DisconnectReason.timedOut) failureReason = 'Connection Timed Out';

            console.log(chalk.red(`❌ Connection Closed: ${failureReason}`));

            // Update dashboard status
            try {
                const dashboardRoutes = require('./routes/dashboardRoutes');
                dashboardRoutes.setBotConnected(false);
                // FUTURE: We could pass the failureReason to the dashboard here
            } catch (e) { }

            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log(chalk.yellow('🔄 Reconnecting in 5 seconds...'));
                setTimeout(() => {
                    connectToWhatsApp();
                }, 5000);
            } else {
                console.log(chalk.bgRed('⛔ Session Invalid/Logged Out. Please delete session folder and restart.'));
            }
        } else if (connection === "open") {
            console.log(chalk.green("✅ KONEKSI STABIL. Scheduler Aktif."))

            // INIT ERROR REPORTER
            initErrorReporter(sock);

            // INIT AUTH SERVER (only once)
            if (!authServerInitialized) {
                initAuthServer();
                authServerInitialized = true;
            }

            // Pass socket to dashboard for broadcast/trigger features
            const dashboardRoutes = require('./routes/dashboardRoutes');
            dashboardRoutes.setBotSocket(sock);
            dashboardRoutes.setBotConnected(true);

            // Update scheduler socket
            setBotSocket(sock);

            // INIT SCHEDULER (only once)
            if (!schedulerInitialized) {
                initScheduler(sock);
                schedulerInitialized = true;
            }
        }
    })

    // Store startup time to ignore old messages
    const STARTUP_TIME = Math.floor(Date.now() / 1000);
    const processedMessages = new Set();

    sock.ev.on("messages.upsert", async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message) continue;
            
            const msgId = msg.key.id;
            if (processedMessages.has(msgId)) continue;
            processedMessages.add(msgId);
            
            // Clean up cache if too large
            if (processedMessages.size > 1000) {
                const first = processedMessages.values().next().value;
                processedMessages.delete(first);
            }

            if (msg.key.remoteJid === 'status@broadcast') continue;
            if (msg.key.remoteJid.includes('@newsletter')) continue; // Ignore Channels

            // Mark as read to avoid repeated processing
            try {
                await sock.readMessages([msg.key]);
            } catch (e) { }

            // Ignore old messages (only if older than 30 minutes before startup)
            const msgTime = (typeof msg.messageTimestamp === 'number')
                ? msg.messageTimestamp
                : msg.messageTimestamp.low || Math.floor(Date.now() / 1000);

            const TOLERANCE = 1800; // 30 minutes tolerance
            if (msgTime < (STARTUP_TIME - TOLERANCE)) {
                continue;
            }

            const text = getMessageContent(msg);
            if (!text) continue;

            const isMe = msg.key.fromMe;
            const remoteJid = msg.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');

            // Get Sender Name
            let senderName = msg.pushName || 'Unknown';
            if (isMe) senderName = 'ME';

            // Get Group Name (if applicable)
            let contextInfo = '';
            if (isGroup) {
                const groupMetadata = await getGroupMetadata(sock, remoteJid);
                if (groupMetadata) {
                    contextInfo = chalk.yellow(`[${groupMetadata.subject}] `);
                } else {
                    contextInfo = chalk.yellow(`[Group] `);
                }
            }

            // Format Timestamp
            const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            // Log Format: [TIME] [Group] Sender: Message
            const prefix = chalk.gray(`[${time}]`);
            const sender = isMe ? chalk.blue.bold('ME') : chalk.green.bold(senderName);

            console.log(`${prefix} ${contextInfo}${sender}: ${text}`);

            try {
                msg.bodyTeks = text;
                await messageHandler(sock, msg);
            } catch (e) {
                console.error(chalk.bgRed(" HANDLER ERROR "), e);
                reportError(e, 'messageHandler', { 
                    sender: remoteJid, 
                    text: text,
                    isGroup: isGroup
                });
            }
        }
    })
}

module.exports = connectToWhatsApp;
