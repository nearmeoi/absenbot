/**
 * Manajemen Status Bot
 * State terpusat untuk menghindari circular dependency
 */

// --- Status Bot ---
let jadwalAktif = true;
let statusBot = 'online'; // 'online' | 'offline' | 'maintenance'
let botTerhubung = false;
let qrTerakhir = null;
let cmdMaintenance = []; // Daftar perintah yang sedang maintenance

// --- Anti-Loop ---
let logPesanKeluar = [];
const LIMIT_LOOP = 30;
const WINDOW_LOOP_MS = 10000; // 10 detik

// ========== GETTER ==========

const cekJadwalAktif = () => jadwalAktif;
const ambilStatusBot = () => statusBot;
const cekBotTerhubung = () => botTerhubung;
const ambilQRTerakhir = () => qrTerakhir;
const ambilCmdMaintenance = () => cmdMaintenance;
const cekCmdMaintenance = (cmd) => cmdMaintenance.includes(cmd.toLowerCase());

/**
 * Catat pesan keluar dan deteksi spam loop
 * @returns {boolean} true jika loop terdeteksi
 */
const catatPesanKeluar = () => {
    const sekarang = Date.now();
    logPesanKeluar.push(sekarang);

    // Bersihkan riwayat di luar jendela waktu
    logPesanKeluar = logPesanKeluar.filter(waktu => (sekarang - waktu) < WINDOW_LOOP_MS);

    if (logPesanKeluar.length >= LIMIT_LOOP) {
        console.error(`[KRITIS] Loop terdeteksi! ${logPesanKeluar.length} pesan terkirim dalam ${WINDOW_LOOP_MS / 1000} detik`);
        return true;
    }
    return false;
};

// ========== SETTER ==========

const setJadwalAktif = (aktif) => {
    jadwalAktif = aktif;
};

const setStatusBot = (status) => {
    if (['online', 'offline', 'maintenance'].includes(status)) {
        statusBot = status;
    }
};

const setBotTerhubung = (terhubung) => {
    botTerhubung = terhubung;
    if (terhubung) qrTerakhir = null;
};

const setQRTerakhir = (qr) => {
    qrTerakhir = qr;
};

const setCmdMaintenance = (daftar) => {
    if (Array.isArray(daftar)) {
        cmdMaintenance = daftar.map(c => c.toLowerCase());
    }
};

const toggleCmdMaintenance = (cmd) => {
    const c = cmd.toLowerCase();
    if (cmdMaintenance.includes(c)) {
        cmdMaintenance = cmdMaintenance.filter(item => item !== c);
    } else {
        cmdMaintenance.push(c);
    }
};

module.exports = {
    // Getter (nama baru)
    cekJadwalAktif,
    ambilStatusBot,
    cekBotTerhubung,
    ambilQRTerakhir,
    ambilCmdMaintenance,
    cekCmdMaintenance,
    catatPesanKeluar,

    // Setter (nama baru)
    setJadwalAktif,
    setStatusBot,
    setBotTerhubung,
    setQRTerakhir,
    setCmdMaintenance,
    toggleCmdMaintenance,

    // === ALIAS (backward compat) ===
    isSchedulerEnabled: cekJadwalAktif,
    getBotStatus: ambilStatusBot,
    isBotConnected: cekBotTerhubung,
    getLastQR: ambilQRTerakhir,
    getMaintenanceCommands: ambilCmdMaintenance,
    isCommandUnderMaintenance: cekCmdMaintenance,
    recordSentMessage: catatPesanKeluar,
    setSchedulerEnabled: setJadwalAktif,
    setBotStatus: setStatusBot,
    setBotConnected: setBotTerhubung,
    setLastQR: setQRTerakhir,
    setMaintenanceCommands: setCmdMaintenance,
    toggleCommandMaintenance: toggleCmdMaintenance
};
