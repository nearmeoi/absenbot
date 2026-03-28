import {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    generateWAMessageFromContent,
    proto,
    prepareWAMessageMedia
} from 'wileys';
import pino from 'pino';
import fs from 'node:fs';
import chalk from 'chalk';
import path from 'node:path';
import NodeCache from 'node-cache';
import { initAuthServer, setBotSocket as setAuthSocket } from './services/secureAuth.js';
import { initScheduler, setBotSocket } from './services/scheduler.js';
import { setBotConnected } from './services/botState.js';
import { initErrorReporter } from './services/errorReporter.js';
import messageHandler from './handlers/messageHandler.js';
import { getMessageContent } from './utils/messageUtils.js';
import { initCommands } from './commands/index.js';

// Group metadata cache (5 min TTL)
const groupMetaCache = new Map();
async function getCachedGroupMeta(sock, jid) {
    const cached = groupMetaCache.get(jid);
    if (cached && Date.now() - cached.ts < 300000) return cached.data;
    const meta = await sock.groupMetadata(jid).catch(() => null);
    if (meta) groupMetaCache.set(jid, { data: meta, ts: Date.now() });
    return meta;
}

const usePairingCode = process.env.USE_PAIRING_CODE === 'true';
const phoneNumberForPairing = process.env.PHONE_NUMBER;
const DEBUG = process.env.DEBUG === 'true';

async function connectToWhatsApp(isFirstStart = true) {
    await initCommands();
    const { state, saveCreds } = await useMultiFileAuthState('SesiWA')
    const { version, isLatest } = await fetchLatestBaileysVersion()

    const msgRetryCounterCache = new NodeCache()

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

    // --- UNIVERSAL MESSAGE OVERRIDE ---
    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options = {}) => {
        if (content.interactiveButtons && Array.isArray(content.interactiveButtons)) {
            let { text, footer, interactiveButtons, caption } = content;
            let displayTeks = (text || caption || "").replace(/app\.monev-absenbot\.my\.id/g, '').trim();
            let cleanFooter = (footer || "").replace(/app\.monev-absenbot\.my\.id/g, '').trim();

            let wButtons = [];
            let listMsg = null;
            let bodyWithFallback = displayTeks;

            interactiveButtons.forEach((btn, i) => {
                try {
                    let p = {};
                    if (typeof btn.params === 'string') { try { p = JSON.parse(btn.params); } catch (e) {} }
                    else if (typeof btn.buttonParamsJson === 'string') { try { p = JSON.parse(btn.buttonParamsJson); } catch (e) {} }
                    else { p = btn.params || btn.buttonParamsJson || {}; }

                    const label = p.display_text || p.title || btn.displayText || btn.text || `Opsi ${i+1}`;
                    const btnId = p.id || btn.id || btn.buttonId || "";

                    if (btn.name === 'single_select') {
                        listMsg = {
                            title: label,
                            buttonText: label,
                            sections: (p.sections || []).map(s => ({
                                title: s.title,
                                rows: (s.rows || []).map(r => ({ title: r.title, rowId: r.id, description: r.description || "" }))
                            }))
                        };
                    } else {
                        let finalId = btnId;
                        if (!finalId) {
                            if (label.startsWith('!')) finalId = label.split(' ')[0];
                            else finalId = label.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20) || `opt_${i+1}`;
                        }
                        
                        wButtons.push({
                            buttonId: finalId,
                            buttonText: { displayText: label },
                            type: 1
                        });
                    }
                } catch (e) { }
            });

            if (cleanFooter) bodyWithFallback += `\n\n_${cleanFooter}_`;
            bodyWithFallback = bodyWithFallback.trim();

            // Set global group ephemeral (24h)
            if (jid.endsWith('@g.us') && !options.ephemeralExpiration) {
                options.ephemeralExpiration = 86400;
            }

            // Construct Final Message Payload
            const messagePayload = {
                [content.image ? 'image' : (content.video ? 'video' : (content.document ? 'document' : 'text'))]: 
                    content.image || content.video || content.document || displayTeks,
                caption: (content.image || content.video || content.document) ? displayTeks : undefined,
                footer: cleanFooter || undefined,
                buttons: wButtons.length > 0 ? wButtons : undefined,
                listMessage: listMsg,
                headerType: content.image ? 4 : (content.video ? 'video' : (content.document ? 3 : 1)),
                viewOnce: true,
                contextInfo: { mentionedJid: options.mentions || [], ...content.contextInfo }
            };

            return await originalSendMessage(jid, messagePayload, options);
        }

        // Apply global ephemeral for groups
        if (jid.endsWith('@g.us') && !options.ephemeralExpiration) {
            options.ephemeralExpiration = 86400;
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
            setBotConnected(false);
            const error = lastDisconnect?.error;
            let reason = error?.output?.statusCode || error?.data?.statusCode || 408;
            console.log(chalk.red(`❌ Koneksi Terputus (${reason})`));
            if (error) {
                console.log(chalk.red(`   Detail: ${error.message || error}`));
                if (error.stack) console.log(chalk.gray(`   Stack: ${error.stack.split('\n')[0]}`));
            }
            
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(() => connectToWhatsApp(false), 5000);
            } else { process.exit(1); }
        } else if (connection === "open") {
            setBotConnected(true);
            console.log(chalk.green("✔ Bot Terhubung"));
            initErrorReporter(sock);
            initAuthServer();
            setBotSocket(sock);
            setAuthSocket(sock);
            initScheduler(sock);
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
                const [id, domain] = jid.split('@');
                return id.split(':')[0] + (domain ? '@' + domain : '');
            };
            const senderId = decodeJid(originalSenderId);
            const text = getMessageContent(msg);
            
            // --- ENHANCED DEBUG LOGGING ---
            const pushName = msg.pushName || "Unknown";
            let groupName = "";
            if (isGroup) {
                try {
                    const groupMetadata = await getCachedGroupMeta(sock, remoteJid);
                    groupName = groupMetadata ? groupMetadata.subject : "Grup";
                } catch (e) {}
            }

            const fromLabel = isGroup ? `[${groupName}] ${pushName} (${senderId})` : `${pushName} (${senderId})`;
            console.log(chalk.gray(`WA -> ${fromLabel} : ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`));

            if (DEBUG) {
                console.log(chalk.gray(`[DEBUG-MSG] Type: ${Object.keys(msg.message)[0]} | ID: ${msgId}`));
                // console.log(chalk.gray(`[RAW] ${JSON.stringify(msg.message)}`));
            }

            // Main Message Handling
            try {
                // Ensure context has all necessary fields
                const context = {
                    sender: remoteJid,
                    senderNumber: senderId,
                    isGroup,
                    originalSenderId,
                    textMessage: text,
                    msgObj: msg
                };

                // Add bodyTeks for compatibility with some legacy handlers
                msg.bodyTeks = text;
                await messageHandler(sock, msg);
            } catch (e) {
                console.error(chalk.bgRed(" HANDLER ERROR "), e);
            }
        }
    })
}

let authServerInitialized = false;
let schedulerInitialized = false;

export default connectToWhatsApp;
