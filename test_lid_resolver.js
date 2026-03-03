/**
 * Test LID Resolver
 */
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { AUTH_STATE_DIR } = require("./src/config/constants");
const pino = require("pino");
const chalk = require("chalk");

async function testResolver() {
    const { state } = await useMultiFileAuthState(AUTH_STATE_DIR);
    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        auth: state,
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection } = update;
        if (connection === "open") {
            console.log(chalk.green("Connected! Resolving LID for Akmal..."));
            
            try {
                const target = "6285657025300";
                const result = await sock.onWhatsApp(target);
                console.log(chalk.cyan("\n=== ON WHATSAPP RESULT ==="));
                console.log(JSON.stringify(result, null, 2));
                console.log("==========================");
                
                if (result && result[0]) {
                    console.log(chalk.green(`JID: ${result[0].jid}`));
                    console.log(chalk.green(`LID: ${result[0].lid}`));
                }
            } catch (e) {
                console.error(chalk.red("Error:"), e.message);
            }
            process.exit(0);
        }
    });
}

testResolver();
