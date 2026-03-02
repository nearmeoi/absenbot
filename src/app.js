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

const usePairingCode = process.env.PAIRING_NUMBER ? true : false;
const DEBUG = process.env.DEBUG === 'true';
let schedulerInitialized = false; // Prevent multiple scheduler init
let authServerInitialized = false; // Prevent multiple auth server init

const question = async (promptMsg) => {
    process.stdout.write(promptMsg);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question("", (ans) => {
            rl.close();
            resolve(ans);
        });
    });
};

function getMessageContent(msg) {
    if (!msg.message) return "";
    const m = msg.message;

    // Basic text messages
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;

    // Media captions
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;

    // Ephemeral messages
    if (m.ephemeralMessage?.message) {
        const sub = m.ephemeralMessage.message;
        if (sub.conversation) return sub.conversation;
        if (sub.extendedTextMessage?.text) return sub.extendedTextMessage.text;
        if (sub.imageMessage?.caption) return sub.imageMessage.caption;
    }

    // ViewOnce messages
    if (m.viewOnceMessageV2?.message) {
        const sub = m.viewOnceMessageV2.message;
        if (sub.conversation) return sub.conversation;
        if (sub.extendedTextMessage?.text) return sub.extendedTextMessage.text;
        if (sub.imageMessage?.caption) return sub.imageMessage.caption;
    }

    // Buttons & List Response (Legacy)
    if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
    if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
    if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;

    // Interactive Message Response (New V2)
    if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const params = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            if (params.id) return params.id;
        } catch (e) { }
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
        if (files.length < 100) return; // Prune earlier to keep session lean

        console.log(chalk.yellow(`[SESSION] Pruning ${files.length} session files to improve stability...`));
        let count = 0;

        for (const file of files) {
            // ONLY keep creds.json - everything else is recreatable junk
            if (file === 'creds.json') continue;

            try {
                fs.unlinkSync(path.join(AUTH_STATE_DIR, file));
                count++;
            } catch (e) { }
        }
        console.log(chalk.green(`[SESSION] Deleted ${count} junk files. Session is now lean.`));
    } catch (e) {
        console.error(chalk.red('[SESSION] Pruning error:'), e.message);
    }
}

// Store reconnect attempts
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function connectToWhatsApp(isInitial = true) {
    if (isInitial) {
        await pruneSession();
    }
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR)
    const { version } = await fetchLatestBaileysVersion()

    console.log(chalk.cyan(`🤖 Memulai Bot (v${version.join('.')}) + SCHEDULER`))

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        version,
        syncFullHistory: true,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        shouldSyncHistoryMessage: () => true,
        retryRequestDelayMs: 5000,
        defaultQueryTimeoutMs: 0,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
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
            } catch (e) { }

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
            // Wait a bit before requesting code to avoid 428
            await new Promise(resolve => setTimeout(resolve, 3000));
            const code = await sock.requestPairingCode(phoneNumber.trim())
            console.log(`🎁 Pairing Code : ${code}`)
        } catch (err) {
            console.error(chalk.red('[PAIRING] Failed to get pairing code:'), err.message);
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

        if (qr) {
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
                extraInfo = 'Solusi: Hapus folder SesiWA dan restart bot.';

                // --- AUTO RECOVERY ---
                console.log(chalk.bgRed.white(' [AUTO-RECOVERY] Bad Session detected! Cleaning up and restarting... '));
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const sessionPath = path.join(__dirname, '../SesiWA');
                    if (fs.existsSync(sessionPath)) {
                        // Delete all files EXCEPT creds.json backup if we want to be safe, 
                        // but here we clear all to ensure a fresh state.
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                        console.log(chalk.green(' [AUTO-RECOVERY] SesiWA cleared successfully. '));
                    }
                } catch (e) {
                    console.error(' [AUTO-RECOVERY] Failed to clear session:', e.message);
                }
                process.exit(1); // PM2 will restart the bot

            } else if (reason === DisconnectReason.connectionClosed) {
                failureReason = 'Connection Closed (428)';
                extraInfo = 'Penyebab: Bot meminta kode pairing terlalu cepat. Bot akan mencoba menyambung ulang dengan delay otomatis.';
            } else if (reason === DisconnectReason.connectionLost) {
                failureReason = 'Connection Lost from Server';
                extraInfo = 'Penyebab: Koneksi internet server tidak stabil.';
            } else if (reason === DisconnectReason.connectionReplaced) {
                failureReason = 'Connection Replaced';
                extraInfo = 'Penyebab: Sesi ini dibuka di perangkat/browser lain.';
            } else if (reason === DisconnectReason.loggedOut) {
                failureReason = 'Device Logged Out (401)';
                extraInfo = 'Penyebab: Sesi di folder SesiWA sudah kadaluarsa atau tidak valid lagi. Silakan hapus folder SesiWA.';
            } else if (reason === DisconnectReason.restartRequired) {
                failureReason = 'Restart Required';
                extraInfo = 'Bot akan melakukan restart otomatis.';
            } else if (reason === DisconnectReason.timedOut) {
                failureReason = 'Connection Timed Out';
                extraInfo = 'Mencoba menyambung ulang...';
            }

            console.log(chalk.red(`❌ Koneksi Terputus: ${failureReason} (${reason})`));
            if (extraInfo) console.log(chalk.yellow(`ℹ️ Info: ${extraInfo}`));

            if (lastDisconnect?.error) {
                if (DEBUG) console.log(chalk.gray(`[DEBUG] Error Detail: ${lastDisconnect.error.message}`));
            }

            // Update dashboard status
            try {
                const dashboardRoutes = require('./routes/dashboardRoutes');
                dashboardRoutes.setBotConnected(false);
                // FUTURE: We could pass the failureReason to the dashboard here
            } catch (e) { }

            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(chalk.yellow(`🔄 Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in 5 seconds...`));
                setTimeout(() => {
                    connectToWhatsApp(false); // Not initial
                }, 5000);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.log(chalk.bgRed('❌ Max reconnect attempts reached. Please check server manually.'));
                process.exit(1); // Force exit so PM2 can try a fresh start
            } else {
                console.log(chalk.bgRed('⛔ Session Invalid/Logged Out. Please delete session folder and restart.'));
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

            /*
            // SEND TEST MESSAGE TO ADMIN
            const { ADMIN_NUMBERS } = require('./config/constants');
            if (DEBUG) console.log('[DEBUG] ADMIN_NUMBERS at startup:', ADMIN_NUMBERS);
            if (ADMIN_NUMBERS && ADMIN_NUMBERS.length > 0) {
                // Delay 5s to allow session to stabilize
                setTimeout(() => {
                    sock.sendMessage(ADMIN_NUMBERS[0], { text: '🤖 Bot baru saja restart dan terhubung. Jika Anda melihat ini, bot bisa mengirim pesan.' })
                        .catch(err => {
                            if (err.message.includes('Bad MAC') || err.message.includes('closed session')) {
                                console.error(chalk.bgRed.white(' [FATAL] Session out of sync (Bad MAC). Resetting... '));
                                fs.rmSync(AUTH_STATE_DIR, { recursive: true, force: true });
                                process.exit(1);
                            }
                            console.error(chalk.red(`[ERROR] Failed to send test message: ${err.message}`));
                            if (err.stack) console.error(err.stack);
                        });
                }, 5000);
            }
            */

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
        if (DEBUG) {
            console.log(chalk.gray(`[DEBUG] RECEIVED UPSERT: type=${m.type}, count=${m.messages?.length || 0}`));
            if (m.messages) {
                for (const msg of m.messages) {
                    console.log(chalk.gray(`[DEBUG]   - ID: ${msg.key.id}, Remote: ${msg.key.remoteJid}, fromMe: ${msg.key.fromMe}, type: ${Object.keys(msg.message || {})[0]}`));
                }
            }
        }
        if (m.type !== 'notify') return;

        try {
            for (const msg of m.messages) {
                if (!msg.message) continue;

                const msgId = msg.key.id;
                if (processedMessages.has(msgId)) {
                    if (DEBUG) console.log(chalk.gray(`[DEBUG] Ignoring already processed message: ${msgId}`));
                    continue;
                }
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

                const TOLERANCE = 86400; // 24 hours tolerance
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

                const messageType = Object.keys(msg.message || {})[0];
                let mediaType = null;

                if (messageType === 'imageMessage') mediaType = 'Image';
                else if (messageType === 'videoMessage') mediaType = 'Video';
                else if (messageType === 'stickerMessage') mediaType = 'Sticker';
                else if (messageType === 'audioMessage') mediaType = 'Audio';
                else if (messageType === 'documentMessage') mediaType = 'Document';

                // Log Format matching lenwy-bot
                const listColor = ["red", "green", "yellow", "magenta", "cyan", "white", "blue"];
                const randomColor = listColor[Math.floor(Math.random() * listColor.length)];
                const logTag = mediaType ? `[${mediaType}] ` : "";

                let logContext = senderName;
                if (isGroup && contextInfo) {
                    logContext = `${contextInfo.replace(/[[\]]/g, '').trim()} | ${senderName}`;
                }

                console.log(
                    chalk.yellow.bold("Credit : AbsenBot"),
                    chalk.green.bold("[ WhatsApp]"),
                    chalk[randomColor](logContext),
                    chalk[randomColor](" : "),
                    chalk.magenta.bold(`${logTag}`),
                    chalk.white(`${text}`)
                );

                try {
                    msg.bodyTeks = text;
                    await messageHandler(sock, msg);
                } catch (e) {
                    console.error(chalk.bgRed(" HANDLER ERROR "), e);
                    if (e.stack) console.error(e.stack);
                    reportError(e, 'messageHandler', {
                        sender: remoteJid,
                        text: text,
                        isGroup: isGroup
                    });
                }
            }
        } catch (err) {
            if (err.message.includes('Bad MAC') || err.message.includes('closed session')) {
                console.error(chalk.bgRed.white(' [FATAL] Critical Session Error detected! Resetting state... '));
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const sessionDir = path.join(__dirname, '../SesiWA');
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                } catch (e) { }
                process.exit(1);
            }
            console.error(chalk.red('[ERROR] Upsert Handler Error:'), err);
        }
    })
}

module.exports = connectToWhatsApp;
