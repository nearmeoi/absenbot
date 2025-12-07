/* FILE 1: index.js (FIX BACA PESAN [OBJECT OBJECT]) */

const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const chalk = require("chalk");
const readline = require("readline");

const usePairingCode = true;

const question = text => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve =>
        rl.question(text, ans => {
            rl.close();
            resolve(ans);
        })
    );
};

// --- FUNGSI PINTAR BACA PESAN (REVISI TOTAL) ---
function getMessageContent(msg) {
    if (!msg.message) return "";

    const m = msg.message;

    // 1. Cek Teks Biasa (Conversation)
    if (m.conversation) return m.conversation;

    // 2. Cek Extended Text (Reply/Link/Mention)
    if (m.extendedTextMessage && m.extendedTextMessage.text)
        return m.extendedTextMessage.text;

    // 3. Cek Caption Media (Gambar/Video)
    if (m.imageMessage && m.imageMessage.caption) return m.imageMessage.caption;
    if (m.videoMessage && m.videoMessage.caption) return m.videoMessage.caption;

    // 4. Cek Pesan Sementara (Ephemeral) - Bungkusan 1
    if (m.ephemeralMessage && m.ephemeralMessage.message) {
        const sub = m.ephemeralMessage.message;
        if (sub.conversation) return sub.conversation;
        if (sub.extendedTextMessage) return sub.extendedTextMessage.text;
        if (sub.imageMessage) return sub.imageMessage.caption;
    }

    // 5. Cek View Once - Bungkusan 2
    if (m.viewOnceMessage && m.viewOnceMessage.message) {
        const sub = m.viewOnceMessage.message;
        if (sub.imageMessage) return sub.imageMessage.caption;
        if (sub.videoMessage) return sub.videoMessage.caption;
    }

    return ""; // Jika tidak ada teks sama sekali
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("./LenwySesi");
    const { version } = await fetchLatestBaileysVersion();

    console.log(
        chalk.cyan(
            `🤖 Memulai Bot (v${version.join(".")}) - Fix [Object Object]`
        )
    );

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        version,
        generateHighQualityLinkPreview: true
    });

    if (usePairingCode && !sock.authState.creds.registered) {
        const phoneNumber = await question(chalk.green("Nomor WA (628xxx): "));
        const code = await sock.requestPairingCode(phoneNumber.trim());
        console.log(chalk.green(`Kode Pairing: `) + chalk.yellow.bold(code));
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", update => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect.error?.output?.statusCode !==
                DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === "open") {
            console.log(chalk.green("✅ KONEKSI STABIL. Silakan tes !hai"));
        }
    });

    sock.ev.on("messages.upsert", async m => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const sender = msg.key.remoteJid;

        // ABAIKAN STATUS WA
        if (sender === "status@broadcast") return;

        const isMe = msg.key.fromMe;

        // GUNAKAN FUNGSI BARU DI SINI
        const text = getMessageContent(msg);

        console.log(
            chalk.gray(`------------------------------------------------`)
        );
        console.log(
            chalk.blue(
                `📩 Dari: ${isMe ? "SAYA (TEST)" : sender.split("@")[0]}`
            )
        );

        // Tampilkan isi pesan (jika kosong berarti media tanpa caption)
        console.log(
            chalk.yellow(
                `💬 Isi: "${text.substring(0, 50)}${
                    text.length > 50 ? "..." : ""
                }"`
            )
        );

        if (isMe) {
            console.log(chalk.magenta(`⚠️  Self-Test Mode...`));
        }

        try {
            msg.bodyTeks = text; // Oper hasil bacaan ke handler
            require("./handler")(sock, msg);
        } catch (e) {
            console.error(chalk.bgRed(" ERROR HANDLER "), e);
        }
    });
}

connectToWhatsApp();
