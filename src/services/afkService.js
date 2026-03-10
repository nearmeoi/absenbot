const fs = require('fs');
const path = require('path');

const AFK_FILE = path.join(__dirname, '../../data/afk_state.json');

// Pastikan folder data ada
if (!fs.existsSync(path.dirname(AFK_FILE))) {
    fs.mkdirSync(path.dirname(AFK_FILE), { recursive: true });
}

/**
 * Format waktu berlalu menjadi teks manusiawi
 */
function formatWaktuBerlalu(timestamp) {
    const detik = Math.floor((Date.now() - timestamp) / 1000);
    if (detik < 60) return `${detik} detik`;
    
    const menit = Math.floor(detik / 60);
    if (menit < 60) return `${menit} menit`;
    
    const jam = Math.floor(menit / 60);
    if (jam < 24) return `${jam} jam`;
    
    const hari = Math.floor(jam / 24);
    return `${hari} hari`;
}

/**
 * Kelola Status AFK
 */
const afkService = {
    setAfk: (sessionId, reason = 'Sibuk') => {
        const data = afkService.getAll();
        data[sessionId] = {
            active: true,
            reason: reason,
            startTime: Date.now()
        };
        fs.writeFileSync(AFK_FILE, JSON.stringify(data, null, 2));
    },

    setUnafk: (sessionId) => {
        const data = afkService.getAll();
        if (data[sessionId] && data[sessionId].active) {
            delete data[sessionId];
            fs.writeFileSync(AFK_FILE, JSON.stringify(data, null, 2));
            return true;
        }
        return false;
    },

    getAfk: (sessionId) => {
        const data = afkService.getAll();
        const state = data[sessionId];
        if (state && state.active) {
            return {
                ...state,
                timeAgo: formatWaktuBerlalu(state.startTime)
            };
        }
        return null;
    },

    getAll: () => {
        if (!fs.existsSync(AFK_FILE)) return {};
        try {
            return JSON.parse(fs.readFileSync(AFK_FILE, 'utf8'));
        } catch (e) {
            return {};
        }
    }
};

module.exports = afkService;
