const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const fs = require('fs');
const path = require('path');
const { DIR_AUTH, ADMIN_NUMBERS } = require('./config/constants');
const { initScheduler, setBotSocket } = require('./services/scheduler');
const { initAuthServer } = require('./services/secureAuth');
const tanganiPesan = require('./handlers/messageHandler');
const { initPelaporError, laporError } = require('./services/errorReporter');
const { catatPesanKeluar, setBotConnected } = require('./services/botState');

const modePairing = true;
let jadwalSiap = false;
let serverAuthSiap = false;
let appInitialized = false;

const tanya = (teks) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve) => rl.question(teks, (jawaban) => { rl.close(); resolve(jawaban) }))
}

function ekstrakPesan(msg) {
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

// Cache metadata grup
const { ambilInfoGrup } = require('./utils/whatsappUtils');

// Percobaan koneksi ulang
let hitungKoneksiUlang = 0;
const MAKS_KONEKSI_ULANG = 20;

// Lookup map untuk alasan disconnect
const ALASAN_DISCONNECT = {
    [DisconnectReason.badSession]: {
        alasan: 'Sesi Rusak',
        info: 'Solusi: Hapus folder SesiWA secara manual dan restart bot jika pairing gagal.'
    },
    [DisconnectReason.connectionClosed]: {
        alasan: 'Koneksi Ditutup (428)',
        info: 'Penyebab: Koneksi ditutup server. Mencoba menyambung ulang...'
    },
    [DisconnectReason.connectionLost]: {
        alasan: 'Koneksi Hilang',
        info: 'Penyebab: Koneksi internet server tidak stabil.'
    },
    [DisconnectReason.connectionReplaced]: {
        alasan: 'Koneksi Diganti',
        info: 'Penyebab: Sesi ini dibuka di perangkat/browser lain.'
    },
    [DisconnectReason.loggedOut]: {
        alasan: 'Perangkat Logout (401)',
        info: 'Silakan hapus folder SesiWA dan scan ulang.'
    },
    [DisconnectReason.restartRequired]: {
        alasan: 'Restart Diperlukan',
        info: 'Bot akan melakukan restart otomatis.'
    },
    [DisconnectReason.timedOut]: {
        alasan: 'Koneksi Timeout',
        info: 'Mencoba menyambung ulang...'
    }
};

async function sambungKeWhatsApp(sessionId = 'default', awal = true) {
    const { state, saveCreds } = await useMultiFileAuthState(DIR_AUTH(sessionId))
    const { version } = await fetchLatestBaileysVersion()

    console.log(chalk.cyan(`🤖 Memulai Bot [${sessionId}] (v${version.join('.')})`))

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !modePairing,
        auth: state,
        browser: ["Ubuntu", "Chrome", sessionId === 'default' ? "20.0.04" : "21.0.01"],
        version,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        retryRequestDelayMs: 5000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
        getMessage: async (key) => {
            return { conversation: "" };
        }
    })

    // Simpan ke sesi global
    if (!global.sessions) global.sessions = {};
    global.sessions[sessionId] = sock;

    // --- ANTI-LOOP WRAPPER ---
    const kirimAsli = sock.sendMessage.bind(sock);

    sock.sendMessage = async (...args) => {
        const loopDetected = catatPesanKeluar();
        if (loopDetected) {
            console.error(chalk.bgRed.white(` [ANTI-LOOP][${sessionId}] KRITIS: Terlalu banyak pesan keluar! Shutdown. `));

            try {
                if (ADMIN_NUMBERS && ADMIN_NUMBERS.length > 0) {
                    await kirimAsli(ADMIN_NUMBERS[0], {
                        text: `⚠️ *CRITICAL ALERT [${sessionId}]*\n\nBot mendeteksi aktivitas mencurigakan (SPAM LOOP). Proses dihentikan otomatis untuk keamanan.`
                    });
                }
            } catch (e) { }

            process.exit(1);
        }
        // --- DEBUG LOG UNTUK PESAN KELUAR ---
        const jid = args[0];
        const isi = args[1];
        let teksPreview = '';

        if (isi.text) {
            teksPreview = isi.text.substring(0, 100).replace(/\n/g, ' ');
            if (isi.text.length > 100) teksPreview += '...';
        } else if (isi.caption) {
            teksPreview = `[Media] ${isi.caption.substring(0, 50)}`;
        } else if (isi.react) {
            teksPreview = `[Reaction] ${isi.react.text}`;
        } else {
            teksPreview = `[Other: ${Object.keys(isi).join(', ')}]`;
        }

        console.log(chalk.blue(`[OUTGOING][${sessionId}] Ke: ${jid} | Isi: ${teksPreview}`));

        return kirimAsli(...args);
    };

    // Pairing code
    if (modePairing && !sock.authState.creds.registered) {
        let nomorHP = sessionId === 'default' ? process.env.PAIRING_NUMBER : process.env[`PAIRING_NUMBER_${sessionId.toUpperCase()}`];
        
        if (!nomorHP) {
            nomorHP = await tanya(chalk.green(`Nomor WA untuk sesi [${sessionId}] (628xxx): `))
        } else {
            console.log(chalk.cyan(`[PAIRING][${sessionId}] Menggunakan nomor: ${nomorHP}`));
        }

        try {
            console.log(chalk.yellow(`[PAIRING][${sessionId}] Menunggu 5 detik untuk stabilitas server...`));
            await new Promise(resolve => setTimeout(resolve, 5000));
            const kode = await sock.requestPairingCode(nomorHP.trim())
            console.log('\n' + chalk.bgGreen.black(` 🔑 KODE PAIRING [${sessionId}] `) + ' ' + chalk.yellow.bold(kode) + '\n');
        } catch (err) {
            console.error(chalk.red(`[PAIRING][${sessionId}] Gagal meminta kode pairing:`), err.message);
        }
    }

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !modePairing) {
            console.log(chalk.yellow(`[QR][${sessionId}] QR Code baru dihasilkan.`));
            const { setQRTerakhir } = require('./services/botState');
            setQRTerakhir(qr); // Perlu disesuaikan jika ingin QR per sesi di dashboard
        }

        if (connection === "close") {
            const kodeStatus = lastDisconnect?.error?.output?.statusCode;

            // Cari info disconnect dari lookup map
            const infoDisconnect = ALASAN_DISCONNECT[kodeStatus] || {
                alasan: 'Error Tidak Diketahui',
                info: ''
            };

            console.log(chalk.red(`❌ [${sessionId}] Koneksi Terputus: ${infoDisconnect.alasan} (${kodeStatus})`));

            // Reset percobaan untuk error sementara
            if (kodeStatus === 428 || kodeStatus === 408) {
                console.log(chalk.yellow(` [SYSTEM][${sessionId}] Error sementara terdeteksi. Mereset percobaan... `));
                hitungKoneksiUlang = 0;
            }

            if (infoDisconnect.info) console.log(chalk.yellow(`ℹ️ Info: ${infoDisconnect.info}`));

            if (lastDisconnect?.error) {
                console.log(chalk.gray(`[DEBUG][${sessionId}] Detail: ${lastDisconnect.error.message}`));
            }

            // Update status dashboard (perlu perbaikan untuk multi-session)
            setBotConnected(false);

            const harusRekoneksi = kodeStatus !== DisconnectReason.loggedOut;
            if (harusRekoneksi && hitungKoneksiUlang < MAKS_KONEKSI_ULANG) {
                hitungKoneksiUlang++;
                console.log(chalk.yellow(`🔄 [${sessionId}] Menyambung ulang (${hitungKoneksiUlang}/${MAKS_KONEKSI_ULANG}) dalam 5 detik...`));
                setTimeout(() => {
                    sambungKeWhatsApp(sessionId, false);
                }, 5000);
            } else if (hitungKoneksiUlang >= MAKS_KONEKSI_ULANG) {
                console.log(chalk.bgRed(`❌ [${sessionId}] Batas percobaan koneksi ulang tercapai.`));
            } else {
                console.log(chalk.bgRed(`⛔ [${sessionId}] Sesi tidak valid / Logout. Hapus folder SesiWA/${sessionId} dan restart.`));
            }
        } else if (connection === "connecting") {
            console.log(chalk.cyan(`🔄 [${sessionId}] Sedang menyambung ke WhatsApp...`));
        } else if (connection === "open") {
            hitungKoneksiUlang = 0;
            console.log(chalk.green(`✅ [${sessionId}] KONEKSI STABIL.`))

            // Init error reporter (Hanya untuk sesi utama atau buat reporter per sesi)
            if (sessionId === 'default' || !appInitialized) {
                initPelaporError(sock);
            }

            // Init auth server (sekali saja)
            if (!serverAuthSiap) {
                initAuthServer();
                serverAuthSiap = true;
            }

            setBotConnected(true);

            // Pastikan bot tetap offline agar tidak auto-read secara internal oleh WhatsApp
            try {
                await sock.sendPresenceUpdate('unavailable');
            } catch (e) { }

            // Kirim pesan tes ke admin (Hanya saat startup awal proses)
            if (awal && ADMIN_NUMBERS && ADMIN_NUMBERS.length > 0) {
                setTimeout(() => {
                    sock.sendMessage(ADMIN_NUMBERS[0], { text: `🤖 *Bot [${sessionId}] Started*\n\nSistem telah aktif dan terhubung.` })
                        .catch(err => {
                            console.error(chalk.red(`[ERROR][${sessionId}] Gagal mengirim pesan tes: ${err.message}`));
                        });
                }, 5000);
            }

            // EXPOSE SOCKET GLOBALLY for Legacy/Dashboard APIs (Hanya sesi default untuk kompatibilitas)
            if (sessionId === 'default') {
                global.botSock = sock;
                global.restartBot = async () => {
                    console.log(chalk.yellow('[SYSTEM] Restarting default connection...'));
                    try { sock.end(); } catch (e) { }
                    sambungKeWhatsApp('default');
                };
                
                // Update socket scheduler
                setBotSocket(sock);

                // Init scheduler (sekali saja)
                if (!jadwalSiap) {
                    initScheduler(sock);
                    jadwalSiap = true;
                }
            }
            
            appInitialized = true;
        }
    })

    // Simpan waktu startup untuk mengabaikan pesan lama
    const WAKTU_MULAI = Math.floor(Date.now() / 1000);
    const pesanDiproses = new Set();

    sock.ev.on("messages.upsert", async (m) => {
        if (m.type !== 'notify') return;

        try {
            for (const msg of m.messages) {
                if (!msg.message) continue;

                const idPesan = msg.key.id;
                if (pesanDiproses.has(idPesan)) continue;
                pesanDiproses.add(idPesan);

                // Bersihkan cache jika terlalu besar
                if (pesanDiproses.size > 1000) {
                    const pertama = pesanDiproses.values().next().value;
                    pesanDiproses.delete(pertama);
                }

                if (msg.key.remoteJid === 'status@broadcast') continue;
                if (msg.key.remoteJid.includes('@newsletter')) continue;

                const teks = ekstrakPesan(msg);

                // Tandai sudah dibaca (DINONAKTIFKAN UNTUK SEMUA SESI agar notifikasi tetap muncul di HP)
                // try { await sock.readMessages([msg.key]); } catch (e) { }

                // Abaikan pesan lama (lebih dari 30 menit sebelum startup)
                const waktuPesan = (typeof msg.messageTimestamp === 'number')
                    ? msg.messageTimestamp
                    : msg.messageTimestamp.low || Math.floor(Date.now() / 1000);

                const TOLERANSI = 1800; // 30 menit
                if (waktuPesan < (WAKTU_MULAI - TOLERANSI)) continue;

                const dariSaya = msg.key.fromMe;
                const jidTujuan = msg.key.remoteJid;
                const adalahGrup = jidTujuan.endsWith('@g.us');

                // Ambil nama pengirim
                let namaPengirim = msg.pushName || 'Unknown';
                if (dariSaya) namaPengirim = 'BOT';

                // Ambil info grup (jika grup)
                let infoKonteks = '';
                if (adalahGrup) {
                    const metadataGrup = await ambilInfoGrup(sock, jidTujuan);
                    infoKonteks = metadataGrup
                        ? chalk.yellow(`[${metadataGrup.subject}] `)
                        : chalk.yellow(`[Group] `);
                }

                // Format timestamp
                const waktu = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                // Format log: [WAKTU][SESI] [Grup] Pengirim (ID): Pesan
                const prefix = chalk.gray(`[${waktu}][${sessionId}]`);
                const idPengirim = msg.key.participant || msg.key.remoteJid;
                const pengirim = dariSaya ? chalk.blue.bold('ME') : `${chalk.green.bold(namaPengirim)} (${chalk.cyan(idPengirim)})`;

                if (teks) {
                    console.log(`${prefix} ${infoKonteks}${pengirim}: ${teks}`);
                }

                // --- LOGIKA AFK & BIG DATA SESI KEDUA ---
                const afkService = require('./services/afkService');
                const personaService = require('./services/personaService');
                const { generateChatResponse } = require('./services/aiService'); // Pastikan fungsi ini ada/siap
                
                if (sessionId === 'kedua') {
                    const targetLidAica = '13241400987789@lid';
                    const targetLidTest = '268147877761252@lid'; // LID Nomor Utama untuk latihan
                    
                    // Jika saya mengirim pesan (nomor kedua sendiri)
                    if (dariSaya) {
                        const isAfkCmd = teks.toLowerCase().startsWith('!afk');
                        if (isAfkCmd) {
                            const reason = teks.split(' ').slice(1).join(' ') || 'Sibuk';
                            afkService.setAfk(sessionId, reason);
                            await sock.sendMessage(jidTujuan, { text: `✅ *Status AFK Aktif*\nAlasan: ${reason}` });
                            return; 
                        } else {
                            const wasAfk = afkService.setUnafk(sessionId);
                            if (wasAfk) console.log(chalk.green(`[SYSTEM][${sessionId}] Status AFK dimatikan (Auto-Unafk)`));

                            // BIG DATA: Rekam cara saya membalas (Manual)
                            personaService.recordManualReply(jidTujuan, teks);
                        }
                    } else {
                        // Jika orang lain mengirim pesan
                        if (adalahGrup) return; // Khusus PM/Japri untuk Sesi Kedua (AI & AFK)

                        personaService.recordIncoming(jidTujuan, teks);

                        // --- FITUR AI AUTO-REPLY (KHUSUS LATIHAN - DIMATIKAN) ---
                        /* 
                        if (idPengirim === targetLidTest) {
                            // targetLidAica dinonaktifkan dulu agar fokus latihan di sini
                            console.log(chalk.magenta(`[AI-CHAT][${sessionId}] Latihan gaya bahasa: ${namaPengirim}`));
                            
                            try {
                                // Ambil data latihan & histori chat
                                const training = personaService.getTrainingData();
                                const history = personaService.getChatContext(jidTujuan);
                                const glossary = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/persona_glossary.json'), 'utf8'));
                                
                                const systemPrompt = `Kamu adalah alter-ego pengguna di WhatsApp. Balaslah chat dengan sangat natural dan nyambung.

KONTROL GAYA:
- Gunakan huruf kecil semua (lowercase).
- Jawab dengan santai, singkat, dan jangan kaku.
- Gunakan slang (mi, dehh, bjirr, sassah, nihh, kahh????) HANYA jika sangat pas. Maksimal 1-2 slang per pesan. Jangan dipaksakan.
- DILARANG mengarang topik (seperti nama orang atau tugas) jika tidak sedang dibahas di histori.

HISTORI CHAT (FOKUS DI SINI):
${history.map(h => `${h.role === 'user' ? 'User' : 'Kamu'}: ${h.content}`).join('\n')}

PESAN TERAKHIR USER: "${teks}"
JAWAB SECARA RELEVAN:`;

                                // Generate Response menggunakan AI
                                const aiReply = await generateChatResponse(teks, systemPrompt);
                                
                                if (aiReply) {
                                    // BERSIHKAN: Hapus proses berpikir AI (<think>...</think>)
                                    const cleanedReply = aiReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                                    
                                    const bubbles = cleanedReply.split('|').map(b => b.trim()).filter(b => b && !b.toLowerCase().includes('user:') && !b.toLowerCase().includes('kamu:'));
                                    
                                    for (const bubble of bubbles) {
                                        await sock.sendPresenceUpdate('composing', jidTujuan);
                                        const delay = Math.min(15000, Math.max(3000, bubble.length * 120)); 
                                        await new Promise(r => setTimeout(r, delay));
                                        
                                        await sock.sendMessage(jidTujuan, { text: bubble });
                                        // Catat balasan AI ke histori
                                        personaService.recordReply(jidTujuan, bubble, true);
                                    }
                                    return;
                                }
                            } catch (aiErr) {
                                console.error(chalk.red(`[AI-CHAT] Error: ${aiErr.message}`));
                            }
                        }
                        */

                        // AFK (Fallback jika AI gagal atau bukan target AI)
                        const afkState = afkService.getAfk(sessionId);
                        if (afkState && !adalahGrup) { 
                            const balasan = `Maaf sekarang aku lagi ga aktif karena *${afkState.reason}*, sejak *${afkState.timeAgo}* yang lalu. Nanti ku hubungi balik.`;
                            await sock.sendMessage(jidTujuan, { text: balasan });
                            return;
                        }
                    }
                    return;
                }

                // Jangan teruskan ke handler jika dari diri sendiri (untuk sesi default) agar tidak looping
                if (dariSaya) continue;
                if (!teks) continue;

                try {
                    msg.bodyTeks = teks;
                    await tanganiPesan(sock, msg);
                } catch (e) {
                    console.error(chalk.bgRed(" HANDLER ERROR "), e);
                    laporError(e, 'messageHandler', {
                        sender: jidTujuan,
                        text: teks,
                        isGroup: adalahGrup
                    });

                    // Notify admin on critical handler error
                    if (ADMIN_NUMBERS && ADMIN_NUMBERS.length > 0) {
                        const adminJid = ADMIN_NUMBERS[0].includes('@') ? ADMIN_NUMBERS[0] : `${ADMIN_NUMBERS[0]}@s.whatsapp.net`;
                        await sock.sendMessage(adminJid, {
                            text: `⚠️ *CRITICAL ERROR IN HANDLER*\n\nUser: @${msg.key.remoteJid.split('@')[0]}\nError: ${e.message}\n\nCheck logs for details.`
                        }).catch(() => { });
                    }
                }
            }
        } catch (err) {
            console.error(chalk.red('[ERROR] Upsert Handler Error:'), err);
        }
    })
}

module.exports = sambungKeWhatsApp;
