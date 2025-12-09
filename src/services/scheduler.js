const chalk = require("chalk");
const fs = require('fs');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian } = require('./magang');

// --- FUNGSI ALARM OTOMATIS ---
// Now uses hybrid Axios+Puppeteer for faster bulk checking
async function runAutoReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] 🔔 Running Auto Reminder (Hybrid Mode)...'));

    // Cek apakah ada file ID Grup
    if (!fs.existsSync(GROUP_ID_FILE)) {
        console.log(chalk.red('[SCHEDULER] Gagal: Belum ada grup yang diset. Ketik !setgroup di WA.'));
        return;
    }

    const groupId = fs.readFileSync(GROUP_ID_FILE, 'utf8').trim();
    const allUsers = getAllUsers();

    if (allUsers.length === 0) return;

    await sock.sendMessage(groupId, { text: `🔔 *ALARM OTOMATIS*\nSedang mengecek status absensi seluruh peserta...` });

    let belumAbsen = [];
    for (const user of allUsers) {
        try {
            // Hybrid check - uses Axios first, falls back to Puppeteer
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && !status.sudahAbsen) {
                belumAbsen.push(user.phone);
            } else if (!status.success) {
                console.log(chalk.yellow(`[SCHEDULER] Check failed for ${user.email}: ${status.pesan}`));
                belumAbsen.push(user.phone); // Mark as not attended if check fails
            }
        } catch (e) {
            console.error(chalk.red(`[SCHEDULER] Error checking ${user.email}:`), e.message);
        }
    }

    if (belumAbsen.length > 0) {
        let msgAlert = `🚨 *PERINGATAN UPAH (AUTO)* 🚨\n\n`;
        msgAlert += `Halo teman-teman, sekarang sudah malam.\nNama-nama di bawah ini *BELUM ABSEN*:\n\n`;
        belumAbsen.forEach(num => msgAlert += `👉 @${num.split('@')[0]}\n`);
        msgAlert += `\n💡 _Segera isi laporan sebelum jam 23:59!_`;

        await sock.sendMessage(groupId, {
            text: msgAlert,
            mentions: belumAbsen
        });
    } else {
        await sock.sendMessage(groupId, { text: `✅ *SEMUA AMAN!* Seluruh peserta sudah absen.` });
    }
}

function initScheduler(sock) {
    // --- SET JADWAL CRON ---
    // Format Cron: Menit Jam * * *

    // Jam 18:00 (6 Sore)
    cron.schedule('0 18 * * *', () => runAutoReminder(sock), { timezone: "Asia/Jakarta" });

    // Jam 20:00 (8 Malam)
    cron.schedule('0 20 * * *', () => runAutoReminder(sock), { timezone: "Asia/Jakarta" });

    // Jam 22:00 (10 Malam)
    cron.schedule('0 22 * * *', () => runAutoReminder(sock), { timezone: "Asia/Jakarta" });

    console.log(chalk.blue('📅 Jadwal Alarm: 18:00, 20:00, 22:00 WIB'));
}

module.exports = { initScheduler, runAutoReminder };
