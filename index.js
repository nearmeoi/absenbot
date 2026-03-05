// Muat environment variables terlebih dahulu — FORCE OVERRIDE
require('dotenv').config({ override: true });

// --- FILTER KONSOL: Sembunyikan log internal Baileys yang berisik ---
const POLA_FILTER = ['Closing session', 'SessionEntry', '_chains', 'ephemeralKeyPair', 'pendingPreKey'];

const saringOutput = (args) => {
    const teks = args.map(arg => {
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch (e) { return String(arg); }
    }).join(' ');

    return POLA_FILTER.some(pola => teks.includes(pola));
};

const logAsli = console.log;
console.log = (...args) => { if (!saringOutput(args)) logAsli.apply(console, args); };

const infoAsli = console.info;
console.info = (...args) => { if (!saringOutput(args)) infoAsli.apply(console, args); };

const errorAsli = console.error;
console.error = (...args) => { if (!saringOutput(args)) errorAsli.apply(console, args); };

// --- MUAT APLIKASI ---
const sambungKeWhatsApp = require('./src/app');
const { laporError } = require('./src/services/errorReporter');

// --- GRACEFUL SHUTDOWN ---
const matikanApp = (sinyal) => {
    console.log(`\n[SHUTDOWN] Menerima ${sinyal}. Membersihkan...`);

    try {
        const { shutdownAuthServer } = require('./src/services/secureAuth');
        shutdownAuthServer();
    } catch (e) { }

    console.log('[SHUTDOWN] Selesai. Keluar.');
    process.exit(0);
};

process.on('SIGTERM', () => matikanApp('SIGTERM'));
process.on('SIGINT', () => matikanApp('SIGINT'));

// --- PENANGAN ERROR GLOBAL ---
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    laporError(err, 'UncaughtException').finally(() => matikanApp('UNCAUGHT_EXCEPTION'));
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
    laporError(reason, 'UnhandledRejection');
});

// --- BERSIHKAN LOG OTOMATIS (Setiap 24 Jam) ---
const fs = require('fs');
const path = require('path');

setInterval(() => {
    const folderLog = path.join(__dirname, 'logs');
    if (!fs.existsSync(folderLog)) return;

    const daftarFile = fs.readdirSync(folderLog);
    for (const namaFile of daftarFile) {
        if (!namaFile.endsWith('.log')) continue;
        const pathFile = path.join(folderLog, namaFile);
        const info = fs.statSync(pathFile);
        if (info.size > 10 * 1024 * 1024) { // Batas 10MB
            fs.writeFileSync(pathFile, '');
            console.log(`[CLEANUP] File log besar dibersihkan: ${namaFile}`);
        }
    }
}, 24 * 60 * 60 * 1000);

// --- MULAI APLIKASI ---
try {
    sambungKeWhatsApp();
} catch (error) {
    console.error("Error kritis saat memulai aplikasi:", error);
}