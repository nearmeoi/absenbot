const axios = require("axios");
const fs = require("fs");

// --- KONFIGURASI ---
const email = "akmaljie12355@gmail.com";
const TARGET_DATE = "2025-12-05"; // Tanggal yang mau dicek

const SESSION_DIR = "./sessions";
const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

(async () => {
    console.log(`⚡ MENGUJI AXIOS KE TANGGAL: ${TARGET_DATE}`);
    const start = Date.now();

    const sessionPath = `${SESSION_DIR}/${email}.json`;

    if (!fs.existsSync(sessionPath)) {
        console.log("❌ Kunci tidak ada!");
        return;
    }

    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    const cookieHeader = session.cookies
        .map(c => `${c.name}=${c.value}`)
        .join("; ");

    try {
        const client = axios.create({
            timeout: 10000,
            maxRedirects: 0,
            headers: {
                "User-Agent": USER_AGENT,
                Cookie: cookieHeader,
                "X-CSRF-TOKEN": session.csrfToken,
                "X-Requested-With": "XMLHttpRequest",
                Origin: "https://monev.maganghub.kemnaker.go.id",
                Referer: "https://monev.maganghub.kemnaker.go.id/dashboard",
                Accept: "application/json, text/plain, */*"
            }
        });

        const url = `https://monev.maganghub.kemnaker.go.id/api/daily-logs?date=${TARGET_DATE}`;
        const response = await client.get(url);

        const duration = (Date.now() - start) / 1000;
        console.log(`\n⏱️ Waktu: ${duration} detik`);

        // --- LOGIKA PARSING BARU (ARRAY) ---
        const responseData = response.data;
        let logHariIni = null;

        // Cek apakah responseData.data adalah Array?
        if (responseData.data && Array.isArray(responseData.data)) {
            console.log(
                `[INFO] Server mengirim ${responseData.data.length} data log.`
            );
            // Cari yang tanggalnya cocok
            logHariIni = responseData.data.find(
                log => log.date === TARGET_DATE
            );
        }

        if (logHariIni) {
            console.log("✅ STATUS: SUDAH ABSEN (DATA DITEMUKAN)");
            console.log("----------------------------------------");
            console.log("🆔 ID:", logHariIni.id);
            console.log("📅 Tanggal:", logHariIni.date);
            console.log(
                "📝 Aktivitas:",
                logHariIni.activity_log.substring(0, 50) + "..."
            );
            console.log("----------------------------------------");
        } else {
            console.log("❌ STATUS: BELUM ABSEN (Data Null/Kosong)");
            // Debugging: Tampilkan apa yang didapat biar gak bingung
            // console.log('Raw Data:', JSON.stringify(responseData, null, 2));
        }
    } catch (error) {
        console.log(`❌ GAGAL: ${error.message}`);
    }
})();
