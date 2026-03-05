const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const fs = require('fs');
const path = require('path');
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

// Store reconnect attempts
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function connectToWhatsApp(isInitial = true) {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR)
    const { version } = await fetchLatestBaileysVersion()

    console.log(chalk.cyan(`🤖 Memulai Bot (v${version.join('.')}) + SCHEDULER`))

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        version,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        shouldSyncHistoryMessage: () => false,
        retryRequestDelayMs: 5000,
        defaultQueryTimeoutMs: 0, 
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 60000, // Increase keep-alive interval
        getMessage: async (key) => {
            return { conversation: "" }; 
        }
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
        let phoneNumber = process.env.PAIRING_NUMBER;
        if (!phoneNumber) {
            phoneNumber = await question(chalk.green('Nomor WA (628xxx): '))
        } else {
            console.log(chalk.cyan(`[PAIRING] Using phone number from ENV: ${phoneNumber}`));
        }
        
        try {
            // Wait a bit before requesting code to avoid 428 - REDUCED TO 5s
            console.log(chalk.yellow('[PAIRING] Waiting 5s for server stability before requesting code...'));
            await new Promise(resolve => setTimeout(resolve, 5000));
            const code = await sock.requestPairingCode(phoneNumber.trim())
            console.log('\n' + chalk.bgGreen.black(' 🔑 PAIRING CODE ') + ' ' + chalk.yellow.bold(code) + '\n');
        } catch (err) {
            console.error(chalk.red('[PAIRING] Failed to request pairing code:'), err.message);
        }
    }

    sock.ev.on("creds.update", saveCreds)

    // DEBUG ALL EVENTS
    sock.ev.process(async (events) => {
        if (events['connection.update']) {
            // Handled separately below, but we can log it here too
        }
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !usePairingCode) {
            console.log(chalk.yellow('[QR] New QR Code generated.'));
            const { setLastQR } = require('./services/botState');
            setLastQR(qr);
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            let failureReason = 'Unknown Error';
            let extraInfo = '';

            if (reason === DisconnectReason.badSession) {
                failureReason = 'Bad Session File';
                extraInfo = 'Solusi: Hapus folder SesiWA secara manual dan restart bot jika pairing gagal.';
            } else if (reason === DisconnectReason.connectionClosed) {
                failureReason = 'Connection Closed (428)';
                extraInfo = 'Penyebab: Koneksi ditutup server. Mencoba menyambung ulang...';
            } else if (reason === DisconnectReason.connectionLost) {
                failureReason = 'Connection Lost from Server';
                extraInfo = 'Penyebab: Koneksi internet server tidak stabil.';
            } else if (reason === DisconnectReason.connectionReplaced) {
                failureReason = 'Connection Replaced';
                extraInfo = 'Penyebab: Sesi ini dibuka di perangkat/browser lain.';
            } else if (reason === DisconnectReason.loggedOut) {
                failureReason = 'Device Logged Out (401)';
                extraInfo = 'Silakan hapus folder SesiWA dan scan ulang.';
            } else if (reason === DisconnectReason.restartRequired) {
                failureReason = 'Restart Required';
                extraInfo = 'Bot akan melakukan restart otomatis.';
            } else if (reason === DisconnectReason.timedOut) {
                failureReason = 'Connection Timed Out';
                extraInfo = 'Mencoba menyambung ulang...';
            }

            console.log(chalk.red(`❌ Koneksi Terputus: ${failureReason} (${reason})`));
            
            // Auto-reset reconnect attempts for temporary server errors
            if (reason === 428 || reason === 408) {
                console.log(chalk.yellow(' [SYSTEM] Recoverable error detected. Resetting attempts... '));
                reconnectAttempts = 0;
            }

            if (extraInfo) console.log(chalk.yellow(`ℹ️ Info: ${extraInfo}`));
            
            if (lastDisconnect?.error) {
                console.log(chalk.gray(`[DEBUG] Error Detail: ${lastDisconnect.error.message}`));
            }

            // Update dashboard status
            try {
                const dashboardRoutes = require('./routes/dashboardRoutes');
                dashboardRoutes.setBotConnected(false);
            } catch (e) { }

            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            if (shouldReconnect && reconnectAttempts < 20) { // Increased to 20
                reconnectAttempts++;
                console.log(chalk.yellow(`🔄 Reconnecting (${reconnectAttempts}/20) in 5 seconds...`));
                setTimeout(() => {
                    connectToWhatsApp(false); 
                }, 5000);
            } else if (reconnectAttempts >= 20) {
                console.log(chalk.bgRed('❌ Max reconnect attempts reached. Please check server manually.'));
            } else {
                console.log(chalk.bgRed('⛔ Session Invalid/Logged Out. Please delete SesiWA and restart.'));
            }
        } else if (connection === "connecting") {
            console.log(chalk.cyan("🔄 Sedang menyambung ke WhatsApp..."));
        } else if (connection === "open") {
            reconnectAttempts = 0; // Reset on success
            console.log(chalk.green("✅ KONEKSI STABIL. Scheduler Aktif."))
            console.log(chalk.gray(`[SYSTEM] Sesi valid terdeteksi. Bot siap digunakan.`));

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

            // SEND TEST MESSAGE TO ADMIN
            const { ADMIN_NUMBERS } = require('./config/constants');
            if (ADMIN_NUMBERS && ADMIN_NUMBERS.length > 0) {
                // Delay 5s to allow session to stabilize
                setTimeout(() => {
                    sock.sendMessage(ADMIN_NUMBERS[0], { text: '🤖 Bot baru saja restart dan terhubung. Jika Anda melihat ini, bot bisa mengirim pesan.' })
                        .catch(err => {
                            console.error(chalk.red(`[ERROR] Failed to send test message: ${err.message}`));
                        });
                }, 5000);
            }

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

        try {
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

                const text = getMessageContent(msg);

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
        } catch (err) {
            console.error(chalk.red('[ERROR] Upsert Handler Error:'), err);
        }
    })
}

module.exports = connectToWhatsApp;
