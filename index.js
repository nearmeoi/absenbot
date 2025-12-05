const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")

const usePairingCode = true

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve) => rl.question(text, (ans) => { rl.close(); resolve(ans) }))
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./SesiWA')
    const { version } = await fetchLatestBaileysVersion()
    
    console.log(chalk.cyan(`Mulai Bot API (v${version.join('.')})`))

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    })

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
            if(shouldReconnect) connectToWhatsApp()
        } else if (connection === "open") {
            console.log(chalk.green("✅ Bot Siap! Ketik !hai di WA"))
        }
    })

    sock.ev.on("messages.upsert", async (m) => {
        if (!m.messages[0].message) return
        try {
            // Panggil file handler.js
            require("./handler")(sock, m.messages[0])
        } catch (e) {
            console.error(e)
        }
    })
}

connectToWhatsApp()