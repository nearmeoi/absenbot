const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const { AUTH_STATE_DIR } = require('./config/constants');
const { initScheduler } = require('./services/scheduler');
const { initAuthServer } = require('./services/secureAuth');
const messageHandler = require('./handlers/messageHandler');

const usePairingCode = true;
let schedulerInitialized = false; // Prevent multiple scheduler init

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

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR)
    const { version } = await fetchLatestBaileysVersion()

    console.log(chalk.cyan(`🤖 Memulai Bot (v${version.join('.')}) + SCHEDULER`))

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        version,
        generateHighQualityLinkPreview: true,
    })

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
                console.log(chalk.yellow('🔄 Attempting to reconnect...'));
                connectToWhatsApp();
            } else {
                console.log(chalk.bgRed('⛔ Session Invalid/Logged Out. Please delete session folder and restart.'));
            }
        } else if (connection === "open") {
            console.log(chalk.green("✅ KONEKSI STABIL. Scheduler Aktif."))

            // INIT AUTH SERVER (only once)
            initAuthServer();

            // Pass socket to dashboard for broadcast/trigger features
            const dashboardRoutes = require('./routes/dashboardRoutes');
            dashboardRoutes.setBotSocket(sock);
            dashboardRoutes.setBotConnected(true);

            // INIT SCHEDULER (only once)
            if (!schedulerInitialized) {
                initScheduler(sock);
                schedulerInitialized = true;
            }
        }
    })

    // Store startup time to ignore old messages
    const STARTUP_TIME = Math.floor(Date.now() / 1000);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0]
        if (!msg.message) return
        if (msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.remoteJid.includes('@newsletter')) return; // Ignore Channels

        // Ignore old messages (timestamp < startup time)
        const msgTime = (typeof msg.messageTimestamp === 'number')
            ? msg.messageTimestamp
            : msg.messageTimestamp.low || Math.floor(Date.now() / 1000);

        if (msgTime < STARTUP_TIME) {
            // console.log(chalk.gray(`[IGNORE] Old message from ${msgTime} < ${STARTUP_TIME}`));
            return;
        }

        const text = getMessageContent(msg);
        if (!text) return;

        const isMe = msg.key.fromMe;
        const remoteJid = msg.key.remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');

        // Get Sender Name
        let senderName = msg.pushName || 'Unknown';
        if (isMe) senderName = 'ME';

        // Get Group Name (if applicable)
        let contextInfo = '';
        if (isGroup) {
            try {
                // Try to get group metadata from cache or fetch
                const groupMetadata = await sock.groupMetadata(remoteJid);
                contextInfo = chalk.yellow(`[${groupMetadata.subject}] `);
            } catch (e) {
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
            console.error(chalk.bgRed(" HANDLER ERROR "), e)
        }
    })
}

module.exports = connectToWhatsApp;
