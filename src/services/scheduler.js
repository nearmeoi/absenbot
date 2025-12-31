const chalk = require("chalk");
const fs = require('fs');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen } = require('./magang');
const { generateAttendanceReport } = require('./groqService');

// Check if today is weekend (Saturday or Sunday)
function isWeekend() {
    const day = new Date().getDay();
    return day === 0 || day === 6;
}

// Auto reminder function
async function runAutoReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running auto reminder...'));

    if (isWeekend()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping - weekend.'));
        return;
    }

    if (!fs.existsSync(GROUP_ID_FILE)) {
        console.log(chalk.red('[SCHEDULER] No group configured.'));
        return;
    }

    const groupId = fs.readFileSync(GROUP_ID_FILE, 'utf8').trim();
    const allUsers = getAllUsers();

    if (allUsers.length === 0) return;

    await sock.sendMessage(groupId, {
        text: `*PENGECEKAN OTOMATIS*\nMemeriksa ${allUsers.length} peserta...`
    });

    let belumAbsen = [];

    for (const user of allUsers) {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && !status.sudahAbsen) {
                belumAbsen.push(user.phone);
            } else if (!status.success) {
                belumAbsen.push(user.phone);
            }
        } catch (e) {
            console.error(chalk.red(`[SCHEDULER] Error checking ${user.email}:`), e.message);
        }
    }

    if (belumAbsen.length > 0) {
        let msgAlert = `*PENGINGAT ABSENSI*\n\nBelum absen:\n`;
        belumAbsen.forEach(num => msgAlert += `- @${num.split('@')[0]}\n`);
        msgAlert += `\nSegera lengkapi sebelum 23:59!`;

        await sock.sendMessage(groupId, { text: msgAlert, mentions: belumAbsen });
    } else {
        await sock.sendMessage(groupId, { text: `Semua peserta sudah absen hari ini.` });
    }
}

// EMERGENCY: Auto-generate & submit at 23:50 for users who haven't submitted
async function runEmergencyAutoSubmit(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running emergency auto-submit (23:50)...'));

    if (isWeekend()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping - weekend.'));
        return;
    }

    const allUsers = getAllUsers();
    if (allUsers.length === 0) return;

    for (const user of allUsers) {
        try {
            // Check if user already submitted today
            const status = await cekStatusHarian(user.email, user.password);

            if (status.success && status.sudahAbsen) {
                console.log(chalk.green(`[AUTO] ${user.email} already submitted`));
                continue;
            }

            console.log(chalk.yellow(`[AUTO] ${user.email} hasn't submitted, auto-generating...`));

            // Get history for AI context
            const riwayatResult = await getRiwayat(user.email, user.password, 5);
            const previousLogs = riwayatResult.success ? riwayatResult.logs : [];

            // Generate with AI
            const aiResult = await generateAttendanceReport(previousLogs);

            if (!aiResult.success) {
                console.error(chalk.red(`[AUTO] Failed to generate for ${user.email}: ${aiResult.error}`));
                // Notify user
                await sock.sendMessage(user.phone, {
                    text: `*GAGAL AUTO-SUBMIT*\n\nTidak dapat generate laporan otomatis.\nSilakan submit manual sekarang!`
                });
                continue;
            }

            // Submit to MagangHub
            const submitResult = await prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas: aiResult.aktivitas,
                pembelajaran: aiResult.pembelajaran,
                kendala: aiResult.kendala
            });

            if (submitResult.success) {
                console.log(chalk.green(`[AUTO] Successfully auto-submitted for ${user.email}`));
                await sock.sendMessage(user.phone, {
                    text: `*AUTO-SUBMIT BERHASIL*\n\nKarena Anda belum absen sampai 23:50, sistem telah mengirim laporan otomatis menggunakan AI.\n\nAktivitas: ${aiResult.aktivitas.substring(0, 80)}...`
                });
            } else {
                console.error(chalk.red(`[AUTO] Failed to submit for ${user.email}: ${submitResult.pesan}`));
                await sock.sendMessage(user.phone, {
                    text: `*GAGAL AUTO-SUBMIT*\n\nTidak dapat mengirim laporan.\nError: ${submitResult.pesan}\n\nSilakan submit manual sekarang!`
                });
            }

            // Delay between users to avoid rate limiting
            await new Promise(r => setTimeout(r, 3000));

        } catch (e) {
            console.error(chalk.red(`[AUTO] Error for ${user.email}:`), e.message);
        }
    }

    console.log(chalk.green('[SCHEDULER] Emergency auto-submit completed.'));
}

function initScheduler(sock) {
    // Regular reminders (Monday-Friday)
    // Jadwal WITA (Waktu Indonesia Tengah)
    cron.schedule('0 18 * * 1-5', () => runAutoReminder(sock), { timezone: "Asia/Makassar" });
    cron.schedule('0 20 * * 1-5', () => runAutoReminder(sock), { timezone: "Asia/Makassar" });
    cron.schedule('0 22 * * 1-5', () => runAutoReminder(sock), { timezone: "Asia/Makassar" });

    // EMERGENCY: Auto-submit at 23:50 (Monday-Friday)
    cron.schedule('50 23 * * 1-5', () => runEmergencyAutoSubmit(sock), { timezone: "Asia/Makassar" });

    console.log(chalk.blue('[SCHEDULER] Alarm: 18:00, 20:00, 22:00, 23:50 (emergency) WITA'));
}

module.exports = { initScheduler, runAutoReminder, runEmergencyAutoSubmit };
