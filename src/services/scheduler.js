const chalk = require("chalk");
const fs = require('fs');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen } = require('./magang');
const { generateAttendanceReport } = require('./groqService');
const { setDraft } = require('./previewService');

// Check if today is weekend (Saturday or Sunday)
function isWeekend() {
    const day = new Date().getDay();
    return day === 0 || day === 6;
}

// Auto reminder function (Just notify)
async function runAutoReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running auto reminder...'));

    if (isWeekend()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping - weekend.'));
        return;
    }

    const allUsers = getAllUsers();
    if (allUsers.length === 0) return;

    let belumAbsen = [];
    for (const user of allUsers) {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && !status.sudahAbsen) {
                belumAbsen.push(user.phone);
            }
        } catch (e) { }
    }

    if (belumAbsen.length > 0) {
        console.log(chalk.cyan(`[SCHEDULER] Mengirim pengingat ke ${belumAbsen.length} user...`));
        for (const phone of belumAbsen) {
            try {
                await sock.sendMessage(phone, {
                    text: `*PENGINGAT ABSENSI*\n\nHalo! Kamu belum absen hari ini di MagangHub. Segera lapor ya sebelum jam 23:59 WITA.\n\nKetik *!absen* untuk mulai.`
                });
                await new Promise(r => setTimeout(r, 2000));
            } catch (e) { }
        }
    }
}

// PROXY: Generate Draft and Push to User at 23:50
async function runDraftPush(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running draft push (23:50 WITA)...'));

    if (isWeekend()) return;

    const allUsers = getAllUsers();
    for (const user of allUsers) {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && status.sudahAbsen) continue;

            console.log(chalk.yellow(`[DRAFT-PUSH] Preparing for ${user.email}`));

            const riwayatResult = await getRiwayat(user.email, user.password, 3);
            const aiResult = await generateAttendanceReport(riwayatResult.success ? riwayatResult.logs : []);

            if (aiResult.success) {
                const reportData = {
                    aktivitas: aiResult.aktivitas,
                    pembelajaran: aiResult.pembelajaran,
                    kendala: aiResult.kendala,
                    type: 'ai'
                };

                setDraft(user.phone, reportData);

                const msg = `*DARURAT: DRAF ABSENSI OTOMATIS*\n\nHampir tengah malam dan kamu belum absen. Saya sudah siapkan draf laporan AI untukmu:\n\n` +
                    `*Aktivitas:* ${aiResult.aktivitas}\n\n` +
                    `Ketik *ya* sekarang untuk mengirim laporan ini!\n` +
                    `_Jika tidak dibalas, sistem akan otomatis mengirim draf ini pada jam 23:59._`;

                await sock.sendMessage(user.phone, { text: msg });
            }
        } catch (e) { }
    }
}

// EMERGENCY: Auto-submit at 23:59 for users who haven't submitted
async function runEmergencyAutoSubmit(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running emergency auto-submit (23:59 WITA)...'));

    if (isWeekend()) return;

    const allUsers = getAllUsers();
    for (const user of allUsers) {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && status.sudahAbsen) continue;

            console.log(chalk.red(`[AUTO-SUBMIT] Emergency action for ${user.email}`));

            const riwayatResult = await getRiwayat(user.email, user.password, 3);
            const aiResult = await generateAttendanceReport(riwayatResult.success ? riwayatResult.logs : []);

            if (aiResult.success) {
                const submitResult = await prosesLoginDanAbsen({
                    email: user.email,
                    password: user.password,
                    aktivitas: aiResult.aktivitas,
                    pembelajaran: aiResult.pembelajaran,
                    kendala: aiResult.kendala
                });

                if (submitResult.success) {
                    await sock.sendMessage(user.phone, {
                        text: `*AUTO-SUBMIT BERHASIL*\n\nLaporan darurat telah dikirim otomatis oleh sistem agar absensi Anda aman.`
                    });
                }
            }
        } catch (e) { }
    }
}

function initScheduler(sock) {
    // Regular reminders (WITA)
    cron.schedule('0 21 * * 1-5', () => runAutoReminder(sock), { timezone: "Asia/Makassar" });
    cron.schedule('0 23 * * 1-5', () => runAutoReminder(sock), { timezone: "Asia/Makassar" });

    // DRAFT PUSH (23:50 WITA)
    cron.schedule('50 23 * * 1-5', () => runDraftPush(sock), { timezone: "Asia/Makassar" });

    // EMERGENCY (23:59 WITA)
    cron.schedule('59 23 * * 1-5', () => runEmergencyAutoSubmit(sock), { timezone: "Asia/Makassar" });

    console.log(chalk.blue('[SCHEDULER] Schedule: 21:00, 23:00, 23:50 (Draft), 23:59 (Emergency) WITA'));
}

module.exports = { initScheduler, runAutoReminder, runEmergencyAutoSubmit };
