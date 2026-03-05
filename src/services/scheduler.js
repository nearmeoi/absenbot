const chalk = require("chalk");
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { GROUP_ID_FILE } = require('../config/constants');
const { getAllUsers } = require('./database');
const { cekStatusHarian, getRiwayat, prosesLoginDanAbsen, getDashboardStats, getAnnouncements } = require('./magang');
const { generateAttendanceReport, processFreeTextToReport } = require('./aiService');
const { getDraft, setDraft, deleteDraft } = require('./previewService');
const { getAllowedGroups, isHoliday } = require('../config/holidays');
const { parseTagBasedReport } = require('../utils/messageUtils');

const { loadGroupSettings } = require('./groupSettings');
const { getMessage, updateMessage } = require('./messageService');
const { isSchedulerEnabled } = require('./botState');
const { generateWaveform } = require('../utils/generateWaveform');
const { ADMIN_NUMBERS } = require('../config/constants');
const { getPrayerTimes, getRandomContent } = require('./ramadanService');

// Config path
const SCHEDULE_CONFIG_FILE = path.join(__dirname, '../../data/scheduler_config.json');
const LAST_INFO_FILE = path.join(__dirname, '../../data/last_info_id.txt');

// Global state
let botSocket = null;
const activeCrons = new Map(); // Store running cron tasks: 'id_timezone' -> task
const ramadanCrons = new Map(); // Store dynamic Ramadan tasks for the day

function setBotSocket(sock) {
    botSocket = sock;
}

/**
 * Notify all admins
 */
async function notifyAdmins(text) {
    if (!botSocket || !ADMIN_NUMBERS || ADMIN_NUMBERS.length === 0) return;
    for (const admin of ADMIN_NUMBERS) {
        try {
            await botSocket.sendMessage(admin, { text: `🔔 *NOTIFIKASI ADMIN*\n\n${text}` });
        } catch (e) {
            console.error(`[SCHEDULER] Failed to notify admin ${admin}:`, e.message);
        }
    }
}

function getGroupId() {
    if (fs.existsSync(GROUP_ID_FILE)) {
        return fs.readFileSync(GROUP_ID_FILE, 'utf8').trim();
    }
    return null;
}

/**
 * Check for new Kemnaker Info (Announcements)
 */
async function runCheckInfo(sock) {
    console.log(chalk.blue('[SCHEDULER] Checking for new Kemnaker Info...'));
    try {
        // Use Akmal's account for checking
        const checkEmail = process.env.INFO_CHECK_EMAIL || 'akmaljie12355@gmail.com';
        const result = await getAnnouncements(checkEmail);

        if (result.success && result.data && result.data.length > 0) {
            // Sort by ID descending (newest first) just in case
            // The API usually returns newest first, but sorting ensures it.
            const announcements = result.data.sort((a, b) => b.id - a.id);
            const latest = announcements[0];
            const latestId = latest.id.toString();

            let lastId = '';
            if (fs.existsSync(LAST_INFO_FILE)) {
                lastId = fs.readFileSync(LAST_INFO_FILE, 'utf8').trim();
            }

            if (latestId !== lastId) {
                console.log(chalk.green(`[SCHEDULER] New info found! ID: ${latestId}`));

                // Save new ID
                fs.writeFileSync(LAST_INFO_FILE, latestId);

                // Broadcast to Group
                const groupID = getGroupId();
                if (groupID) {
                    const date = new Date(latest.updated_at).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric'
                    });

                    const message = `📢 *Info Kemnaker terbaru:*\n\n${latest.content}\n\n📅 ${date}`;

                    await sock.sendMessage(groupID, { text: message });
                } else {
                    console.log(chalk.yellow('[SCHEDULER] Group ID not found, cannot broadcast info.'));
                }
            } else {
                console.log(chalk.gray('[SCHEDULER] No new info.'));
            }
        }
    } catch (error) {
        console.error(chalk.red('[SCHEDULER] Error checking info:'), error.message);
    }
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
    const now = new Date();
    const tzString = now.toLocaleString("en-US", { timeZone: timezone });
    const tzDate = new Date(tzString);
    const dateStr = tzDate.toISOString().split('T')[0];
    const day = tzDate.getDay();

    // Check custom holidays
    if (config.holidays && config.holidays.length > 0) {
        if (config.holidays.includes(dateStr)) return true;
    }
    // Check weekend
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

/**
 * Helper to process an array of items in parallel with a concurrency limit
 */
async function parallelMap(items, mapper, limit = 3) {
    const results = [];
    const executing = [];
    for (const item of items) {
        const p = Promise.resolve().then(() => mapper(item, items));
        results.push(p);
        if (limit <= items.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

async function runEmergencyWarning(sock, task, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Emergency Warning: ${task.id} (${timezone})`));
    if (timezone !== 'Asia/Makassar') return; // Global logic
    if (isWeekendOrHoliday(timezone)) return;

    const now = new Date();
    const todayDate = now.getDate();
    const allUsers = getAllUsers();

    // Parallel check statuses
    const pendingCriticalUsers = (await parallelMap(allUsers, async (user) => {
        // Critical logic only for the critical-tagged task
        if (task.id === 'emergency_warning_critical') {
            const isCriticalDay =
                (user.cycle_day === 24 && todayDate === 23) ||
                (user.cycle_day === 16 && todayDate === 15);

            if (!isCriticalDay) return null;
        }

        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (!status.success || !status.sudahAbsen) return user;
        } catch (e) { }
        return null;
    }, 5)).filter(Boolean);

    if (pendingCriticalUsers.length > 0) {
        // 1. Notify in Group
        const groupId = getGroupId();
        if (groupId) {
            const mentionedText = pendingCriticalUsers.map(u => `@${u.phone.split('@')[0]}`).join(' ');
            const mentions = pendingCriticalUsers.map(u => u.phone);
            const warningMsg = `🚨 *PENGINGAT DEADLINE (DEADLINE 17:00)* 🚨\n\nHalo ${mentionedText}\n\nHari ini adalah batas akhir absen untuk periode Anda. Saya sudah mengirimkan *Draf Laporan* ke Chat Pribadi Anda.\n\nSilakan cek DM dan balas *ya* untuk mengirim. Jika sampai jam 16:30 tetap belum absen, saya akan mengirimkannya secara *OTOMATIS* demi mengamankan upah Anda.`;

            await sock.sendMessage(groupId, { text: warningMsg, mentions });
        }

        // 2. Prepare Draft and Notify via DM
        for (const user of pendingCriticalUsers) {
            try {
                let reportData = getDraft(user.phone);
                let source = "Draft Sebelumnya";

                if (!reportData) {
                    // Try Template
                    if (user.template) {
                        const parsed = parseTagBasedReport(user.template);
                        if (parsed) {
                            reportData = parsed;
                            source = "Template Anda";
                        } else {
                            const history = await getRiwayat(user.email, user.password, 3);
                            const res = await processFreeTextToReport(user.template, history.success ? history.logs : []);
                            if (res.success) {
                                reportData = { aktivitas: res.aktivitas, pembelajaran: res.pembelajaran, kendala: res.kendala };
                                source = "Template (AI Refined)";
                            }
                        }
                    }

                    // Fallback to AI from History
                    if (!reportData) {
                        const riwayatResult = await getRiwayat(user.email, user.password, 3);
                        const aiResult = await generateAttendanceReport(riwayatResult.success ? riwayatResult.logs : []);
                        if (aiResult.success) {
                            reportData = { aktivitas: aiResult.aktivitas, pembelajaran: aiResult.pembelajaran, kendala: aiResult.kendala };
                            source = "Generasi AI (Berdasarkan Riwayat)";
                        }
                    }
                }

                if (reportData) {
                    setDraft(user.phone, reportData);
                    const draftMsg = `🚨 *PERINGATAN DEADLINE (17:00)* 🚨\n\nHalo, Anda belum absen. Saya sudah menyiapkan draf laporan untuk Anda (${source}):\n\n*Aktivitas:* ${reportData.aktivitas}\n*Pembelajaran:* ${reportData.pembelajaran}\n*Kendala:* ${reportData.kendala}\n\nKetik *ya* untuk mengirim sekarang.\n\n⚠️ *PENTING:* Jika tidak ada balasan sampai jam 16:30, saya akan mengirimkan laporan di atas secara *OTOMATIS* ke server Kemnaker agar upah Anda tidak terpotong.`;
                    await sock.sendMessage(user.phone, { text: draftMsg });
                } else {
                    await sock.sendMessage(user.phone, {
                        text: `📢 *PENGINGAT DEADLINE*\n\nHalo, mohon segera lakukan absen manual sebelum jam 17:00 WITA. Jika tetap belum absen sampai jam 16:30, saya akan mencoba mengabsenkan otomatis.`
                    });
                }
                await new Promise(r => setTimeout(r, 3000));
            } catch (e) {
                console.error(`[EMERGENCY-WARNING] Error for ${user.email}:`, e.message);
            }
        }
    }
}

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
                        } catch (e) { }
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

    // 1. Identify Missing Users FIRST (Parallel check)
    const allUsers = getAllUsers();
    const pendingUsers = (await parallelMap(allUsers, async (user) => {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (!status.success || !status.sudahAbsen) {
                return user;
            }
        } catch (e) {
            console.error(`[SCHEDULER] Error checking status for ${user.email}:`, e.message);
        }
        return null;
    }, 5)).filter(Boolean);

    // 2. Logic: Send Group Message ONLY if there are pending users
    if (pendingUsers.length > 0) {
        const settings = loadGroupSettings();
        const enabledGroups = Object.entries(settings).filter(([_, c]) => {
            const groupTz = c.timezone || 'Asia/Makassar';
            return c.schedulerEnabled && groupTz === timezone && !shouldSkipGroup(c, timezone);
        });

        if (enabledGroups.length > 0) {
            for (const [groupId, _] of enabledGroups) {
                try {
                    // Filter users: Only tag if they are in this group
                    let groupPendingUsers = [];
                    try {
                        const metadata = await sock.groupMetadata(groupId);
                        const participantIds = metadata.participants.map(p => p.id);
                        groupPendingUsers = pendingUsers.filter(u => participantIds.includes(u.phone));
                    } catch (metaErr) {
                        console.warn(chalk.yellow(`[SCHEDULER] Failed to fetch metadata for ${groupId}: ${metaErr.message}`));
                        // Fallback: If we can't check, we skip tagging to avoid spamming wrong groups
                        continue;
                    }

                    if (groupPendingUsers.length === 0) {
                        // console.log(chalk.gray(`[SCHEDULER] No target users in group ${groupId}, skipping.`));
                        continue;
                    }

                    const mentions = groupPendingUsers.map(u => u.phone);
                    const mentionedText = groupPendingUsers.map(u => `@${u.phone.split('@')[0]}`).join(' ');

                    let messageText = getMessage('REMINDER_GROUP_TARGETED');
                    messageText = messageText.replace('{users}', mentionedText);

                    console.log(chalk.cyan(`[SCHEDULER] Sending targeted reminder to group ${groupId} (${groupPendingUsers.length} targets)`));
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
                await new Promise(r => setTimeout(r, 3000));
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
    await parallelMap(allUsers, async (user) => {
        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && status.sudahAbsen) return;

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
    }, 3); // Lower concurrency for AI to avoid rate limits
}

async function runEmergencySubmit(sock, task, timezone) {
    console.log(chalk.magenta(`[SCHEDULER] Running Emergency Submit: ${task.id} (${timezone})`));
    if (timezone !== 'Asia/Makassar') return; // Global logic
    if (isWeekendOrHoliday(timezone)) return;

    const now = new Date();
    const todayDate = now.getDate();
    const allUsers = getAllUsers();
    const isCriticalTask = task.id === 'emergency_submit_critical';

    // 1. Identify Phase (Parallel)
    const pendingCriticalUsers = (await parallelMap(allUsers, async (user) => {
        // Critical logic only for the critical-tagged task
        if (isCriticalTask) {
            const isCriticalDay =
                (user.cycle_day === 24 && todayDate === 23) ||
                (user.cycle_day === 16 && todayDate === 15);

            if (!isCriticalDay) return null;
        }

        try {
            const status = await cekStatusHarian(user.email, user.password);
            if (!status.success || !status.sudahAbsen) return user;
        } catch (e) { }
        return null;
    }, 5)).filter(Boolean);

    if (pendingCriticalUsers.length > 0) {
        console.log(chalk.yellow(`[CRITICAL] Found ${pendingCriticalUsers.length} users haven't attended!`));

        // Notify in Group
        const groupId = getGroupId();
        if (groupId) {
            const mentionedText = pendingCriticalUsers.map(u => `@${u.phone.split('@')[0]}`).join(' ');
            const mentions = pendingCriticalUsers.map(u => u.phone);

            let warningMsg = '';
            if (isCriticalTask) {
                warningMsg = `⚠️ *DEADLINE ABSENSI (JAM 17:00)* ⚠️\n\nHalo ${mentionedText}\n\nSistem mendeteksi Anda belum absen. Karena hari ini deadline pengolahan upah, *Bot akan melakukan absen otomatis sekarang* untuk mengamankan upah Anda.\n\n_Mohon jangan mengisi manual di web saat proses ini berjalan._`;
            } else {
                warningMsg = `⚠️ *DARURAT ABSENSI (HAMPIR JAM 00:00)* ⚠️\n\nHalo ${mentionedText}\n\nSistem mendeteksi Anda belum absen hari ini. *Bot sedang melakukan absen otomatis sekarang* agar Anda tidak alfa.\n\n_Mohon biarkan bot yang bekerja._`;
            }

            await sock.sendMessage(groupId, { text: warningMsg, mentions });
        }

        // Notify via DM and then Submit
        for (const user of pendingCriticalUsers) {
            try {
                let dmMsg = '';
                if (isCriticalTask) {
                    dmMsg = `🚨 *PERINGATAN DEADLINE*\n\nHari ini adalah batas akhir absen untuk periode Anda. Saya akan membantu melakukan absen otomatis sekarang agar upah Anda tidak terpotong.`;
                } else {
                    dmMsg = `🚨 *DARURAT ABSEN (BELUM ABSEN HARI INI)*\n\nHari ini hampir berganti, saya akan membantu melakukan absen otomatis sekarang agar Anda tidak alfa.`;
                }
                await sock.sendMessage(user.phone, { text: dmMsg });
                await new Promise(r => setTimeout(r, 3000));
            } catch (e) { }

            // The actual submit logic
            await executeAutoSubmit(sock, user);
        }
    }
}

/**
 * Extracted submit logic for reuse
 */
async function executeAutoSubmit(sock, user) {
    try {
        let finalReport = null;

        // 0. Priority: Memory Draft
        const memoryDraft = getDraft(user.phone);
        if (memoryDraft) {
            finalReport = {
                aktivitas: memoryDraft.aktivitas,
                pembelajaran: memoryDraft.pembelajaran,
                kendala: memoryDraft.kendala
            };
        }

        // 1. Template
        if (!finalReport && user.template) {
            const manualParsed = parseTagBasedReport(user.template);
            if (manualParsed) {
                finalReport = manualParsed;
            } else {
                const history = await getRiwayat(user.email, user.password, 3);
                const processResult = await processFreeTextToReport(user.template, history.success ? history.logs : []);
                if (processResult.success) {
                    finalReport = {
                        aktivitas: processResult.aktivitas,
                        pembelajaran: processResult.pembelajaran,
                        kendala: processResult.kendala
                    };
                }
            }
        }

        // 2. Fallback: AI
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
                const sourceMsg = user.template ? " (Menggunakan Template)" : " (Auto-AI)";
                let successMsg = getMessage('AUTO_SUBMIT_SUCCESS');

                if (successMsg) {
                    successMsg = successMsg.replace('{source}', sourceMsg)
                        .replace('{activity}', finalReport.aktivitas)
                        .replace('{pembelajaran}', finalReport.pembelajaran)
                        .replace('{kendala}', finalReport.kendala);
                    await sock.sendMessage(user.phone, { text: successMsg });
                }
                await notifyAdmins(`*Absen Otomatis Sukses*\n\nUser: ${user.name}\nEmail: ${user.email}\nSource: ${sourceMsg}`);
            } else {
                const failMsg = `❌ *AUTO-SUBMIT GAGAL*\n\nSistem mencoba mengirim laporan darurat namun gagal dengan alasan:\n_${submitResult.pesan}_\n\nSilakan coba submit manual.`;
                await sock.sendMessage(user.phone, { text: failMsg });
                await notifyAdmins(`*Absen Otomatis GAGAL*\n\nUser: ${user.name}\nEmail: ${user.email}\nAlasan: ${submitResult.pesan}`);
            }
        } else {
            await sock.sendMessage(user.phone, { text: `❌ *AUTO-SUBMIT GAGAL*\n\nSistem tidak dapat merangkai laporan darurat (Draft tidak ada, AI gagal, dan Template kosong).` });
            await notifyAdmins(`*Absen Otomatis GAGAL*\n\nUser: ${user.name}\nEmail: ${user.email}\nAlasan: Gagal generate laporan (AI Error/Fallback kosong).`);
        }
    } catch (e) {
        console.error(`[AUTO-SUBMIT] Error for ${user.email}:`, e.message);
        try {
            await sock.sendMessage(user.phone, { text: `❌ *AUTO-SUBMIT GAGAL*\n\nTerjadi kesalahan internal: ${e.message}` });
        } catch (err) { }
    }
}

async function runScheduledWebReports(sock, timezone) {
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

                // Notify Admin
                await notifyAdmins(`*Web Report Terjadwal Berhasil*\n\nUser: ${user.name} (${user.email})\n\n*Aktivitas:* ${report.aktivitas}\n*Pembelajaran:* ${report.pembelajaran}\n*Kendala:* ${report.kendala}`);
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
        else if (task.type === 'emergency_warning') runEmergencyWarning(sock, task, timezone);
        else console.warn(chalk.yellow(`[SCHEDULER] Unknown task type: ${task.type}`));

    }, { timezone: timezone });

    const key = `${task.id}_${timezone}`;
    activeCrons.set(key, job);
}

function reloadScheduler() {
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
    });

    // 2. Schedule Web App Reports (Always at 15:00 WITA)
    const webJob = cron.schedule('0 15 * * 1-5', () => {
        if (botSocket) runScheduledWebReports(botSocket, 'Asia/Makassar');
    }, { timezone: 'Asia/Makassar' });
    activeCrons.set('global_web_reports', webJob);

    // 3. Daily Info Kemnaker Check (07:00)
    const infoCheckJob = cron.schedule('0 7 * * *', () => {
        if (botSocket) runCheckInfo(botSocket);
    }, { timezone: 'Asia/Makassar' });
    activeCrons.set('global_info_check', infoCheckJob);

    console.log(chalk.cyan(`[SCHEDULER] ${activeCrons.size} jobs initialized.`));

    // 4. Schedule Daily Ramadan Refresh (00:05 WITA)
    const ramadanJob = cron.schedule('5 0 * * *', () => {
        if (botSocket) scheduleRamadanForToday(botSocket);
    }, { timezone: 'Asia/Makassar' });
    activeCrons.set('global_ramadan_refresh', ramadanJob);

    // Initial run for today (if bot starts mid-day)
    if (botSocket) scheduleRamadanForToday(botSocket);
}

/**
 * Helper to subtract minutes from HH:mm time
 */
function subtractMinutes(timeStr, mins) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m - mins, 0, 0);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function scheduleRamadanForToday(sock) {
    if (!sock) return;

    // Clear existing daily jobs
    for (const [key, job] of ramadanCrons.entries()) {
        job.stop();
        ramadanCrons.delete(key);
    }

    try {
        const settings = loadGroupSettings();
        const enabledGroups = Object.entries(settings).filter(([_, c]) => c.schedulerEnabled);

        // Map to store schedules per city to avoid redundant API calls
        const citySchedules = new Map();

        for (const [groupId, config] of enabledGroups) {
            // 1. Determine City for this group
            let groupCity = config.city; // If already set manually

            if (!groupCity) {
                // Try to infer from group name
                try {
                    const metadata = await sock.groupMetadata(groupId);
                    const groupName = metadata.subject.toLowerCase();

                    // Simple inference (can be expanded)
                    if (groupName.includes('jakarta')) groupCity = 'Jakarta';
                    else if (groupName.includes('bandung')) groupCity = 'Bandung';
                    else if (groupName.includes('surabaya')) groupCity = 'Surabaya';
                    else if (groupName.includes('jogja')) groupCity = 'Yogyakarta';
                    else if (groupName.includes('makassar')) groupCity = 'Makassar';
                    else if (groupName.includes('bali')) groupCity = 'Denpasar';
                    else if (groupName.includes('medan')) groupCity = 'Medan';
                } catch (e) {
                    console.warn(`[RAMADAN] Could not fetch metadata for ${groupId}, using timezone fallback.`);
                }
            }

            // 2. Fallback to Timezone default cities
            if (!groupCity) {
                const tz = config.timezone || 'Asia/Makassar';
                if (tz === 'Asia/Jakarta') groupCity = 'Jakarta';
                else if (tz === 'Asia/Jayapura') groupCity = 'Jayapura';
                else groupCity = 'Makassar';
            }

            // 3. Get or Fetch Prayer Times
            if (!citySchedules.has(groupCity)) {
                const res = await getPrayerTimes(groupCity);
                if (res.success) {
                    citySchedules.set(groupCity, res);
                } else {
                    console.error(`[RAMADAN] Failed to fetch for city: ${groupCity}`);
                    continue;
                }
            }

            const scheduleData = citySchedules.get(groupCity);
            const t = scheduleData.timings;
            const timezone = config.timezone || 'Asia/Makassar';

            const tasks = [
                { name: `Sahur_${groupId}`, time: '03:00', msg: '🥣 *Waktunya Sahur!* Jangan lupa makan dan niat ya.' },
                { name: `Imsak_${groupId}`, time: t.Imsak, msg: '⚠️ *Waktu Imsak!* Segera selesaikan makan sahur Anda. 10 menit lagi Subuh.' },
                { name: `Subuh_${groupId}`, time: t.Fajr, msg: `🕌 *Waktu Subuh* telah tiba untuk wilayah *${groupCity}* and sekitarnya.` },
                { name: `Pre-Dzuhur_${groupId}`, time: subtractMinutes(t.Dhuhr, 10), msg: '🔔 *10 Menit lagi Dzuhur.* Bersiap untuk sholat ya!' },
                { name: `Dzuhur_${groupId}`, time: t.Dhuhr, msg: '☀️ *Waktu Dzuhur* telah tiba. Selamat menunaikan ibadah sholat.' },
                { name: `Pre-Ashar_${groupId}`, time: subtractMinutes(t.Asr, 10), msg: '🔔 *10 Menit lagi Ashar.* Yuk selesaikan pekerjaan sejenak.' },
                { name: `Ashar_${groupId}`, time: t.Asr, msg: '🌤️ *Waktu Ashar* telah tiba. Rehat sejenak untuk sholat.' },
                { name: `Pre-Maghrib_${groupId}`, time: subtractMinutes(t.Maghrib, 10), msg: '🌅 *10 Menit lagi Buka Puasa!* Siapkan hidangan dan perbanyak doa. ✨' },
                { name: `Maghrib_${groupId}`, time: t.Maghrib, msg: '🌇 *Alhamdulillah Maghrib!* Selamat Berbuka Puasa. 🍵' },
                { name: `Pre-Isya_${groupId}`, time: subtractMinutes(t.Isha, 10), msg: '🔔 *10 Menit lagi Isya.* Bersiap untuk sholat dan Tarawih.' },
                { name: `Isya_${groupId}`, time: t.Isha, msg: '🌙 *Waktu Isya* telah tiba. Jangan lupa Tarawih ya! 🤲' }
            ];

            tasks.forEach(task => {
                const [h, m] = task.time.split(':');
                const cronTime = `${m} ${h} * * *`;

                const job = cron.schedule(cronTime, async () => {
                    console.log(chalk.cyan(`[RAMADAN] Running ${task.name} for group ${groupId}`));

                    let finalMsg = task.msg;
                    if (task.name.startsWith('Sahur') || task.name.startsWith('Maghrib')) {
                        const contentRes = await getRandomContent();
                        if (contentRes.success) {
                            const c = contentRes.content;
                            finalMsg += contentRes.type === 'ayat'
                                ? `\n\n📖 *QS. ${c.surah}: ${c.ayat}*\n"${c.terjemahan}"`
                                : `\n\n📜 *Hadits Riwayat ${c.perawi}*\n"${c.terjemahan}"`;
                        }
                    }

                    try {
                        await sock.sendMessage(groupId, { text: finalMsg });
                    } catch (e) { }
                }, { timezone: timezone });

                ramadanCrons.set(task.name, job);
            });
        }

        console.log(chalk.magenta(`[RAMADAN] ${citySchedules.size} cities | ${enabledGroups.length} groups`));

    } catch (e) {
        console.error(chalk.red('[RAMADAN] Error scheduling:'), e.message);
    }
}


function initScheduler(sock) {
    setBotSocket(sock);
    reloadScheduler();

    // Auto-retry pending web reports on startup
    runScheduledWebReports(sock, 'Asia/Makassar');
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
    runScheduledWebReports,
    // Exports for compatibility if needed elsewhere
    runMorningReminder: async (sock) => runTestScheduler(sock, 'morning_reminder'),
    runAfternoonReminder: async (sock) => runTestScheduler(sock, 'afternoon_reminder'),
    runAutoReminder: async (sock, japri) => runTestScheduler(sock, japri ? 'evening_reminder_2' : 'evening_reminder_1'),
    runEmergencyAutoSubmit: async (sock) => runTestScheduler(sock, 'emergency_submit')
};
