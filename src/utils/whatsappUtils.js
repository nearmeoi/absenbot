const cacheGrup = new Map();

/**
 * Mengambil metadata grup dengan cache
 * @param {import('@whiskeysockets/baileys').WASocket} sock 
 * @param {string} jid 
 * @returns {Promise<Object|null>}
 */
async function ambilInfoGrup(sock, jid) {
    if (!jid.endsWith('@g.us')) return null;

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

/**
 * Menunjukkan status "sedang mengetik" di WhatsApp
 * @param {import('@whiskeysockets/baileys').WASocket} sock 
 * @param {string} jid 
 * @param {number} durasiMs Durasi minimal (opsional)
 */
async function tunjukkanSedangKetik(sock, jid, durasiMs = 0) {
    try {
        await sock.sendPresenceUpdate('composing', jid);
        if (durasiMs > 0) {
            await new Promise(resolve => setTimeout(resolve, durasiMs));
        }
    } catch (e) {
        // Abaikan error agar tidak mengganggu alur utama
    }
}

module.exports = {
    ambilInfoGrup,
    tunjukkanSedangKetik
};
