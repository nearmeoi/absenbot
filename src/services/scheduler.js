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

// Helper: Broadcast to Group with Hidetag (Tag All)
async function broadcastToGroup(sock, groupId, msgKey) {
    try {
        // Fetch Group Metadata to get ALL participants (for Hidetag)
        const groupMetadata = await sock.groupMetadata(groupId);
        const allParticipants = groupMetadata.participants.map(p => p.id);

        // Get users who haven't submitted (for the list in the message text)
        const allUsers = getAllUsers();
        let belumAbsenNames = [];

        for (const user of allUsers) {
            try {
                // Check if user is actually in this group? 
                // Currently we don't track User->Group mapping strictly, 
                // but we can check if the user's phone is in allParticipants
                const userJid = user.phone.endsWith('@s.whatsapp.net') ? user.phone : `${user.phone}@s.whatsapp.net`;

                if (allParticipants.includes(userJid)) {
                    const status = await cekStatusHarian(user.email, user.password);
                    if (!status.success || !status.sudahAbsen) {
                        // Try to get pushName from metadata if possible, or fallback to phone
                        const participant = groupMetadata.participants.find(p => p.id === userJid);
                        // We don't have easy access to contact names here without store, so use @phone
                        belumAbsenNames.push(`@${user.phone.split('@')[0]}`);
                    }
                }
            } catch (e) { }
        }

        let msgText = "";

        // If everyone done
        if (belumAbsenNames.length === 0) {
            msgText = getMessage('siapa_all_done');
        } else {
            // Construct Message
            msgText = getMessage('siapa_header') + `\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
            belumAbsenNames.forEach(name => msgText += `- ${name}\n`);
            msgText += `\n${getMessage(msgKey)}`;
        }

        // HIDETAG: Send to group, but mention EVERYONE in the 'mentions' array
        // This makes everyone get a notification, even if not explicitly named in text
        await sock.sendMessage(groupId, {
            text: msgText,
            mentions: allParticipants // <--- HIDETAG ALL
        }, { ephemeralExpiration: 86400 });

    } catch (e) {
        console.error(chalk.red(`[SCHEDULER] Failed broadcast to ${groupId}:`), e.message);
    }
}

// Morning reminder (08:00 WITA) - GROUP BROADCAST ONLY
async function runMorningReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running morning reminder (08:00)...'));
    if (isWeekendOrHoliday()) return;

    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) => c.schedulerEnabled && !shouldSkipGroup(c));

    for (const [groupId, _] of enabledGroups) {
        await broadcastToGroup(sock, groupId, 'morning_reminder');
        await new Promise(r => setTimeout(r, 2000));
    }
}

// Afternoon reminder (16:00 WITA - Markipul) - GROUP BROADCAST ONLY
async function runAfternoonReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Running afternoon reminder (16:00 - Markipul)...'));
    if (isWeekendOrHoliday()) return;

    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) => c.schedulerEnabled && !shouldSkipGroup(c));

    for (const [groupId, _] of enabledGroups) {
        await broadcastToGroup(sock, groupId, 'afternoon_reminder');
        await new Promise(r => setTimeout(r, 2000));
    }
}

// Evening reminder (21:00, 23:00) - GROUP BROADCAST + OPTIONAL PRIVATE CHAT
async function runAutoReminder(sock, enablePrivateChat = false) {
    console.log(chalk.magenta(`[SCHEDULER] Running evening reminder (PrivateChat: ${enablePrivateChat})...`));
    if (isWeekendOrHoliday()) return;

    // 1. Group Broadcasts
    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) => c.schedulerEnabled && !shouldSkipGroup(c));

    for (const [groupId, _] of enabledGroups) {
        await broadcastToGroup(sock, groupId, 'evening_reminder');
        await new Promise(r => setTimeout(r, 2000));
    }

    // 2. Private Chat (Japri) - Only if enabled (e.g. at 23:00)
    if (enablePrivateChat) {
        console.log(chalk.cyan('[SCHEDULER] Sending Private Reminders (Japri)...'));
        const allUsers = getAllUsers();
        for (const user of allUsers) {
            try {
                const status = await cekStatusHarian(user.email, user.password);
                if (!status.success || !status.sudahAbsen) {
                    await sock.sendMessage(user.phone, {
                        text: getMessage('evening_reminder') // OR custom japri message
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

    // Map test types to function calls
    if (type === 'morning') await runMorningReminder(sock);
    else if (type === 'afternoon') await runAfternoonReminder(sock);
    else if (type === 'evening') await runAutoReminder(sock, false); // No Japri for simple test
    else if (type === 'evening_full') await runAutoReminder(sock, true); // With Japri

    return { success: true, count: testGroups.length };
}

function initScheduler(sock) {
    // Morning reminder (08:00 WITA)
    cron.schedule('0 8 * * 1-5', () => runMorningReminder(sock), { timezone: "Asia/Makassar" });

    // Afternoon reminder (16:00 WITA - Markipul)
    cron.schedule('0 16 * * 1-5', () => runAfternoonReminder(sock), { timezone: "Asia/Makassar" });

    // Evening reminders (WITA)
    // 21:00 -> NO Private Chat
    cron.schedule('0 21 * * 1-5', () => runAutoReminder(sock, false), { timezone: "Asia/Makassar" });

    // 23:00 -> WITH Private Chat (Japri)
    cron.schedule('0 23 * * 1-5', () => runAutoReminder(sock, true), { timezone: "Asia/Makassar" });

    // DRAFT PUSH (23:50 WITA)
    cron.schedule('50 23 * * 1-5', () => runDraftPush(sock), { timezone: "Asia/Makassar" });

    // EMERGENCY (23:59 WITA)
    cron.schedule('59 23 * * 1-5', () => runEmergencyAutoSubmit(sock), { timezone: "Asia/Makassar" });

    console.log(chalk.blue('[SCHEDULER] Schedule: 08:00, 16:00, 21:00, 23:00 (+Japri), 23:50 (Draft), 23:59 (Emergency) WITA'));
}

module.exports = { initScheduler, runAutoReminder, runEmergencyAutoSubmit, runMorningReminder, runAfternoonReminder, runTestScheduler };
