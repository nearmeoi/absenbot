const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const { AUTH_STATE_DIR } = require('./config/constants');
const { initScheduler } = require('./services/scheduler');
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
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) connectToWhatsApp()
        } else if (connection === "open") {
            console.log(chalk.green("✅ KONEKSI STABIL. Scheduler Aktif."))

            // INIT SCHEDULER (only once)
            if (!schedulerInitialized) {
                initScheduler(sock);
                schedulerInitialized = true;
            }
        }
    })

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0]
        if (!msg.message) return

        // ABAIKAN STATUS
        if (msg.key.remoteJid === 'status@broadcast') return;

        const text = getMessageContent(msg);
        if (!text) return;

        const isMe = msg.key.fromMe;
        console.log(chalk.blue(`📩 ${isMe ? 'ME' : 'USER'}: ${text.substring(0, 20)}...`));

        try {
            msg.bodyTeks = text;
            await messageHandler(sock, msg);
        } catch (e) {
            console.error(chalk.bgRed(" HANDLER ERROR "), e)
        }
    })
}

module.exports = connectToWhatsApp;
