const axios = require("axios");
const fs = require("fs");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");

const email = "akmaljie12355@gmail.com"; // Pastikan email benar
const SESSION_DIR = "./sessions";
const sessionPath = `${SESSION_DIR}/${email}.json`;

if (!fs.existsSync(sessionPath)) {
    console.log("❌ Session tidak ditemukan. Jalankan !daftar dulu.");
    process.exit(1);
}

const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
// Rakit cookie manual
const cookieHeader = session.cookies
    .map(c => `${c.name}=${c.value}`)
    .join("; ");

const client = axios.create({
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Cookie: cookieHeader,
        Origin: "https://monev.maganghub.kemnaker.go.id",
        Referer: "https://monev.maganghub.kemnaker.go.id/dashboard",
        Accept: "application/json",
        // Kita coba kirim token dummy jika null, atau kosongkan
        "X-CSRF-TOKEN": session.csrfToken || "",
        "X-Requested-With": "XMLHttpRequest"
    }
});

(async () => {
    console.log("🔍 MENGAMBIL SELURUH DATA DARI SERVER...");
    try {
        // Tembak API tanpa parameter tanggal (biasanya akan return semua/bulan ini)
        const res = await client.get(
            "https://monev.maganghub.kemnaker.go.id/api/daily-logs"
        );

        console.log(`\n📡 Status Server: ${res.status} ${res.statusText}`);

        const logs = res.data.data; // Biasanya array ada di dalam properti .data

        if (Array.isArray(logs)) {
            console.log(`✅ TOTAL DATA DITEMUKAN: ${logs.length} LAPORAN`);
            console.log("--------------------------------------------------");

            // Tampilkan 3 data terbaru
            logs.slice(0, 3).forEach(log => {
                console.log(`📅 TANGGAL: ${log.date}`);
                console.log(`🆔 ID: ${log.id}`);
                console.log(
                    `📝 Isi: ${log.activity_log
                        .replace(/\n/g, " ")
                        .substring(0, 50)}...`
                );
                console.log(
                    "--------------------------------------------------"
                );
            });

            // Cek spesifik tanggal hari ini (Waktu Server)
            const today = new Date().toISOString().split("T")[0];
            const hariIni = logs.find(l => l.date === today);

            if (hariIni) {
                console.log(`🎯 HARI INI (${today}) SUDAH ADA DATA!`);
            } else {
                console.log(`⚠️ HARI INI (${today}) BELUM ADA DATA DI SERVER.`);
            }
        } else {
            console.log("⚠️ Format data aneh (Bukan Array):");
            console.log(JSON.stringify(res.data, null, 2));
        }
    } catch (e) {
        console.log("❌ REQUEST GAGAL:", e.message);
        if (e.response) {
            console.log("Status:", e.response.status);
            console.log("Response:", JSON.stringify(e.response.data));
        }
    }
})();
