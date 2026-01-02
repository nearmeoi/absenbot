const chalk = require("chalk");
const fs = require('fs');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen } = require('./magang');
const { generateAttendanceReport } = require('./groqService');
const { setDraft } = require('./previewService');
const { getAllowedGroups, isHoliday } = require('../config/holidays');

// Check if today is weekend or holiday
function isWeekendOrHoliday() {
    const day = new Date().getDay();
    if (day === 0 || day === 6) return true;
    return isHoliday();
}

// Helper to send message to user and their group (if allowed)
async function sendReminder(sock, user, text) {
    // 1. Send personal DM (Always)
    try {
        await sock.sendMessage(user.phone, { text });
    } catch (e) { console.error(chalk.red(`[SCHEDULER] Failed DM to ${user.phone}:`), e.message); }

    // 2. Send to Group (Only if whitelisted)
    /* 
       NOTE: Logic ini dimatikan sementara karena kita belum menyimpan Group ID user di database.
       Jika user.groupId nanti sudah ada, uncomment kode di bawah ini.
       
       const allowedGroups = getAllowedGroups();
       if (user.groupId && allowedGroups.includes(user.groupId)) {
           try {
               await sock.sendMessage(user.groupId, { text: `@${user.phone.split('@')[0]} ${text}`, mentions: [user.phone] });
           } catch (e) {}
       }
    */
}

// Morning reminder (08:00 WITA)
async function runMorningReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running morning reminder (08:00)...'));

    if (isWeekendOrHoliday()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping - weekend or holiday.'));
        return;
    }

    const allUsers = getAllUsers();
    if (allUsers.length === 0) return;

    console.log(chalk.cyan(`[SCHEDULER] Mengirim pengingat pagi ke ${allUsers.length} user...`));
    for (const user of allUsers) {
        await sendReminder(sock, user, `Selamat pagi! ☀️\n\nJangan lupa absen hari ini ya. Ketik *!absen* kapan saja untuk lapor.`);
        await new Promise(r => setTimeout(r, 2000));
    }
}

// Afternoon reminder (16:00 WITA - Markipul)
async function runAfternoonReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running afternoon reminder (16:00 - Markipul)...'));

    if (isWeekendOrHoliday()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping - weekend or holiday.'));
        return;
    }

    const allUsers = getAllUsers();
    if (allUsers.length === 0) return;

    let belumAbsen = [];
    for (const user of allUsers) {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && !status.sudahAbsen) {
                belumAbsen.push(user);
            }
        } catch (e) { }
    }

    if (belumAbsen.length > 0) {
        console.log(chalk.cyan(`[SCHEDULER] Mengirim Markipul ke ${belumAbsen.length} user...`));
        for (const user of belumAbsen) {
            await sendReminder(sock, user, `*MARKIPUL* 🏠\n\nMari kita pulang! Tapi jangan lupa absen dulu ya sebelum tengah malam.\n\nKetik *!absen* untuk lapor.`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
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
                    text: `*PENGINGAT ABSENSI* 🔔\n\nHalo! Kamu belum absen hari ini di MagangHub. Segera lapor ya sebelum jam 23:59 WITA.\n\nKetik *!absen* untuk mulai.`
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

                const msg = `*DARURAT: DRAF ABSENSI OTOMATIS* ⚠️\n\nHampir tengah malam dan kamu belum absen. Saya sudah siapkan draf laporan AI untukmu:\n\n` +
                    `🏢 *Aktivitas:* ${aiResult.aktivitas}\n\n` +
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
                        text: `*AUTO-SUBMIT BERHASIL* ✅\n\nLaporan darurat telah dikirim otomatis oleh sistem agar absensi Anda aman.`
                    });
                }
            }
        } catch (e) { }
    }
}

function initScheduler(sock) {
    // Morning reminder (08:00 WITA)
    cron.schedule('0 8 * * 1-5', () => runMorningReminder(sock), { timezone: "Asia/Makassar" });

    // Afternoon reminder (16:00 WITA - Markipul)
    cron.schedule('0 16 * * 1-5', () => runAfternoonReminder(sock), { timezone: "Asia/Makassar" });

    // Evening reminders (WITA)
    cron.schedule('0 21 * * 1-5', () => runAutoReminder(sock), { timezone: "Asia/Makassar" });
    cron.schedule('0 23 * * 1-5', () => runAutoReminder(sock), { timezone: "Asia/Makassar" });

    // DRAFT PUSH (23:50 WITA)
    cron.schedule('50 23 * * 1-5', () => runDraftPush(sock), { timezone: "Asia/Makassar" });

    // EMERGENCY (23:59 WITA)
    cron.schedule('59 23 * * 1-5', () => runEmergencyAutoSubmit(sock), { timezone: "Asia/Makassar" });

    console.log(chalk.blue('[SCHEDULER] Schedule: 08:00 (Pagi), 16:00 (Markipul), 21:00, 23:00, 23:50 (Draft), 23:59 (Emergency) WITA'));
}

module.exports = { initScheduler, runAutoReminder, runEmergencyAutoSubmit, runMorningReminder, runAfternoonReminder };
