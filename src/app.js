const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const fs = require('fs');
const path = require('path');
const { DIR_AUTH } = require('./config/constants');
const { initScheduler, setBotSocket } = require('./services/scheduler');
const { initAuthServer } = require('./services/secureAuth');
const tanganiPesan = require('./handlers/messageHandler');
const { initPelaporError, laporError } = require('./services/errorReporter');

const modePairing = true;
let jadwalSiap = false;
let serverAuthSiap = false;

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
const cacheGrup = new Map();

async function ambilInfoGrup(sock, jid) {
    if (cacheGrup.has(jid)) {
        const cached = cacheGrup.get(jid);
        if (Date.now() - cached.waktu < 3600000) { // Cache 1 jam
            return cached.metadata;
        }
    }
    try {
        const metadata = await sock.groupMetadata(jid);
        cacheGrup.set(jid, { metadata, waktu: Date.now() });
        return metadata;
    } catch (e) {
        return null;
    }
}

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

async function sambungKeWhatsApp(awal = true) {
    const { state, saveCreds } = await useMultiFileAuthState(DIR_AUTH)
    const { version } = await fetchLatestBaileysVersion()

    console.log(chalk.cyan(`🤖 Memulai Bot (v${version.join('.')}) + SCHEDULER`))

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !modePairing,
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
        keepAliveIntervalMs: 60000,
        getMessage: async (key) => {
            return { conversation: "" };
        }
    })

    // --- ANTI-LOOP WRAPPER ---
    const kirimAsli = sock.sendMessage.bind(sock);
    const { catatPesanKeluar } = require('./services/botState');

    sock.sendMessage = async (...args) => {
        const loopDetected = catatPesanKeluar();
        if (loopDetected) {
            console.error(chalk.bgRed.white(" [ANTI-LOOP] KRITIS: Terlalu banyak pesan keluar! Shutdown untuk mencegah spam. "));

            try {
                const { ADMIN_NUMBERS } = require('./config/constants');
                if (ADMIN_NUMBERS && ADMIN_NUMBERS.length > 0) {
                    await kirimAsli(ADMIN_NUMBERS[0], {
                        text: "⚠️ *CRITICAL ALERT*\n\nBot mendeteksi aktivitas mencurigakan (SPAM LOOP). Proses dihentikan otomatis untuk keamanan."
                    });
                }
            } catch (e) { }

            process.exit(1);
        }
        return kirimAsli(...args);
    };

    // Pairing code
    if (modePairing && !sock.authState.creds.registered) {
        let nomorHP = process.env.PAIRING_NUMBER;
        if (!nomorHP) {
            nomorHP = await tanya(chalk.green('Nomor WA (628xxx): '))
        } else {
            console.log(chalk.cyan(`[PAIRING] Menggunakan nomor dari ENV: ${nomorHP}`));
        }

        try {
            console.log(chalk.yellow('[PAIRING] Menunggu 5 detik untuk stabilitas server...'));
            await new Promise(resolve => setTimeout(resolve, 5000));
            const kode = await sock.requestPairingCode(nomorHP.trim())
            console.log('\n' + chalk.bgGreen.black(' 🔑 KODE PAIRING ') + ' ' + chalk.yellow.bold(kode) + '\n');
        } catch (err) {
            console.error(chalk.red('[PAIRING] Gagal meminta kode pairing:'), err.message);
        }
    }

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !modePairing) {
            console.log(chalk.yellow('[QR] QR Code baru dihasilkan.'));
            const { setQRTerakhir } = require('./services/botState');
            setQRTerakhir(qr);
        }

        if (connection === "close") {
            const kodeStatus = lastDisconnect?.error?.output?.statusCode;

            // Cari info disconnect dari lookup map
            const infoDisconnect = ALASAN_DISCONNECT[kodeStatus] || {
                alasan: 'Error Tidak Diketahui',
                info: ''
            };

            console.log(chalk.red(`❌ Koneksi Terputus: ${infoDisconnect.alasan} (${kodeStatus})`));

            // Reset percobaan untuk error sementara
            if (kodeStatus === 428 || kodeStatus === 408) {
                console.log(chalk.yellow(' [SYSTEM] Error sementara terdeteksi. Mereset percobaan... '));
                hitungKoneksiUlang = 0;
            }

            if (infoDisconnect.info) console.log(chalk.yellow(`ℹ️ Info: ${infoDisconnect.info}`));

            if (lastDisconnect?.error) {
                console.log(chalk.gray(`[DEBUG] Detail: ${lastDisconnect.error.message}`));
            }

            // Update status dashboard
            try {
                const dashboardRoutes = require('./routes/dashboardRoutes');
                dashboardRoutes.setBotConnected(false);
            } catch (e) { }

            const harusRekoneksi = kodeStatus !== DisconnectReason.loggedOut;
            if (harusRekoneksi && hitungKoneksiUlang < MAKS_KONEKSI_ULANG) {
                hitungKoneksiUlang++;
                console.log(chalk.yellow(`🔄 Menyambung ulang (${hitungKoneksiUlang}/${MAKS_KONEKSI_ULANG}) dalam 5 detik...`));
                setTimeout(() => {
                    sambungKeWhatsApp(false);
                }, 5000);
            } else if (hitungKoneksiUlang >= MAKS_KONEKSI_ULANG) {
                console.log(chalk.bgRed('❌ Batas percobaan koneksi ulang tercapai. Cek server secara manual.'));
            } else {
                console.log(chalk.bgRed('⛔ Sesi tidak valid / Logout. Hapus folder SesiWA dan restart.'));
            }
        } else if (connection === "connecting") {
            console.log(chalk.cyan("🔄 Sedang menyambung ke WhatsApp..."));
        } else if (connection === "open") {
            hitungKoneksiUlang = 0;
            console.log(chalk.green("✅ KONEKSI STABIL. Scheduler Aktif."))
            console.log(chalk.gray(`[SYSTEM] Sesi valid terdeteksi. Bot siap digunakan.`));

            // Init error reporter
            initPelaporError(sock);

            // Init auth server (sekali saja)
            if (!serverAuthSiap) {
                initAuthServer();
                serverAuthSiap = true;
            }

            // Berikan socket ke dashboard
            const dashboardRoutes = require('./routes/dashboardRoutes');
            dashboardRoutes.setBotSocket(sock);
            dashboardRoutes.setBotConnected(true);

            // Kirim pesan tes ke admin
            const { ADMIN_NUMBERS } = require('./config/constants');
            if (ADMIN_NUMBERS && ADMIN_NUMBERS.length > 0) {
                setTimeout(() => {
                    sock.sendMessage(ADMIN_NUMBERS[0], { text: '🤖 Bot baru saja restart dan terhubung. Jika Anda melihat ini, bot bisa mengirim pesan.' })
                        .catch(err => {
                            console.error(chalk.red(`[ERROR] Gagal mengirim pesan tes: ${err.message}`));
                        });
                }, 5000);
            }

            // Update socket scheduler
            setBotSocket(sock);

            // Init scheduler (sekali saja)
            if (!jadwalSiap) {
                initScheduler(sock);
                jadwalSiap = true;
            }
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

                // Tandai sudah dibaca
                try { await sock.readMessages([msg.key]); } catch (e) { }

                // Abaikan pesan lama (lebih dari 30 menit sebelum startup)
                const waktuPesan = (typeof msg.messageTimestamp === 'number')
                    ? msg.messageTimestamp
                    : msg.messageTimestamp.low || Math.floor(Date.now() / 1000);

                const TOLERANSI = 1800; // 30 menit
                if (waktuPesan < (WAKTU_MULAI - TOLERANSI)) continue;

                if (!teks) continue;

                const dariSaya = msg.key.fromMe;
                const jidTujuan = msg.key.remoteJid;
                const adalahGrup = jidTujuan.endsWith('@g.us');

                // Ambil nama pengirim
                let namaPengirim = msg.pushName || 'Unknown';
                if (dariSaya) namaPengirim = 'ME';

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

                // Format log: [WAKTU] [Grup] Pengirim: Pesan
                const prefix = chalk.gray(`[${waktu}]`);
                const pengirim = dariSaya ? chalk.blue.bold('ME') : chalk.green.bold(namaPengirim);

                console.log(`${prefix} ${infoKonteks}${pengirim}: ${teks}`);

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
                }
            }
        } catch (err) {
            console.error(chalk.red('[ERROR] Upsert Handler Error:'), err);
        }
    })
}

module.exports = sambungKeWhatsApp;
