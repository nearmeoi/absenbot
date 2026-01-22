const axios = require('axios');
const { loadSession } = require('./src/services/apiService');
const { API_BASE_URL } = require('./src/config/constants');

const TARGET_ID = 3361275; // ID Laporan Anda Hari Ini
const EMAIL = 'akmaljie12355@gmail.com';

(async () => {
    console.log(`[HACK] Mencoba menghapus paksa laporan ID: ${TARGET_ID}`);
    
    const session = loadSession(EMAIL);
    if (!session) {
        console.error("Session hilang.");
        return;
    }

    const cookieHeader = session.cookies.map(c => `${c.name}=${c.value}`).join("; ");
    
    const headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "Cookie": cookieHeader,
        "Origin": API_BASE_URL,
        "Referer": `${API_BASE_URL}/dashboard`,
        "Accept": "application/json",
        "X-CSRF-TOKEN": session.csrfToken || "",
        "X-Requested-With": "XMLHttpRequest"
    };

    if (session.accessToken) {
        headers["Authorization"] = `Bearer ${session.accessToken}`;
    }

    try {
        // PERCOBAAN: DELETE /api/daily-logs/{id}
        const url = `${API_BASE_URL}/api/daily-logs/${TARGET_ID}`;
        console.log(`[ATTEMPT] DELETE ${url}`);
        
        const response = await axios.delete(url, { headers });
        
        console.log("Response Status:", response.status);
        if (response.status === 200 || response.status === 204) {
            console.log("✅ PINTU TERBUKA! Laporan berhasil dihapus.");
            console.log("SILAKAN KIRIM ULANG LAPORAN SEKARANG!");
        } else {
            console.log("❌ GAGAL: Server merespon tapi tidak menghapus.", response.status);
        }

    } catch (error) {
        console.error("❌ PINTU TERTUTUP RAPAT.");
        if (error.response) {
            console.error(`Status: ${error.response.status} (${error.response.statusText})`);
            console.error("Pesan:", JSON.stringify(error.response.data));
        } else {
            console.error("Error:", error.message);
        }
    }
})();
