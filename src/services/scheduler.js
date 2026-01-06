const chalk = require("chalk");
const fs = require('fs');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen } = require('./magang');
const { generateAttendanceReport } = require('./groqService');
const { setDraft } = require('./previewService');
const { getAllowedGroups, isHoliday } = require('../config/holidays');

const { loadGroupSettings } = require('./groupSettings');
const { getMessage } = require('./messageService');

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

    // 2. Send to Group (Only if whitelisted AND enabled)
    /*
       STRATEGY: Since we don't store which user belongs to which group yet,
       we will handle group broadcasts separately in the main scheduler functions
       by iterating over the allowed groups list.
       
       This function (sendReminder) keeps focusing on the individual user DM.
    */
}

// Check if today is a holiday for a specific group
function isGroupHoliday(config) {
    if (!config.holidays || config.holidays.length === 0) return false;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return config.holidays.includes(today);
}

// Check if today is weekend AND group has skipWeekends enabled (default: true)
function isGroupWeekend(config) {
    const day = new Date().getDay();
    const isWeekend = (day === 0 || day === 6);
    // skipWeekends defaults to true if not set
    const shouldSkip = config.skipWeekends !== false;
    return isWeekend && shouldSkip;
}

// Combined check: should this group be skipped today?
function shouldSkipGroup(config) {
    return isGroupHoliday(config) || isGroupWeekend(config);
}

// Morning reminder (08:00 WITA) - GROUP BROADCAST ONLY
async function runMorningReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running morning reminder (08:00)...'));

    if (isWeekendOrHoliday()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping - weekend or holiday.'));
        return;
    }

    // BROADCAST TO GROUPS ONLY (No personal DM)
    const settings = loadGroupSettings();
    // Filter: schedulerEnabled AND not skipped (holiday or weekend)
    const enabledGroups = Object.entries(settings).filter(([_, c]) =>
        c.schedulerEnabled && !shouldSkipGroup(c)
    );
    console.log(chalk.cyan(`[SCHEDULER] Broadcasting to ${enabledGroups.length} groups...`));

    const allUsers = getAllUsers();
    const msg = getMessage('morning_reminder');

    for (const [groupId, config] of enabledGroups) {
        try {
            // Get users who haven't submitted attendance yet
            let belumAbsen = [];
            for (const user of allUsers) {
                try {
                    const status = await cekStatusHarian(user.email, user.password);
                    if (status.success && !status.sudahAbsen) {
                        belumAbsen.push(user.phone);
                    } else if (!status.success) {
                        belumAbsen.push(user.phone);
                    }
                } catch (e) { }
            }

            if (belumAbsen.length > 0) {
                // Create hidetag message by including mentions in the message but using mentions array
                let msgAlert = getMessage('siapa_header') + `\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
                belumAbsen.forEach(
                    num => (msgAlert += `- @${num.split("@")[0]}\n`)
                );
                msgAlert += `\n${getMessage('morning_reminder')}`;

                await sock.sendMessage(groupId, { text: msgAlert, mentions: belumAbsen }, { ephemeralExpiration: 86400 });
            } else {
                // Send general reminder if everyone has submitted
                await sock.sendMessage(groupId, { text: getMessage('siapa_all_done') });
            }

            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error(chalk.red(`[SCHEDULER] Failed group broadcast to ${groupId}`));
        }
    }
}

// Afternoon reminder (16:00 WITA - Markipul) - GROUP BROADCAST ONLY
async function runAfternoonReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running afternoon reminder (16:00 - Markipul)...'));

    if (isWeekendOrHoliday()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping - weekend or holiday.'));
        return;
    }

    // BROADCAST MARKIPUL TO GROUPS ONLY (No personal DM)
    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) =>
        c.schedulerEnabled && !shouldSkipGroup(c)
    );
    console.log(chalk.cyan(`[SCHEDULER] Broadcasting Markipul to ${enabledGroups.length} groups...`));

    const allUsers = getAllUsers();
    const msg = getMessage('afternoon_reminder');

    for (const [groupId, config] of enabledGroups) {
        try {
            // Get users who haven't submitted attendance yet
            let belumAbsen = [];
            for (const user of allUsers) {
                try {
                    const status = await cekStatusHarian(user.email, user.password);
                    if (status.success && !status.sudahAbsen) {
                        belumAbsen.push(user.phone);
                    } else if (!status.success) {
                        belumAbsen.push(user.phone);
                    }
                } catch (e) { }
            }

            if (belumAbsen.length > 0) {
                // Create hidetag message by including mentions in the message but using mentions array
                let msgAlert = getMessage('siapa_header') + `\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
                belumAbsen.forEach(
                    num => (msgAlert += `- @${num.split("@")[0]}\n`)
                );
                msgAlert += `\n${getMessage('afternoon_reminder')}`;

                await sock.sendMessage(groupId, { text: msgAlert, mentions: belumAbsen }, { ephemeralExpiration: 86400 });
            } else {
                // Send general reminder if everyone has submitted
                await sock.sendMessage(groupId, { text: getMessage('siapa_all_done') });
            }

            await new Promise(r => setTimeout(r, 2000));
        } catch (e) { }
    }
}

// Evening reminder (21:00, 23:00) - GROUP BROADCAST ONLY
async function runAutoReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running evening reminder...'));

    if (isWeekendOrHoliday()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping - weekend or holiday.'));
        return;
    }

    // BROADCAST TO GROUPS ONLY (No personal DM)
    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) =>
        c.schedulerEnabled && !shouldSkipGroup(c)
    );

    const allUsers = getAllUsers();
    const msg = getMessage('evening_reminder');

    for (const [groupId, config] of enabledGroups) {
        try {
            // Get users who haven't submitted attendance yet
            let belumAbsen = [];
            for (const user of allUsers) {
                try {
                    const status = await cekStatusHarian(user.email, user.password);
                    if (status.success && !status.sudahAbsen) {
                        belumAbsen.push(user.phone);
                    } else if (!status.success) {
                        belumAbsen.push(user.phone);
                    }
                } catch (e) { }
            }

            if (belumAbsen.length > 0) {
                // Create hidetag message by including mentions in the message but using mentions array
                let msgAlert = getMessage('siapa_header') + `\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
                belumAbsen.forEach(
                    num => (msgAlert += `- @${num.split("@")[0]}\n`)
                );
                msgAlert += `\n${getMessage('evening_reminder')}`;

                await sock.sendMessage(groupId, { text: msgAlert, mentions: belumAbsen }, { ephemeralExpiration: 86400 });
            } else {
                // Send general reminder if everyone has submitted
                await sock.sendMessage(groupId, { text: getMessage('siapa_all_done') });
            }

            await new Promise(r => setTimeout(r, 2000));
        } catch (e) { }
    }
}

// PROXY: Generate Draft and Push to User at 23:50
async function runDraftPush(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running draft push (23:50 WITA)...'));

    if (isWeekendOrHoliday()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping draft push - weekend or holiday.'));
        return;
    }

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

    if (isWeekendOrHoliday()) {
        console.log(chalk.yellow('[SCHEDULER] Skipping auto-submit - weekend or holiday.'));
        return;
    }

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

// TEST RUNNER for Development
async function runTestScheduler(sock, type) {
    const settings = loadGroupSettings();
    // Filter groups strictly for testing
    const testGroups = Object.entries(settings).filter(([_, c]) => c.isTesting);

    if (testGroups.length === 0) {
        return { success: false, message: 'No groups marked for testing' };
    }

    let msgKey = '';
    if (type === 'morning') msgKey = 'morning_reminder';
    else if (type === 'afternoon') msgKey = 'afternoon_reminder';
    else if (type === 'evening') msgKey = 'evening_reminder';

    const msg = getMessage(msgKey);
    if (!msg) return { success: false, message: 'Invalid message type' };

    console.log(chalk.cyan(`[TEST] Sending ${type} to ${testGroups.length} test groups...`));

    for (const [groupId, config] of testGroups) {
        try {
            await sock.sendMessage(groupId, { text: `[TEST RUN]\n\n${msg}` });
        } catch (e) {
            console.error(`Failed test send to ${groupId}:`, e);
        }
    }
    return { success: true, count: testGroups.length };
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

module.exports = { initScheduler, runAutoReminder, runEmergencyAutoSubmit, runMorningReminder, runAfternoonReminder, runTestScheduler };
