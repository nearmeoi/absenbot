const { parseDraftFromMessage } = require('../src/handlers/messageHandler');
const chalk = require('chalk');

// Simulation of the exact draft the user received in WhatsApp
const simulatedDraft = `*DRAF LAPORAN OTOMATIS* 🤖

*Aktivitas:* (109 karakter)
Melanjutkan maintenance PC lab dan melakukan dokumentasi hasil kerja serta melakukan review terhadap progress

*Pembelajaran:* (122 karakter)
Mempelajari troubleshooting PC yang sangat bermanfaat untuk pengembangan skill dan menambah wawasan tentang best practices        

*Kendala:* (101 karakter)
Tidak ada kendala signifikan hari ini dan semua berjalan lancar sehingga pekerjaan dapat diselesaikan

Ketik *ya* untuk kirim, atau ceritakan aktivitas Anda untuk laporan baru:
_Contoh: !absen belajar database_`;

console.log(chalk.blue("\n--- 1. WHAT THE USER SEES IN WHATSAPP ---"));
console.log(chalk.gray(simulatedDraft));

console.log(chalk.blue("\n--- 2. WHAT THE BOT CAPTURES (Internal Variables) ---"));
const parsed = parseDraftFromMessage(simulatedDraft);
console.log(chalk.green("Final Variables for Kemnaker:"));
console.log(JSON.stringify(parsed, null, 2));

console.log(chalk.blue("\n--- 3. DATA INTEGRITY CHECK ---"));
const hasFooterInAktivitas = parsed.aktivitas.includes("Ketik *ya*");
const hasFooterInKendala = parsed.kendala.includes("Ketik *ya*");

if (!hasFooterInAktivitas && !hasFooterInKendala) {
    console.log(chalk.green("✅ FOOTER STRIPPED SUCCESSFULLY: No instructions found in the report variables."));
} else {
    console.log(chalk.red("❌ ERROR: Footer instructions were detected in variables!"));
}

const finalPayload = {
    activity_log: parsed.aktivitas,
    lesson_learned: parsed.pembelajaran,
    obstacles: parsed.kendala
};

console.log(chalk.blue("\n--- 4. FINAL JSON PAYLOAD FOR KEMNAKER API ---"));
console.log(chalk.yellow(JSON.stringify(finalPayload, null, 4)));
