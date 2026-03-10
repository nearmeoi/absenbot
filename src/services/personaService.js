const fs = require('fs');
const path = require('path');

const PERSONA_DATA_FILE = path.join(__dirname, '../../data/persona_big_data.json');
const STYLE_BANK_FILE = path.join(__dirname, '../../data/persona_style_bank.json');

// Memory sementara untuk menyimpan pesan terakhir (buat pairing & histori chat)
let lastMessages = {}; 
let chatHistory = {}; // { jid: [ {role, text} ] }

/**
 * Pastikan file database ada
 */
function initFiles() {
    const dir = path.dirname(PERSONA_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    if (!fs.existsSync(PERSONA_DATA_FILE)) fs.writeFileSync(PERSONA_DATA_FILE, JSON.stringify([], null, 2));
    if (!fs.existsSync(STYLE_BANK_FILE)) fs.writeFileSync(STYLE_BANK_FILE, JSON.stringify([], null, 2));
}

initFiles();

const personaService = {
    /**
     * Catat pesan masuk sebagai konteks & histori
     */
    recordIncoming: (jid, text) => {
        lastMessages[jid] = {
            text: text,
            timestamp: Date.now()
        };

        // Simpan ke histori chat (maks 10 pesan)
        if (!chatHistory[jid]) chatHistory[jid] = [];
        chatHistory[jid].push({ role: 'user', content: text });
        if (chatHistory[jid].length > 10) chatHistory[jid].shift();
    },

    /**
     * Catat balasan (manual atau AI) ke histori
     */
    recordReply: (jid, text, isAI = false) => {
        if (!chatHistory[jid]) chatHistory[jid] = [];
        chatHistory[jid].push({ role: 'assistant', content: text });
        if (chatHistory[jid].length > 10) chatHistory[jid].shift();
        
        // Jika manual, rekam ke big data
        if (!isAI) {
            personaService.recordManualReply(jid, text);
        }
    },

    /**
     * Ambil histori chat untuk AI
     */
    getChatContext: (jid) => {
        return chatHistory[jid] || [];
    },

    /**
     * Catat balasan manual Anda untuk jadi "Big Data" otomatis
     */
    recordManualReply: (jid, replyText) => {
        // 1. Simpan ke Style Bank (Kumpulan gaya ngetik)
        try {
            const styleBank = JSON.parse(fs.readFileSync(STYLE_BANK_FILE, 'utf8'));
            if (!styleBank.includes(replyText)) {
                styleBank.push(replyText);
                // Batasi agar file tidak terlalu raksasa (misal 5000 sample gaya)
                if (styleBank.length > 5000) styleBank.shift();
                fs.writeFileSync(STYLE_BANK_FILE, JSON.stringify(styleBank, null, 2));
            }
        } catch (e) {}

        // 2. Simpan sebagai Pairing (Konteks -> Jawaban)
        const context = lastMessages[jid];
        // Hanya pairing jika balasan dikirim dalam waktu kurang dari 30 menit dari pesan masuk
        if (context && (Date.now() - context.timestamp < 30 * 60 * 1000)) {
            try {
                const bigData = JSON.parse(fs.readFileSync(PERSONA_DATA_FILE, 'utf8'));
                
                // Cek apakah pairing ini sudah ada (biar gak duplikat)
                const isDuplicate = bigData.some(item => item.input === context.text && item.reply === replyText);
                
                if (!isDuplicate) {
                    bigData.push({
                        input: context.text,
                        reply: replyText,
                        t: new Date().toISOString()
                    });
                    
                    // Batasi data pairing (misal 10.000 percakapan)
                    if (bigData.length > 10000) bigData.shift();
                    
                    fs.writeFileSync(PERSONA_DATA_FILE, JSON.stringify(bigData, null, 2));
                    console.log(`[PERSONA] Data Baru Tersimpan: "${context.text}" -> "${replyText}"`);
                }
                
                // Hapus dari memory setelah berhasil di-pair
                delete lastMessages[jid];
            } catch (e) {
                console.error('[PERSONA] Gagal simpan pairing:', e.message);
            }
        }
    },

    /**
     * Ambil data untuk bahan AI
     */
    getTrainingData: () => {
        try {
            const style = JSON.parse(fs.readFileSync(STYLE_BANK_FILE, 'utf8'));
            const pairs = JSON.parse(fs.readFileSync(PERSONA_DATA_FILE, 'utf8'));
            return { style: style.slice(-100), pairs: pairs.slice(-50) }; // Ambil sample terbaru
        } catch (e) {
            return { style: [], pairs: [] };
        }
    }
};

module.exports = personaService;
