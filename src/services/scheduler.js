const chalk = require("chalk");
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen } = require('./magang');
const { generateAttendanceReport, processFreeTextToReport } = require('./aiService');
const { setDraft } = require('./previewService');
const { getAllowedGroups, isHoliday } = require('../config/holidays');
const { parseTagBasedReport } = require('../utils/messageUtils');

const { loadGroupSettings } = require('./groupSettings');
const { getMessage, updateMessage } = require('./messageService');
const { isSchedulerEnabled } = require('./botState');
const { generateWaveform } = require('../utils/generateWaveform');

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
        const msgText = getMessage(msgKey);
        await sock.sendMessage(groupId, { text: msgText });
    } catch (e) {
        console.error(chalk.red(`[SCHEDULER] Failed simple broadcast to ${groupId}:`), e.message);
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

    // CHECK FOR MORNING VN (SMART PLAYLIST)
    let vnPath = null;
    let mimetype = 'audio/mpeg';

    if (task.id === 'morning_reminder') {
        const mediaDir = path.join(__dirname, '../../data/media/morning');
        const stateFile = path.join(__dirname, '../../data/media/morning_state.json');

        if (fs.existsSync(mediaDir)) {
            try {
                // 1. Get all audio files (opus preferred, mp3 fallback)
                const files = fs.readdirSync(mediaDir).filter(f => f.endsWith('.opus') || f.endsWith('.mp3'));
                
                if (files.length > 0) {
                    // 2. Get last played
                    let lastPlayed = null;
                    if (fs.existsSync(stateFile)) {
                        try {
                            lastPlayed = JSON.parse(fs.readFileSync(stateFile, 'utf8')).last;
                        } catch (e) {}
                    }

                    // 3. Filter candidates (Anti-Repeat)
                    let candidates = files;
                    if (files.length > 1 && lastPlayed) {
                        candidates = files.filter(f => f !== lastPlayed);
                        if (candidates.length === 0) candidates = files;
                    }

                    // 4. Pick Random
                    const chosenFile = candidates[Math.floor(Math.random() * candidates.length)];
                    vnPath = path.join(mediaDir, chosenFile);
                    
                    // Set correct mimetype
                    if (chosenFile.endsWith('.opus')) mimetype = 'audio/ogg; codecs=opus';

                    console.log(chalk.green(`[SCHEDULER] Morning Playlist: Playing ${chosenFile}`));

                    // 5. Update State
                    fs.writeFileSync(stateFile, JSON.stringify({ last: chosenFile }));
                }
            } catch (e) {
                console.error(chalk.red('[SCHEDULER] Error processing playlist:'), e.message);
            }
        }
    }

    for (const [groupId, _] of enabledGroups) {
        if (vnPath) {
            // Send VN
            try {
                const fileBuffer = fs.readFileSync(vnPath);
                
                // Generate waveform for visual effect
                let waveform = new Uint8Array(0); 
                try {
                    const wfBuffer = await generateWaveform(vnPath);
                    waveform = new Uint8Array(wfBuffer.buffer, wfBuffer.byteOffset, wfBuffer.length);
                } catch (wfErr) {
                    console.error('[Waveform] Failed to generate:', wfErr);
                }

                await sock.sendMessage(groupId, { 
                    audio: fileBuffer, 
                    mimetype: mimetype, 
                    ptt: true,
                    fileName: chosenFile || 'audio.opus',
                    waveform: waveform // Send Uint8Array
                });
            } catch (e) {
                console.error(chalk.red(`[SCHEDULER] Failed to send VN to ${groupId}:`), e.message);
                await broadcastSimpleWithHidetag(sock, groupId, task.messageKey);
            }
        } else {
            await broadcastSimpleWithHidetag(sock, groupId, task.messageKey);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function runGroupHidetagJapri(sock, task, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Group Hidetag + Japri: ${task.id} (${timezone})`));
    if (!isSchedulerEnabled()) return;
    if (isWeekendOrHoliday(timezone)) return;

    // 1. Identify Missing Users FIRST
    const allUsers = getAllUsers();
    const pendingUsers = [];

    // Check status for all users to determine who to tag
    for (const user of allUsers) {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (!status.success || !status.sudahAbsen) {
                pendingUsers.push(user);
            }
        } catch (e) {
            console.error(`[SCHEDULER] Error checking status for ${user.email}:`, e.message);
        }
    }

    // 2. Logic: Send Group Message ONLY if there are pending users
    if (pendingUsers.length > 0) {
        const settings = loadGroupSettings();
        const enabledGroups = Object.entries(settings).filter(([_, c]) => {
            const groupTz = c.timezone || 'Asia/Makassar';
            return c.schedulerEnabled && groupTz === timezone && !shouldSkipGroup(c, timezone);
        });

        if (enabledGroups.length > 0) {
            const mentions = pendingUsers.map(u => u.phone);
            // Format: @user @user
            const mentionedText = pendingUsers.map(u => `@${u.phone.split('@')[0]}`).join(' ');
            let messageText = getMessage('REMINDER_GROUP_TARGETED');
            // Manual replacement because getMessage only handles {app_url} automatically
            messageText = messageText.replace('{users}', mentionedText);

            for (const [groupId, _] of enabledGroups) {
                try {
                    console.log(chalk.cyan(`[SCHEDULER] Sending targeted reminder to group ${groupId}`));
                    await sock.sendMessage(groupId, {
                        text: messageText,
                        mentions: mentions
                    });
                    await new Promise(r => setTimeout(r, 2000));
                } catch (e) {
                    console.error(chalk.red(`[SCHEDULER] Failed simple broadcast to ${groupId}:`), e.message);
                }
            }
        }
    } else {
        console.log(chalk.green(`[SCHEDULER] All users have attended! Skipping group reminder.`));
    }

    // 3. Japri Logic (Only for default timezone 'Asia/Makassar' to avoid spamming user multiple times)
    if (timezone === 'Asia/Makassar') {
        console.log(chalk.cyan('[SCHEDULER] Sending Private Reminders (Japri)...'));
        for (const user of pendingUsers) {
            try {
                // Use the list we already filtered above
                await sock.sendMessage(user.phone, { text: getMessage(task.messageKey, user.phone) });
                await new Promise(r => setTimeout(r, 1000));
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
                const msg = getMessage('DRAFT_PUSH_ALERT').replace('{activity}', aiResult.aktivitas);
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

            let finalReport = null;

            // 1. Try User Template
            if (user.template) {
                console.log(chalk.cyan(`[AUTO-SUBMIT] Using template for ${user.email}`));
                
                // Check if it's a manual tag format
                const manualParsed = parseTagBasedReport(user.template);
                if (manualParsed) {
                    finalReport = manualParsed;
                } else {
                    // It's a story/text -> Process with AI
                    const history = await getRiwayat(user.email, user.password, 3);
                    const aiResult = await processFreeTextToReport(user.template, history.success ? history.logs : []);
                    if (aiResult.success) {
                        finalReport = {
                            aktivitas: aiResult.aktivitas,
                            pembelajaran: aiResult.pembelajaran,
                            kendala: aiResult.kendala
                        };
                    }
                }
            }

            // 2. Fallback: Generate from History (Original Logic)
            if (!finalReport) {
                const riwayatResult = await getRiwayat(user.email, user.password, 3);
                const aiResult = await generateAttendanceReport(riwayatResult.success ? riwayatResult.logs : []);
                if (aiResult.success) {
                    finalReport = {
                        aktivitas: aiResult.aktivitas,
                        pembelajaran: aiResult.pembelajaran,
                        kendala: aiResult.kendala
                    };
                }
            }

            if (finalReport) {
                const submitResult = await prosesLoginDanAbsen({
                    email: user.email,
                    password: user.password,
                    aktivitas: finalReport.aktivitas,
                    pembelajaran: finalReport.pembelajaran,
                    kendala: finalReport.kendala
                });
                if (submitResult.success) {
                    const sourceMsg = user.template ? " (Menggunakan Template)" : " (Auto-AI)";
                    await sock.sendMessage(user.phone, {
                        text: getMessage('AUTO_SUBMIT_SUCCESS').replace('{source}', sourceMsg)
                    });
                }
            }
        } catch (e) {
            console.error(chalk.red(`[AUTO-SUBMIT] Error for ${user.email}:`), e.message);
        }
    }
}

async function runScheduledWebReports(sock, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Web Scheduled Reports (${timezone})`));
    const SCHEDULED_REPORTS_FILE = path.join(__dirname, '../../data/scheduled_reports.json');
    if (!fs.existsSync(SCHEDULED_REPORTS_FILE)) return;

    try {
        const scheduled = JSON.parse(fs.readFileSync(SCHEDULED_REPORTS_FILE, 'utf8'));
        const today = new Date().toISOString().split('T')[0];
        
        // Filter reports for today and status pending
        const toProcess = scheduled.filter(s => s.date === today && s.status === 'pending');

        for (const report of toProcess) {
            const user = (require('./database')).getUserByPhone(report.phone);
            if (!user) {
                report.status = 'failed';
                report.error = 'User not found';
                continue;
            }

            console.log(chalk.cyan(`[SCHEDULER] Auto-submitting web report for ${user.email}`));
            const result = await prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas: report.aktivitas,
                pembelajaran: report.pembelajaran,
                kendala: report.kendala
            });

            if (result.success) {
                report.status = 'success';
                await sock.sendMessage(report.phone, { 
                    text: getMessage('WEB_SCHEDULE_SUCCESS') 
                });
            } else {
                report.status = 'failed';
                report.error = result.pesan;
                await sock.sendMessage(report.phone, { 
                    text: getMessage('WEB_SCHEDULE_FAILED').replace('{error}', result.pesan) 
                });
            }
        }

        fs.writeFileSync(SCHEDULED_REPORTS_FILE, JSON.stringify(scheduled, null, 2));
    } catch (e) {
        console.error(chalk.red('[SCHEDULER] Error processing web reports:'), e.message);
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
        // 1. Schedule standard tasks from config
        schedules.forEach(task => {
            if (task.enabled) {
                scheduleTask(task, tz);
            }
        });

        // 2. Schedule Web App Reports (Always at 16:00)
        const webJob = cron.schedule('0 16 * * 1-5', () => {
            if (botSocket) runScheduledWebReports(botSocket, tz);
        }, { timezone: tz });
        activeCrons.set(`web_reports_${tz}`, webJob);
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