const chalk = require("chalk");
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen } = require('./magang');
const { generateAttendanceReport } = require('./aiService');
const { setDraft } = require('./previewService');
const { getAllowedGroups, isHoliday } = require('../config/holidays');

const { loadGroupSettings } = require('./groupSettings');
const { getMessage, updateMessage } = require('./messageService');
const { isSchedulerEnabled } = require('./botState');

// Config path
const SCHEDULE_CONFIG_FILE = path.join(__dirname, '../../data/scheduler_config.json');

// Global state
let botSocket = null;
const activeCrons = new Map(); // Store running cron tasks: 'id_timezone' -> task

function setBotSocket(sock) {
    botSocket = sock;
    console.log(chalk.cyan('[SCHEDULER] Socket updated'));
}

// --- CONFIG MANAGEMENT ---

function loadSchedules() {
    if (!fs.existsSync(SCHEDULE_CONFIG_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(SCHEDULE_CONFIG_FILE, 'utf8'));
    } catch (e) {
        console.error(chalk.red('[SCHEDULER] Error loading config:'), e.message);
        return [];
    }
}

function saveSchedules(schedules) {
    // Sort by time (08:00 before 16:00)
    const sorted = [...schedules].sort((a, b) => a.time.localeCompare(b.time));
    fs.writeFileSync(SCHEDULE_CONFIG_FILE, JSON.stringify(sorted, null, 2));
}

function addSchedule(schedule, customContent = null) {
    if (customContent) {
        // Create dynamic key for custom message
        const newKey = `SCHED_CUSTOM_${Date.now()}`;
        updateMessage(newKey, customContent);
        schedule.messageKey = newKey;
    }

    const schedules = loadSchedules();
    schedules.push(schedule);
    saveSchedules(schedules);
    reloadScheduler(); // Restart crons
    return schedule;
}

function updateSchedule(id, updates, customContent = null) {
    const schedules = loadSchedules();
    const index = schedules.findIndex(s => s.id === id);
    if (index !== -1) {
        if (customContent) {
            let key = schedules[index].messageKey;
            // If it's already a custom key, update it. If not, generate new one.
            if (!key || !key.startsWith('SCHED_CUSTOM_')) {
                key = `SCHED_CUSTOM_${Date.now()}`;
            }
            updateMessage(key, customContent);
            updates.messageKey = key;
        }

        schedules[index] = { ...schedules[index], ...updates };
        saveSchedules(schedules);
        reloadScheduler();
        return schedules[index];
    }
    return null;
}

function deleteSchedule(id) {
    const schedules = loadSchedules();
    const newSchedules = schedules.filter(s => s.id !== id);
    if (newSchedules.length !== schedules.length) {
        saveSchedules(newSchedules);
        reloadScheduler();
        return true;
    }
    return false;
}

// --- HELPER LOGIC ---

function isWeekendOrHoliday(timezone) {
    const now = new Date();
    const tzString = now.toLocaleString("en-US", { timeZone: timezone });
    const tzDate = new Date(tzString);
    const day = tzDate.getDay();
    if (day === 0 || day === 6) return true;
    const dateStr = tzDate.toISOString().split('T')[0];
    return isHoliday(dateStr);
}

function shouldSkipGroup(config, timezone) {
    // Check holiday
    if (config.holidays && config.holidays.length > 0) {
        const now = new Date();
        const tzString = now.toLocaleString("en-US", { timeZone: timezone });
        const tzDate = new Date(tzString);
        const dateStr = tzDate.toISOString().split('T')[0];
        if (config.holidays.includes(dateStr)) return true;
    }
    // Check weekend
    const now = new Date();
    const tzString = now.toLocaleString("en-US", { timeZone: timezone });
    const tzDate = new Date(tzString);
    const day = tzDate.getDay();
    const isWeekend = (day === 0 || day === 6);
    return isWeekend && (config.skipWeekends !== false);
}

async function broadcastSimpleWithHidetag(sock, groupId, msgKey) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const allParticipants = groupMetadata.participants.map(p => p.id);
        const msgText = getMessage(msgKey);
        await sock.sendMessage(groupId, { text: msgText, mentions: allParticipants });
    } catch (e) {
        console.error(chalk.red(`[SCHEDULER] Failed simple hidetag to ${groupId}:`), e.message);
    }
}

// --- TASK EXECUTORS ---

async function runGroupHidetag(sock, task, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Group Hidetag: ${task.id} (${timezone})`));
    if (!isSchedulerEnabled()) return;
    if (isWeekendOrHoliday(timezone)) return;

    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) => {
        const groupTz = c.timezone || 'Asia/Makassar';
        return c.schedulerEnabled && groupTz === timezone && !shouldSkipGroup(c, timezone);
    });

    for (const [groupId, _] of enabledGroups) {
        await broadcastSimpleWithHidetag(sock, groupId, task.messageKey);
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function runGroupHidetagJapri(sock, task, timezone) {
    await runGroupHidetag(sock, task, timezone);

    // Japri logic (Only for default timezone 'Asia/Makassar' to avoid spamming user multiple times if they are in multiple timezone groups - simplified for now)
    if (timezone === 'Asia/Makassar') {
        console.log(chalk.cyan('[SCHEDULER] Sending Private Reminders (Japri)...'));
        const allUsers = getAllUsers();
        for (const user of allUsers) {
            try {
                const status = await cekStatusHarian(user.email, user.password);
                if (!status.success || !status.sudahAbsen) {
                    await sock.sendMessage(user.phone, { text: getMessage(task.messageKey) });
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (e) {
                console.error(`[SCHEDULER] Failed japri to ${user.email}:`, e.message);
            }
        }
    }
}

async function runDraftPush(sock, task, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Draft Push (${timezone})`));
    if (timezone !== 'Asia/Makassar') return; // Global logic, run only once
    if (isWeekendOrHoliday(timezone)) return;

    const allUsers = getAllUsers();
    for (const user of allUsers) {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && status.sudahAbsen) continue;

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
                const msg = `*DARURAT: DRAF ABSENSI OTOMATIS* ⚠️\n\n` + 
                    `Hampir tengah malam dan kamu belum absen. Saya sudah siapkan draf laporan AI untukmu:\n\n` + 
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

async function runEmergencySubmit(sock, task, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Emergency Submit (${timezone})`));
    if (timezone !== 'Asia/Makassar') return; // Global logic
    if (isWeekendOrHoliday(timezone)) return;

    const allUsers = getAllUsers();
    for (const user of allUsers) {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && status.sudahAbsen) continue;

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

// --- CORE SCHEDULER LOGIC ---

function scheduleTask(task, timezone) {
    const [hour, minute] = task.time.split(':');
    const cronExp = `${minute} ${hour} * * ${task.days || '1-5'}`;

    const job = cron.schedule(cronExp, () => {
        const sock = botSocket;
        if (!sock) {
            console.error(chalk.red('[SCHEDULER] Bot socket not connected, skipping task'));
            return;
        }

        if (task.type === 'group_hidetag') runGroupHidetag(sock, task, timezone);
        else if (task.type === 'group_hidetag_japri') runGroupHidetagJapri(sock, task, timezone);
        else if (task.type === 'draft_push') runDraftPush(sock, task, timezone);
        else if (task.type === 'emergency_submit') runEmergencySubmit(sock, task, timezone);
        else console.warn(chalk.yellow(`[SCHEDULER] Unknown task type: ${task.type}`));

    }, { timezone: timezone });

    const key = `${task.id}_${timezone}`;
    activeCrons.set(key, job);
    console.log(chalk.gray(`[SCHEDULER] Scheduled: ${task.id} at ${task.time} (${timezone})`));
}

function reloadScheduler() {
    console.log(chalk.yellow('[SCHEDULER] Reloading schedules...'));
    // Stop all existing crons
    for (const [key, job] of activeCrons.entries()) {
        job.stop();
        activeCrons.delete(key);
    }

    const standardTimezones = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
    const settings = loadGroupSettings();
    const customTimezones = Object.values(settings)
        .map(s => s.timezone)
        .filter(tz => tz && !standardTimezones.includes(tz));
    const timezones = [...new Set([...standardTimezones, ...customTimezones])];

    const schedules = loadSchedules();

    timezones.forEach(tz => {
        schedules.forEach(task => {
            if (task.enabled) {
                scheduleTask(task, tz);
            }
        });
    });
    console.log(chalk.green(`[SCHEDULER] Reload complete. ${activeCrons.size} jobs active.`));
}

function initScheduler(sock) {
    setBotSocket(sock);
    reloadScheduler();
}

// Test runner for Dashboard
async function runTestScheduler(sock, taskId) {
    const schedules = loadSchedules();
    const task = schedules.find(s => s.id === taskId);
    if (!task) return { success: false, message: 'Task not found' };

    // For test, force run on 'Asia/Makassar'
    const tz = 'Asia/Makassar';
    
    if (task.type === 'group_hidetag') await runGroupHidetag(sock, task, tz);
    else if (task.type === 'group_hidetag_japri') await runGroupHidetagJapri(sock, task, tz);
    else if (task.type === 'draft_push') await runDraftPush(sock, task, tz);
    else if (task.type === 'emergency_submit') await runEmergencySubmit(sock, task, tz);
    
    return { success: true };
}

module.exports = {
    initScheduler,
    setBotSocket,
    loadSchedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    runTestScheduler,
    // Exports for compatibility if needed elsewhere
    runMorningReminder: async (sock) => runTestScheduler(sock, 'morning_reminder'), 
    runAfternoonReminder: async (sock) => runTestScheduler(sock, 'afternoon_reminder'),
    runAutoReminder: async (sock, japri) => runTestScheduler(sock, japri ? 'evening_reminder_2' : 'evening_reminder_1'),
    runEmergencyAutoSubmit: async (sock) => runTestScheduler(sock, 'emergency_submit')
};