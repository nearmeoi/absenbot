const chalk = require("chalk");
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen } = require('./magang');
const { generateAttendanceReport, processFreeTextToReport } = require('./aiService');
const { getDraft, setDraft, deleteDraft } = require('./previewService');
const { getAllowedGroups, isHoliday } = require('../config/holidays');
const { parseTagBasedReport } = require('../utils/messageUtils');

const { loadGroupSettings } = require('./groupSettings');
const { getMessage, updateMessage } = require('./messageService');
const { isSchedulerEnabled } = require('./botState');
const { generateWaveform } = require('../utils/generateWaveform');

const { safeRefresh } = require('../../scripts/safe_refresh');

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
    let chosenFile = null;

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
                    chosenFile = candidates[Math.floor(Math.random() * candidates.length)];
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

    // PRE-CALCULATE WAVEFORM ONCE (Optimization)
    let globalWaveform = new Uint8Array(0);
    if (vnPath) {
        try {
            const wfBuffer = await generateWaveform(vnPath);
            globalWaveform = new Uint8Array(wfBuffer.buffer, wfBuffer.byteOffset, wfBuffer.length);
        } catch (wfErr) {
            console.error('[Waveform] Failed to generate:', wfErr);
        }
    }

    for (const [groupId, _] of enabledGroups) {
        // 1. Always send text message first (Priority)
        await broadcastSimpleWithHidetag(sock, groupId, task.messageKey);

        // 2. If VN is available, send it too
        if (vnPath) {
            // Send VN Intro Text
            const introMsg = getMessage('REMINDER_MORNING_VN_INTRO');
            if (introMsg) {
                await sock.sendMessage(groupId, { text: introMsg });
                await new Promise(r => setTimeout(r, 1000));
            }

            try {
                const fileBuffer = fs.readFileSync(vnPath);
                
                await sock.sendMessage(groupId, { 
                    audio: fileBuffer, 
                    mimetype: mimetype, 
                    ptt: true,
                    fileName: chosenFile || 'audio.opus',
                    waveform: globalWaveform // Send Pre-calculated Uint8Array
                });
            } catch (e) {
                console.error(chalk.red(`[SCHEDULER] Failed to send VN to ${groupId}:`), e.message);
                // Text already sent, no fallback needed
            }
        }
        
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function runGroupHidetagJapri(sock, task, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Group Hidetag Japri: ${task.id} (${timezone})`));
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

async function runGroupTagAll(sock, task, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Group Tag All: ${task.id} (${timezone})`));
    if (!isSchedulerEnabled()) return;
    if (isWeekendOrHoliday(timezone)) return;

    const settings = loadGroupSettings();
    const enabledGroups = Object.entries(settings).filter(([_, c]) => {
        const groupTz = c.timezone || 'Asia/Makassar';
        return c.schedulerEnabled && groupTz === timezone && !shouldSkipGroup(c, timezone);
    });

    const msgText = getMessage(task.messageKey || 'REMINDER_TAG_ALL');

    for (const [groupId, _] of enabledGroups) {
        try {
            console.log(chalk.cyan(`[SCHEDULER] Tagging all in group ${groupId}`));
            const groupMetadata = await sock.groupMetadata(groupId);
            const participants = groupMetadata.participants.map(p => p.id);
            
            await sock.sendMessage(groupId, { 
                text: msgText, 
                mentions: participants 
            });
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error(chalk.red(`[SCHEDULER] Failed tag all broadcast to ${groupId}:`), e.message);
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
                let msg = getMessage('DRAFT_PUSH_ALERT');
                msg = msg.replace('{activity}', aiResult.aktivitas)
                         .replace('{pembelajaran}', aiResult.pembelajaran)
                         .replace('{kendala}', aiResult.kendala);
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

            // 0. Priority: Check for Pending Draft in Memory (User's manual edit)
            const memoryDraft = getDraft(user.phone);
            if (memoryDraft) {
                console.log(chalk.cyan(`[AUTO-SUBMIT] Using memory draft for ${user.email} (Phone: ${user.phone})`));
                finalReport = {
                    aktivitas: memoryDraft.aktivitas,
                    pembelajaran: memoryDraft.pembelajaran,
                    kendala: memoryDraft.kendala
                };
            }

            // 1. Try User Template
            if (!finalReport && user.template) {
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
                                                deleteDraft(user.phone);
                                                const sourceMsg = user.template ? " (Menggunakan Template)" : " (Auto-AI)";                                let successMsg = getMessage('AUTO_SUBMIT_SUCCESS');
                                
                                successMsg = successMsg.replace('{source}', sourceMsg)
                                                       .replace('{activity}', finalReport.aktivitas)
                                                       .replace('{pembelajaran}', finalReport.pembelajaran)
                                                       .replace('{kendala}', finalReport.kendala);
                
                                await sock.sendMessage(user.phone, { text: successMsg });
                            }            }
        } catch (e) {
            console.error(chalk.red(`[AUTO-SUBMIT] Error for ${user.email}:`), e.message);
        }
    }
}

async function runPreemptiveRefresh(sock) {
    console.log(chalk.magenta(`[SCHEDULER] Running Preemptive Session Refresh (15:30)`));
    const allUsers = getAllUsers();
    
    // Process in chunks to avoid overloading CPU/Network if using Puppeteer
    // But cekStatusHarian tries Direct Login first which is fast.
    
    for (const user of allUsers) {
        try {
            console.log(chalk.cyan(`[PREEMPTIVE] Checking/Refreshing session for ${user.email}...`));
            
            // This function automatically attempts login if session is invalid/expired
            // We pass a flag or just rely on its internal logic.
            // Note: cekStatusHarian returns { success, alreadyAbsen, ... }
            // It internally calls apiService.checkAttendanceStatus -> directLogin/puppeteerLogin if needed.
            const status = await cekStatusHarian(user.email, user.password);
            
            if (status.success) {
                console.log(chalk.green(`[PREEMPTIVE] ✅ Session valid for ${user.email}`));
            } else {
                console.log(chalk.red(`[PREEMPTIVE] ⚠️ Failed to refresh session for ${user.email}: ${status.pesan}`));
            }
            
            // Small delay to be polite to the server
            await new Promise(r => setTimeout(r, 2000));
            
        } catch (e) {
            console.error(chalk.red(`[PREEMPTIVE] Error for ${user.email}:`), e.message);
        }
    }
    console.log(chalk.magenta(`[SCHEDULER] Preemptive Refresh Complete.`));
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
                await sock.sendMessage(user.phone, { 
                    text: getMessage('WEB_SCHEDULE_SUCCESS') 
                });
            } else {
                report.status = 'failed';
                report.error = result.pesan;
                await sock.sendMessage(user.phone, { 
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
        else if (task.type === 'group_tag_all') runGroupTagAll(sock, task, timezone);
        else if (task.type === 'draft_push') runDraftPush(sock, task, timezone);
        else if (task.type === 'emergency_submit') runEmergencySubmit(sock, task, timezone);
        else if (task.type === 'preemptive_refresh') runPreemptiveRefresh(sock);
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

    // 3. Schedule Preemptive Session Refresh (15:30 WITA / 14:30 WIB)
    // Runs globally once per day at 15:30 Makassar time
    const refreshJob = cron.schedule('30 15 * * 1-5', () => {
        if (botSocket) runPreemptiveRefresh(botSocket);
    }, { timezone: 'Asia/Makassar' });
    activeCrons.set('global_preemptive_refresh', refreshJob);

    // 4. Safe Token Refresh (Every 2 Hours) - Requested by User
    // Runs globally every 2 hours between 07:00 and 00:00
    const safeRefreshJob = cron.schedule('0 7,9,11,13,15,17,19,21,23,0 * * *', () => {
        console.log(chalk.magenta('[SCHEDULER] Triggering 2-hour Safe Refresh...'));
        safeRefresh();
    }, { timezone: 'Asia/Makassar' });
    activeCrons.set('global_safe_refresh_2h', safeRefreshJob);

    console.log(chalk.green(`[SCHEDULER] Reload complete. ${activeCrons.size} jobs active.`));
}

function initScheduler(sock) {
    setBotSocket(sock);
    reloadScheduler();
    
    // Auto-retry pending web reports on startup
    const timezones = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
    timezones.forEach(tz => runScheduledWebReports(sock, tz));
}

// Test runner for Dashboard
async function runTestScheduler(sock, taskId) {
    const schedules = loadSchedules();
    const task = schedules.find(s => s.id === taskId);
    if (!task && taskId !== 'preemptive_refresh') return { success: false, message: 'Task not found' };

    // For test, force run on 'Asia/Makassar'
    const tz = 'Asia/Makassar';
    
    if (taskId === 'preemptive_refresh') await runPreemptiveRefresh(sock);
    else if (task.type === 'group_hidetag') await runGroupHidetag(sock, task, tz);
    else if (task.type === 'group_hidetag_japri') await runGroupHidetagJapri(sock, task, tz);
    else if (task.type === 'group_tag_all') await runGroupTagAll(sock, task, tz);
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