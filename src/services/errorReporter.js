const chalk = require('chalk');
const { ADMIN_NUMBERS } = require('../config/constants');

let socketBot = null;
const cacheReport = new Map();
const COOLDOWN_REPORT_MS = 60000; // 1 menit

/**
 * Inisialisasi pelapor error dengan socket bot
 * @param {Object} sock - Baileys socket
 */
function initPelaporError(sock) {
    socketBot = sock;
}

/**
 * Kirim laporan error ke admin
 * @param {Error|string} error - Object error atau pesan
 * @param {string} konteks - Lokasi error terjadi
 * @param {Object} metadata - Info tambahan (pengirim, perintah, dll)
 */
async function laporError(error, konteks = 'Tidak diketahui', metadata = {}) {
    console.error(chalk.bgRed.white(' [LAPORAN ERROR] '), error);

    if (!socketBot || ADMIN_NUMBERS.length === 0) {
        console.warn(chalk.yellow('[PELAPOR ERROR] Socket bot atau admin belum dikonfigurasi. Hanya dicatat di log.'));
        return;
    }

    try {
        const pesanError = typeof error === 'string' ? error : error.message;

        // --- RATE LIMITING ---
        const kunciCache = `${konteks}:${pesanError}`;
        const laporanTerakhir = cacheReport.get(kunciCache);
        const sekarang = Date.now();

        if (laporanTerakhir && (sekarang - laporanTerakhir) < COOLDOWN_REPORT_MS) {
            console.log(chalk.gray(`[PELAPOR ERROR] Laporan duplikat ditahan: ${pesanError}`));
            return;
        }
        cacheReport.set(kunciCache, sekarang);

        // Bersihkan cache secara berkala untuk mencegah memory leak
        if (cacheReport.size > 100) {
            for (const [key, timestamp] of cacheReport.entries()) {
                if (sekarang - timestamp > COOLDOWN_REPORT_MS * 5) cacheReport.delete(key);
            }
        }

        const stack = error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'Tidak ada stack trace';

        let teksLaporan = '🚨 *SYSTEM ERROR REPORT* 🚨\n\n';
        teksLaporan += '*Konteks:* ' + konteks + '\n';
        teksLaporan += '*Waktu:* ' + new Date().toLocaleString('id-ID') + '\n';
        teksLaporan += '*Error:* ' + pesanError + '\n\n';

        if (Object.keys(metadata).length > 0) {
            teksLaporan += '*Metadata:*\n' + JSON.stringify(metadata, null, 2) + '\n\n';
        }

        teksLaporan += '*Stack Trace (Top 5):*\n```\n' + stack + '\n```';

        // Kirim ke admin pertama
        await socketBot.sendMessage(ADMIN_NUMBERS[0], { text: teksLaporan });
        console.log(chalk.green('[PELAPOR ERROR] Laporan error terkirim ke admin.'));
    } catch (e) {
        console.error(chalk.red('[PELAPOR ERROR] Gagal mengirim laporan ke admin:'), e.message);
    }
}

module.exports = {
    // Nama baru
    initPelaporError,
    laporError,

    // Alias backward compat
    initErrorReporter: initPelaporError,
    reportError: laporError
};
