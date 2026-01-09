const chalk = require("chalk");
const fs = require('fs');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen } = require('./magang');
const { generateAttendanceReport } = require('./aiService');
const { setDraft } = require('./previewService');
const { getAllowedGroups, isHoliday } = require('../config/holidays');

const { loadGroupSettings } = require('./groupSettings');
const { getMessage } = require('./messageService');
const { isSchedulerEnabled } = require('./botState'); // Use centralized state to avoid circular dependency

let botSocket = null;

function setBotSocket(sock) {
    botSocket = sock;
    console.log(chalk.cyan('[SCHEDULER] Socket updated'));
}

// Check if today is weekend or holiday for a specific timezone
function isWeekendOrHoliday(timezone = 'Asia/Makassar') {
    const now = new Date();
    // Get date parts in specific timezone
    const tzString = now.toLocaleString("en-US", { timeZone: timezone });
    const tzDate = new Date(tzString);

    const day = tzDate.getDay();
    if (day === 0 || day === 6) return true;

    // Check holiday based on YYYY-MM-DD in that timezone
    const dateStr = tzDate.toISOString().split('T')[0];
    return isHoliday(dateStr);
}

// Helper to send message to user and their group (if allowed)
async function sendReminder(sock, user, text) {
    // 1. Send personal DM (Always)
    try {
        await sock.sendMessage(user.phone, { text });
    } catch (e) { console.error(chalk.red(`[SCHEDULER] Failed DM to ${user.phone}:`), e.message); }
}

// Check if today is a holiday for a specific group
function isGroupHoliday(config, timezone = 'Asia/Makassar') {
    if (!config.holidays || config.holidays.length === 0) return false;

    const now = new Date();
    const tzString = now.toLocaleString("en-US", { timeZone: timezone });
    const tzDate = new Date(tzString);
    const dateStr = tzDate.toISOString().split('T')[0];

    return config.holidays.includes(dateStr);
}

// Check if today is weekend AND group has skipWeekends enabled (default: true)
function isGroupWeekend(config, timezone = 'Asia/Makassar') {
    const now = new Date();
    const tzString = now.toLocaleString("en-US", { timeZone: timezone });
    const tzDate = new Date(tzString);
    const day = tzDate.getDay();

    const isWeekend = (day === 0 || day === 6);
    // skipWeekends defaults to true if not set
    const shouldSkip = config.skipWeekends !== false;
    return isWeekend && shouldSkip;
}

// Combined check: should this group be skipped today?
function shouldSkipGroup(config, timezone = 'Asia/Makassar') {
    return isGroupHoliday(config, timezone) || isGroupWeekend(config, timezone);
}

// Helper: Broadcast Simple Message with Hidetag (Tag All) - User Request
async function broadcastSimpleWithHidetag(sock, groupId, msgKey) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const allParticipants = groupMetadata.participants.map(p => p.id);
        const msgText = getMessage(msgKey);

        await sock.sendMessage(groupId, {
            text: msgText,
            mentions: allParticipants
        });
    } catch (e) {
        console.error(chalk.red(`[SCHEDULER] Failed simple hidetag to ${groupId}:`), e.message);
    }
}

// Morning reminder (08:00)
async function runMorningReminder(providedSock, timezone = 'Asia/Makassar') {
    const sock = providedSock || botSocket;
    if (!sock) {
        console.error(chalk.red('[SCHEDULER] Cannot run morning reminder: Bot socket not connected'));
        return;
    }
    console.log(chalk.magenta(`[SCHEDULER] Running morning reminder (08:00 ${timezone})...`));
    if (!isSchedulerEnabled()) return;
    if (isWeekendOrHoliday(timezone)) return;

    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) => {
        const groupTz = c.timezone || 'Asia/Makassar';
        return c.schedulerEnabled && groupTz === timezone && !shouldSkipGroup(c, timezone);
    });

    for (const [groupId, _] of enabledGroups) {
        await broadcastSimpleWithHidetag(sock, groupId, 'morning_reminder');
        await new Promise(r => setTimeout(r, 2000));
    }
}

// Afternoon reminder (16:00)
async function runAfternoonReminder(providedSock, timezone = 'Asia/Makassar') {
    const sock = providedSock || botSocket;
    if (!sock) {
        console.error(chalk.red('[SCHEDULER] Cannot run afternoon reminder: Bot socket not connected'));
        return;
    }
    console.log(chalk.magenta(`[SCHEDULER] Running afternoon reminder (16:00 ${timezone})...`));
    if (!isSchedulerEnabled()) return;
    if (isWeekendOrHoliday(timezone)) return;

    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) => {
        const groupTz = c.timezone || 'Asia/Makassar';
        return c.schedulerEnabled && groupTz === timezone && !shouldSkipGroup(c, timezone);
    });

    for (const [groupId, _] of enabledGroups) {
        await broadcastSimpleWithHidetag(sock, groupId, 'afternoon_reminder');
        await new Promise(r => setTimeout(r, 2000));
    }
}

// Evening reminder (21:00, 23:00)
async function runAutoReminder(providedSock, enablePrivateChat = false, timezone = 'Asia/Makassar') {
    const sock = providedSock || botSocket;
    if (!sock) {
        console.error(chalk.red('[SCHEDULER] Cannot run evening reminder: Bot socket not connected'));
        return;
    }
    console.log(chalk.magenta(`[SCHEDULER] Running evening reminder (PrivateChat: ${enablePrivateChat}, TZ: ${timezone})...`));
    if (!isSchedulerEnabled()) return;
    if (isWeekendOrHoliday(timezone)) return;

    // 1. Group Broadcasts (Simple Hidetag)
    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) => {
        const groupTz = c.timezone || 'Asia/Makassar';
        return c.schedulerEnabled && groupTz === timezone && !shouldSkipGroup(c, timezone);
    });

    for (const [groupId, _] of enabledGroups) {
        await broadcastSimpleWithHidetag(sock, groupId, 'evening_reminder');
        await new Promise(r => setTimeout(r, 2000));
    }

    // 2. Private Chat (Japri) - Only if enabled (e.g. at 23:00)
    // For Japri, we use the default timezone unless we implement per-user timezone later.
    // For now, Japri remains on WITA (main bot timezone)
    if (enablePrivateChat && timezone === 'Asia/Makassar') {
        console.log(chalk.cyan('[SCHEDULER] Sending Private Reminders (Japri)...'));
        const allUsers = getAllUsers();
        for (const user of allUsers) {
            try {
                const status = await cekStatusHarian(user.email, user.password);
                if (!status.success || !status.sudahAbsen) {
                    await sock.sendMessage(user.phone, {
                        text: getMessage('evening_reminder')
                    });
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (e) {
                console.error(`[SCHEDULER] Failed japri to ${user.email}:`, e.message);
            }
        }
    }
}

// PROXY: Generate Draft and Push to User at 23:50
async function runDraftPush(providedSock, timezone = 'Asia/Makassar') {
    const sock = providedSock || botSocket;
    if (!sock) {
        console.error(chalk.red('[SCHEDULER] Cannot run draft push: Bot socket not connected'));
        return;
    }
    console.log(chalk.magenta(`[SCHEDULER] Running draft push (23:50 ${timezone})...`));
    // Draft push and Emergency are global/system-wide for now (WITA)
    // To avoid redundant AI calls, we only run it for the main timezone
    if (timezone !== 'Asia/Makassar') return;

    if (isWeekendOrHoliday(timezone)) {
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
        } catch (e) {
            console.error(chalk.red(`[DRAFT-PUSH] Error for ${user.email}:`), e.message);
        }
    }
}

// EMERGENCY: Auto-submit at 23:59 for users who haven't submitted
async function runEmergencyAutoSubmit(providedSock, timezone = 'Asia/Makassar') {
    const sock = providedSock || botSocket;
    if (!sock) {
        console.error(chalk.red('[SCHEDULER] Cannot run emergency submit: Bot socket not connected'));
        return;
    }
    console.log(chalk.magenta(`[SCHEDULER] Running emergency auto-submit (23:59 ${timezone})...`));
    if (timezone !== 'Asia/Makassar') return;

    if (isWeekendOrHoliday(timezone)) {
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
        } catch (e) {
            console.error(chalk.red(`[AUTO-SUBMIT] Error for ${user.email}:`), e.message);
        }
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

    // For test runner, we just use the first test group's timezone or WITA
    const firstTz = testGroups[0][1].timezone || 'Asia/Makassar';

    // Map test types to function calls
    if (type === 'morning') await runMorningReminder(sock, firstTz);
    else if (type === 'afternoon') await runAfternoonReminder(sock, firstTz);
    else if (type === 'evening') await runAutoReminder(sock, false, firstTz); // No Japri for simple test
    else if (type === 'evening_full') await runAutoReminder(sock, true, firstTz); // With Japri

    return { success: true, count: testGroups.length };
}

function initScheduler(sock) {
    setBotSocket(sock);

    // Collect all required timezones (WIB, WITA, WIT)
    // Even if no groups use them yet, we register standard ones for convenience
    const standardTimezones = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
    const settings = loadGroupSettings();
    const customTimezones = Object.values(settings)
        .map(s => s.timezone)
        .filter(tz => tz && !standardTimezones.includes(tz));

    const timezones = [...new Set([...standardTimezones, ...customTimezones])];

    console.log(chalk.cyan(`[SCHEDULER] Initializing crons for timezones: ${timezones.join(', ')}`));

    timezones.forEach(tz => {
        // Morning reminder (08:00)
        cron.schedule('0 8 * * 1-5', () => runMorningReminder(null, tz), { timezone: tz });

        // Afternoon reminder (16:00 - Markipul)
        cron.schedule('0 16 * * 1-5', () => runAfternoonReminder(null, tz), { timezone: tz });

        // Evening reminders
        // 21:00 -> NO Private Chat
        cron.schedule('0 21 * * 1-5', () => runAutoReminder(null, false, tz), { timezone: tz });

        // 23:00 -> WITH Private Chat (Only for Makassar/system default to avoid redundancy)
        cron.schedule('0 23 * * 1-5', () => runAutoReminder(null, true, tz), { timezone: tz });

        // DRAFT PUSH (23:50) - Only for Makassar/system default
        cron.schedule('50 23 * * 1-5', () => runDraftPush(null, tz), { timezone: tz });

        // EMERGENCY (23:59) - Only for Makassar/system default
        cron.schedule('59 23 * * 1-5', () => runEmergencyAutoSubmit(null, tz), { timezone: tz });
    });

    console.log(chalk.blue('[SCHEDULER] Per-group timezones enabled. System defaults to WITA for Private Chat & Emergency.'));
}

exports.initScheduler = initScheduler;
exports.setBotSocket = setBotSocket;
exports.runAutoReminder = runAutoReminder;
exports.runEmergencyAutoSubmit = runEmergencyAutoSubmit;
exports.runMorningReminder = runMorningReminder;
exports.runAfternoonReminder = runAfternoonReminder;
exports.runTestScheduler = runTestScheduler;

