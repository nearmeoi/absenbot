const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { AUTH_STATE_DIR, ADMIN_NUMBERS } = require("./src/config/constants");
const pino = require("pino");

async function test() {
    console.log("Using session dir:", AUTH_STATE_DIR);
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_STATE_DIR);
    const { version } = await fetchLatestBaileysVersion();
    console.log("Baileys version:", version.join('.'));
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        version,
        logger: pino({ level: 'debug' })
    });

    sock.ev.on("connection.update", async (update) => {
        console.log("Connection Update:", update);
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("QR Code received! You are NOT logged in.");
        }
        
        if (connection === "open") {
            console.log("Connected Successfully!");
            console.log("Sending to:", ADMIN_NUMBERS[0]);
            try {
                await sock.sendMessage(ADMIN_NUMBERS[0], { text: "Manual test from test_send.js" });
                console.log("Sent successfully!");
            } catch (e) {
                console.error("Failed to send:", e.message);
            }
            process.exit(0);
        }
        
        if (connection === "close") {
            console.log("Connection closed. Reason:", lastDisconnect?.error?.message);
            process.exit(1);
        }
    });
}

test();
