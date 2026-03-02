/**
 * Dashboard Routes
 * API endpoints and page routes for admin dashboard
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { getAllUsers, deleteUser, getUserByPhone } = require('../services/database');
const { cekStatusHarian, getRiwayat } = require('../services/magang');
const { generateAuthUrl } = require('../services/secureAuth');
const { getMessage, loadMessages, updateMessage } = require('../services/messageService');
const { addHoliday, removeHoliday, getAllHolidays, isHoliday, getAllowedGroups } = require('../config/holidays');
const { log, getLogs, getStats, LOG_TYPES } = require('../services/activityLogger');
const botState = require('../services/botState');
const { processFreeTextToReport } = require('../services/aiService');
const { 
    loadSchedules, addSchedule, updateSchedule, deleteSchedule, runTestScheduler 
} = require('../services/scheduler');
const { generateWaveform } = require('../utils/generateWaveform');

// Dashboard client path
const clientDistPath = path.join(__dirname, '../../client/dist/index.html');
// Store bot socket reference (only socket is local, state is in botState.js)
let botSocket = null;

const crypto = require('crypto');

// Dashboard password from env
let DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

if (!DASHBOARD_PASSWORD) {
    // Generate random secure password if not set
    DASHBOARD_PASSWORD = crypto.randomBytes(4).toString('hex');
    console.log(chalk.bgRed.white.bold('\n[SECURITY WARNING] DASHBOARD_PASSWORD not set in .env'));
    console.log(chalk.yellow(`Using temporary random password: `) + chalk.green.bold(DASHBOARD_PASSWORD));
    console.log(chalk.yellow('Please set DASHBOARD_PASSWORD in your .env file for persistence.\n'));
}

// ========================================
// EXTERNAL API (No Auth or Secret Auth)
// ========================================

// Endpoint for standalone auth server to notify success
router.post('/api/external/auth-success', express.json(), async (req, res) => {
    const { phone, email, secret } = req.body;
    
    // Simple secret check
    if (secret !== process.env.DASHBOARD_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!phone) return res.status(400).json({ error: 'Phone required' });

    console.log(chalk.green(`[EXTERNAL-AUTH] Received success notification for ${phone}`));

    if (botSocket) {
        try {
            const { getMessage } = require('../services/messageService');
            const { normalizeToStandard } = require('../utils/messageUtils');
            const senderNumber = normalizeToStandard(phone);
            
            await botSocket.sendMessage(senderNumber, { 
                text: getMessage('!daftar_success', senderNumber) 
            });
            console.log(chalk.green(`[EXTERNAL-AUTH] Success message sent to ${phone}`));
        } catch (e) {
            console.error(`[EXTERNAL-AUTH] Failed to send message:`, e.message);
        }
    }

    res.json({ success: true });
});

// ========================================
// MIDDLEWARE
// ========================================

function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    
    // Allow API calls to return 401 instead of redirect (better for React frontend)
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Redirect normal page loads to login
    return res.redirect('/dashboard/login');
}

// ========================================
// PAGE ROUTES
// ========================================

// Login page
// Login page (Handled by React)
// router.get('/login', ... removed);

// Login action
router.post('/login', express.json(), (req, res) => {
    const { password } = req.body;

    if (password === DASHBOARD_PASSWORD) {
        req.session.authenticated = true;
        // Force session save before sending response
        req.session.save((err) => {
            if (err) {
                console.error(chalk.red('[SESSION] Error saving session:'), err);
                return res.status(500).json({ error: 'Gagal menyimpan session' });
            }
            log(LOG_TYPES.AUTH, 'Admin logged in to dashboard');
            return res.json({ success: true });
        });
        return;
    }

    log(LOG_TYPES.WARNING, 'Failed login attempt to dashboard');
    return res.status(401).json({ error: 'Password salah' });
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    log(LOG_TYPES.AUTH, 'Admin logged out from dashboard');
    res.redirect('/dashboard/login');
});

// Main dashboard (protected)
// Main dashboard & SPA routes (Handled by catch-all at end)
// router.get('/', ... removed);
// router.get(spaRoutes, ... removed);

// ========================================
// API ROUTES
// ========================================

// Get dashboard stats
router.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const users = getAllUsers();
        const holidays = getAllHolidays();
        const groups = getAllowedGroups();
        const logStats = getStats();

        // Check today's attendance status for all users
        // Check today's attendance status for all users
        // DISABLED: Real-time checking causes excessive spam/load on the target server
        // TODO: Implement a caching mechanism or read from a local daily status file
        let absenToday = 0; // Placeholder
        let pendingToday = users.length; // Placeholder

        /* 
        for (const user of users) {
            try {
                const status = await cekStatusHarian(user.email, user.password);
                if (status.success && status.sudahAbsen) {
                    absenToday++;
                } else {
                    pendingToday++;
                }
            } catch (e) {
                pendingToday++;
            }
        }
        */

        res.json({
            users: {
                total: users.length,
                absenToday,
                pendingToday
            },
            holidays: {
                total: holidays.length,
                todayIsHoliday: isHoliday()
            },
            groups: {
                total: groups.length
            },
            bot: {
                connected: botState.isBotConnected(),
                schedulerEnabled: botState.isSchedulerEnabled(),
                status: botState.getBotStatus()
            },
            logs: logStats
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all users
router.get('/api/users', requireAuth, (req, res) => {
    const users = getAllUsers().map(u => ({
        phone: u.phone,
        email: u.email,
        registeredAt: u.registeredAt,
        lastLogin: u.lastLogin
    }));
    res.json(users);
});

// Delete user
router.delete('/api/users/:phone', requireAuth, (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
    const deleted = deleteUser(phone);

    if (deleted) {
        log(LOG_TYPES.INFO, `User ${phone} deleted via dashboard`);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// Check user status
router.post('/api/users/:phone/check', requireAuth, async (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
    const user = getUserByPhone(phone);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    try {
        const status = await cekStatusHarian(user.email, user.password);
        log(LOG_TYPES.INFO, `Status check for ${user.email}: ${status.sudahAbsen ? 'sudah absen' : 'belum absen'}`);
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get user history
router.get('/api/users/:phone/history', requireAuth, async (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
    const days = parseInt(req.query.days) || 7;
    const user = getUserByPhone(phone);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    try {
        const history = await getRiwayat(user.email, user.password, days);
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');

// Configure Multer for VN Uploads (Temp storage)
const mediaDir = path.join(__dirname, '../../data/media/morning');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, mediaDir);
    },
    filename: function (req, file, cb) {
        // Save as temp file first
        cb(null, `temp_${Date.now()}_${file.originalname}`);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed!'));
        }
    }
});

// --- SCHEDULER VN ROUTES ---

// 1. Get VN Playlist Status
router.get('/api/scheduler/vn/status', requireAuth, (req, res) => {
    try {
        const files = fs.readdirSync(mediaDir)
            .filter(f => f.endsWith('.opus') || f.endsWith('.mp3')) // Support both for now
            .map(f => {
                const stat = fs.statSync(path.join(mediaDir, f));
                return {
                    name: f,
                    created: stat.mtime,
                    size: stat.size
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));

        res.json({ files });
    } catch (e) {
        console.error('[API] Error listing VN files:', e);
        res.json({ files: [] });
    }
});

// 2. Upload VN (Auto Convert to OPUS)
router.post('/api/scheduler/upload-vn', requireAuth, upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const inputPath = req.file.path;
    const outputFilename = `vn_${Date.now()}.opus`;
    const outputPath = path.join(mediaDir, outputFilename);

    // Convert to OPUS for WhatsApp compatibility (Strict Settings)
    ffmpeg(inputPath)
        .audioCodec('libopus')
        .format('ogg')
        .audioChannels(1) // WhatsApp PTT must be Mono
        .audioBitrate('32k') // Standard bitrate for WA Voice Notes
        .outputOptions(['-map_metadata -1', '-application voip']) // Strip metadata and optimize for voice
        .on('error', (err) => {
            console.error('[FFMPEG] Conversion Error:', err);
            // Cleanup temp file
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            res.status(500).json({ error: 'Conversion failed: ' + err.message });
        })
        .on('end', () => {
            console.log('[FFMPEG] Conversion finished:', outputFilename);
            // Cleanup temp file
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            
            log(LOG_TYPES.SCHEDULER, `New VN added (Converted to OPUS): ${outputFilename}`);
            res.json({ success: true, message: 'Voice Note added!', filename: outputFilename });
        })
        .save(outputPath);
});

// 3. Delete VN
router.delete('/api/scheduler/vn/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('..') || (!filename.endsWith('.mp3') && !filename.endsWith('.opus'))) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const vnPath = path.join(mediaDir, filename);
    if (fs.existsSync(vnPath)) {
        fs.unlinkSync(vnPath);
        log(LOG_TYPES.SCHEDULER, `VN deleted: ${filename}`);
        res.json({ success: true, message: 'Voice Note removed.' });
    } else {
        res.status(404).json({ error: 'File not found.' });
    }
});

// 4. Play/Stream VN
router.get('/api/scheduler/vn/play/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const vnPath = path.join(mediaDir, filename);
    if (fs.existsSync(vnPath)) {
        res.sendFile(vnPath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// 5. Test Send VN
router.post('/api/scheduler/vn/test-send', requireAuth, express.json(), async (req, res) => {
    const { filename, phone } = req.body;

    if (!filename || !phone) return res.status(400).json({ error: 'Data required' });
    if (!botSocket) return res.status(503).json({ error: 'Bot not connected' });

    const vnPath = path.join(mediaDir, filename);
    if (!fs.existsSync(vnPath)) return res.status(404).json({ error: 'File not found' });

    try {
        let jid = phone;
        if (!jid.includes('@')) jid = jid.replace(/\D/g, '') + '@s.whatsapp.net';

        // Detect mimetype based on extension
        const isOpus = filename.endsWith('.opus');
        const mimetype = isOpus ? 'audio/ogg; codecs=opus' : 'audio/mpeg';

        // Read file as buffer for reliability
        const fileBuffer = fs.readFileSync(vnPath);
        
        // Generate waveform for visual effect
        let waveform = new Uint8Array(64); // Fallback empty
        try {
            const wfBuffer = await generateWaveform(vnPath);
            // Use pure Uint8Array (Standard for Baileys)
            waveform = new Uint8Array(wfBuffer.buffer, wfBuffer.byteOffset, wfBuffer.length);
            console.log(`[Waveform] Generated for ${filename}, Length: ${waveform.length}`);
        } catch (wfErr) {
            console.error('[Waveform] Failed to generate:', wfErr);
        }

        await botSocket.sendMessage(jid, { 
            audio: fileBuffer, 
            mimetype: mimetype, 
            ptt: true,
            fileName: filename,
            waveform: waveform // Send Uint8Array
        });

        log(LOG_TYPES.SCHEDULER, `Test VN sent to ${phone}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get scheduler status
router.get('/api/scheduler', requireAuth, (req, res) => {
    res.json({
        enabled: botState.isSchedulerEnabled(),
        timezone: 'Multi-timezone (WIB/WITA/WIT)',
        schedules: loadSchedules(),
        messages: loadMessages() // Include messages lookup
    });
});

// Add new schedule
router.post('/api/scheduler', requireAuth, express.json(), (req, res) => {
    const { time, type, messageKey, description, days, customContent } = req.body;
    
    if (!time || !type) {
        return res.status(400).json({ error: 'Time and Type are required' });
    }

    const newSchedule = {
        id: `sched_${Date.now()}`,
        time,
        days: days || '1-5',
        type,
        messageKey: messageKey || '',
        description: description || 'New Schedule',
        enabled: true
    };

    addSchedule(newSchedule, customContent);
    log(LOG_TYPES.SCHEDULER, `New schedule added: ${newSchedule.id}`);
    res.json({ success: true, schedule: newSchedule });
});

// Update schedule
router.put('/api/scheduler/:id', requireAuth, express.json(), (req, res) => {
    const { id } = req.params;
    const { customContent, ...updates } = req.body;
    
    const updated = updateSchedule(id, updates, customContent);
    if (updated) {
        log(LOG_TYPES.SCHEDULER, `Schedule updated: ${id}`);
        res.json({ success: true, schedule: updated });
    } else {
        res.status(404).json({ error: 'Schedule not found' });
    }
});

// Delete schedule
router.delete('/api/scheduler/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const deleted = deleteSchedule(id);
    
    if (deleted) {
        log(LOG_TYPES.SCHEDULER, `Schedule deleted: ${id}`);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Schedule not found' });
    }
});

// Toggle scheduler global switch
router.post('/api/scheduler/toggle', requireAuth, (req, res) => {
    const current = botState.isSchedulerEnabled();
    botState.setSchedulerEnabled(!current);
    const newState = botState.isSchedulerEnabled();
    log(LOG_TYPES.SCHEDULER, `Scheduler ${newState ? 'enabled' : 'disabled'} via dashboard`);
    res.json({ enabled: newState });
});

// Manual trigger scheduler
router.post('/api/scheduler/trigger/:type', requireAuth, async (req, res) => {
    const { type } = req.params; // This 'type' is actually the schedule ID now

    if (!botSocket) {
        return res.status(503).json({ error: 'Bot not connected' });
    }

    try {
        const result = await runTestScheduler(botSocket, type);
        
        if (result.success) {
            log(LOG_TYPES.SCHEDULER, `Manual trigger: ${type} via dashboard`);
            res.json({ success: true, triggered: type });
        } else {
            res.status(404).json({ error: result.message });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get holidays
router.get('/api/holidays', requireAuth, (req, res) => {
    res.json(getAllHolidays());
});

// Add holiday
router.post('/api/holidays', requireAuth, express.json(), (req, res) => {
    const { date } = req.body;
    if (!date) {
        return res.status(400).json({ error: 'Date required' });
    }

    const added = addHoliday(date);
    log(LOG_TYPES.INFO, `Holiday ${date} ${added ? 'added' : 'already exists'} via dashboard`);
    res.json({ success: added, holidays: getAllHolidays() });
});

// Delete holiday
router.delete('/api/holidays/:date', requireAuth, (req, res) => {
    const date = req.params.date;
    const removed = removeHoliday(date);
    log(LOG_TYPES.INFO, `Holiday ${date} ${removed ? 'removed' : 'not found'} via dashboard`);
    res.json({ success: removed, holidays: getAllHolidays() });
});

// NEW: Batch Check All Users
router.post('/api/users/check-all', requireAuth, async (req, res) => {
    // Return immediately to avoid timeout
    res.json({ success: true, message: 'Batch check started in background' });

    const users = getAllUsers();
    log(LOG_TYPES.INFO, `Batch check started for ${users.length} users`);

    // Process in background
    (async () => {
        let count = 0;
        for (const user of users) {
            try {
                // 2 second delay to avoid rate limits
                await new Promise(r => setTimeout(r, 2000));

                const status = await cekStatusHarian(user.email, user.password);
                log(LOG_TYPES.INFO, `[Batch] ${user.email}: ${status.sudahAbsen ? 'Done' : 'Pending'}`);
                count++;
            } catch (e) {
                log(LOG_TYPES.ERROR, `[Batch] Error checking ${user.email}: ${e.message}`);
            }
        }
        log(LOG_TYPES.SUCCESS, `Batch check finished. Processed ${count}/${users.length} users`);
    })();
});

// ========================================
// TERMINAL SHELL (Legacy / Fallback)
// ========================================
// WebSocket implementation is now handled in secureAuth.js

// ========================================
// BOT STATUS CONTROL
// ========================================

// Get bot status (consolidated - includes all status info)
router.get('/api/bot/status', requireAuth, (req, res) => {
    const { getCommandKeys } = require('../commands');
    res.json({
        status: botState.getBotStatus(),
        connected: botState.isBotConnected(),
        schedulerEnabled: botState.isSchedulerEnabled(),
        maintenanceCommands: botState.getMaintenanceCommands(),
        availableCommands: getCommandKeys()
    });
});

// Set bot status
router.post('/api/bot/status', requireAuth, express.json(), (req, res) => {
    const { status } = req.body;
    if (!['online', 'offline', 'maintenance'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: online, offline, or maintenance' });
    }
    botState.setBotStatus(status);
    log(LOG_TYPES.WARNING, `Bot status changed to: ${status.toUpperCase()}`);
    res.json({ success: true, status: botState.getBotStatus() });
});

// Restart Bot Process
router.post('/api/bot/restart', requireAuth, (req, res) => {
    log(LOG_TYPES.WARNING, 'Bot restart triggered via dashboard');
    res.json({ success: true, message: 'Bot sedang restart...' });
    
    // Use PM2 to restart itself after a short delay
    setTimeout(() => {
        const { exec } = require('child_process');
        exec('pm2 restart absenbot', (err) => {
            if (err) console.error('[DASHBOARD] Failed to restart via PM2:', err);
        });
    }, 1000);
});

// Reset WhatsApp Session (Logout)
router.post('/api/bot/reset-session', requireAuth, (req, res) => {
    log(LOG_TYPES.DANGER, 'WhatsApp session reset triggered via dashboard!');
    res.json({ success: true, message: 'Sesi dihapus. Bot akan restart untuk pairing baru.' });

    setTimeout(() => {
        const { AUTH_STATE_DIR } = require('../config/constants');
        try {
            // Delete the session directory
            if (fs.existsSync(AUTH_STATE_DIR)) {
                // Use rmSync with recursive and force
                fs.rmSync(AUTH_STATE_DIR, { recursive: true, force: true });
                console.log(chalk.bgRed.white(' [SESSION] Session folder deleted via dashboard. '));
            }
            
            // Restart via PM2
            const { exec } = require('child_process');
            exec('pm2 restart absenbot', (err) => {
                if (err) console.error('[DASHBOARD] Failed to restart after session reset:', err);
            });
        } catch (e) {
            console.error('[DASHBOARD] Error during session reset:', e.message);
        }
    }, 1000);
});

// Toggle Specific Command Maintenance
router.post('/api/bot/command-maintenance', requireAuth, express.json(), (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Command name required' });
    }
    botState.toggleCommandMaintenance(command);
    const isNowMaint = botState.isCommandUnderMaintenance(command);
    log(LOG_TYPES.WARNING, `Maintenance for !${command} is now ${isNowMaint ? 'ENABLED' : 'DISABLED'}`);
    res.json({ 
        success: true, 
        command, 
        isMaintenance: isNowMaint,
        maintenanceCommands: botState.getMaintenanceCommands()
    });
});

// Export getter for messageHandler (using botState)
module.exports.getBotStatus = () => botState.getBotStatus();


// ========================================
// GROUP SETTINGS ROUTES
// ========================================

const { loadGroupSettings, updateGroup, removeGroup: deleteGroupSettings } = require('../services/groupSettings');

// Get all groups with settings
router.get('/api/groups', requireAuth, (req, res) => {
    res.json(loadGroupSettings());
});

// Add/Update group
router.post('/api/groups', requireAuth, express.json(), (req, res) => {
    const { groupId, name, schedulerEnabled, isTesting, holidays, skipWeekends, timezone } = req.body;
    if (!groupId) {
        return res.status(400).json({ error: 'Group ID required' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (schedulerEnabled !== undefined) updates.schedulerEnabled = schedulerEnabled;
    if (isTesting !== undefined) updates.isTesting = isTesting;
    if (holidays !== undefined) updates.holidays = holidays;
    if (skipWeekends !== undefined) updates.skipWeekends = skipWeekends;
    if (timezone !== undefined) updates.timezone = timezone;

    const group = updateGroup(groupId, updates);
    log(LOG_TYPES.INFO, `Group ${groupId} updated via dashboard`);
    res.json({ success: true, group, groups: loadGroupSettings() });
});

// ... (existing Delete and Active Groups code)

// ========================================
// DEVELOPMENT / TESTING ROUTES
// ========================================

// Get all message templates
router.get('/api/messages', requireAuth, (req, res) => {
    res.json(loadMessages());
});

// Update a message template
router.post('/api/messages', requireAuth, express.json(), (req, res) => {
    const { key, content } = req.body;
    if (!key || !content) return res.status(400).json({ error: 'Key and Content required' });

    updateMessage(key, content);
    log(LOG_TYPES.WARNING, `Message template '${key}' updated by admin`);
    res.json({ success: true });
});

// Trigger Test Run (Only sends to Testing Groups)
router.post('/api/test/trigger', requireAuth, express.json(), async (req, res) => {
    const { type } = req.body; // 'morning', 'afternoon'

    if (!botSocket) return res.status(503).json({ error: 'Bot not connected' });

    const result = await runTestScheduler(botSocket, type);
    if (!result.success) {
        return res.status(400).json(result);
    }

    res.json({ success: true, count: result.count });
});

// Delete group
router.delete('/api/groups/:groupId', requireAuth, (req, res) => {
    const groupId = decodeURIComponent(req.params.groupId);
    const removed = deleteGroupSettings(groupId);
    log(LOG_TYPES.INFO, `Group ${groupId} ${removed ? 'removed' : 'not found'} via dashboard`);
    res.json({ success: removed, groups: loadGroupSettings() });
});

// ========================================
// ACTIVE GROUPS (FROM BAILEYS)
// ========================================

// Get all groups where bot is participating
router.get('/api/groups/active', requireAuth, async (req, res) => {
    console.log('[API] /api/groups/active called');

    if (!botSocket) {
        console.error('[API] Error: botSocket is null/undefined');
        return res.status(503).json({ error: 'Bot not connected (Socket is null)' });
    }

    try {
        console.log('[API] Check bot connection state...');
        // Optional: Check if socket is actually connected if possible
        // if (botSocket.ws.readyState !== 1) console.warn('[API] Warning: WS State is', botSocket.ws.readyState);

        console.log('[API] Fetching participating groups...');
        // Fetch all groups the bot is participating in
        const allGroups = await botSocket.groupFetchAllParticipating();
        console.log(`[API] Raw groups fetched: ${Object.keys(allGroups).length}`);

        // Transform to array with useful info
        const groups = Object.values(allGroups).map(g => ({
            id: g.id,
            name: g.subject,
            description: g.desc || '',
            owner: g.owner || 'Unknown',
            creation: g.creation ? new Date(g.creation * 1000).toLocaleDateString('id-ID') : 'Unknown',
            participantCount: g.participants?.length || 0,
            isAnnounce: g.announce || false, // Only admins can send
            isRestrict: g.restrict || false, // Only admins can edit info
        }));

        // Sort by name
        groups.sort((a, b) => a.name.localeCompare(b.name));
        console.log(`[API] Returning ${groups.length} groups to client`);

        res.json(groups);
    } catch (e) {
        console.error('[API] Error fetching groups:', e);
        res.status(500).json({ error: e.message });
    }
});

// Broadcast message
router.post('/api/broadcast', requireAuth, express.json(), async (req, res) => {
    const { message, target } = req.body; // target: 'all' | 'groups' | array of phones

    if (!message) {
        return res.status(400).json({ error: 'Message required' });
    }

    if (!botSocket) {
        return res.status(503).json({ error: 'Bot not connected' });
    }

    try {
        let sent = 0;
        let failed = 0;

        if (target === 'all' || !target) {
            const users = getAllUsers();
            for (const user of users) {
                try {
                    await botSocket.sendMessage(user.phone, { text: message });
                    sent++;
                    await new Promise(r => setTimeout(r, 500)); // Rate limit
                } catch (e) {
                    failed++;
                }
            }
        } else if (target === 'groups') {
            const groups = getAllowedGroups();
            for (const groupId of groups) {
                try {
                    await botSocket.sendMessage(groupId, { text: message });
                    sent++;
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    failed++;
                }
            }
        } else if (Array.isArray(target)) {
            for (const phone of target) {
                try {
                    await botSocket.sendMessage(phone, { text: message });
                    sent++;
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    failed++;
                }
            }
        }

        log(LOG_TYPES.INFO, `Broadcast sent: ${sent} success, ${failed} failed`);
        res.json({ success: true, sent, failed });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Stream activity logs (SSE)
router.get('/api/logs/stream', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const { onLog } = require('../services/activityLogger');

    // Send initial keep-alive
    res.write(': keep-alive\n\n');

    // Listener for new logs
    const listener = (log) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    };

    onLog(listener);

    req.on('close', () => {
        const { removeListener } = require('../services/activityLogger');
        removeListener(listener);
    });
});

// Get activity logs
router.get('/api/logs', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type || null;
    res.json(getLogs(limit, type));
});

// Bot status route moved to line 307 (consolidated)

// ========================================
// SOCKET INJECTION (called from app.js)
// ========================================

function setBotSocket(sock) {
    botSocket = sock;
}

function setBotConnected(connected) {
    botState.setBotConnected(connected);
    log(connected ? LOG_TYPES.SUCCESS : LOG_TYPES.WARNING,
        `WhatsApp ${connected ? 'connected' : 'disconnected'}`);
}

// SPA Catch-all (Must be last route before exports)
router.get(/(.*)/, (req, res) => {
    // Prevent caching of the index.html file
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Serve React App for any other GET request not handled above
    if (fs.existsSync(clientDistPath)) {
        res.sendFile(clientDistPath);
    } else {
        res.status(503).send(`
            <html>
            <head><title>Dashboard Not Built</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>⚠️ Dashboard Not Ready</h1>
                <p>React dashboard belum di-build.</p>
                <p>Jalankan: <code>cd client && npm install && npm run build</code></p>
                <p>Bot WhatsApp tetap berjalan normal.</p>
            </body>
            </html>
        `);
    }
});

// --- SYSTEM TEST ENDPOINTS ---

router.post('/api/test/simulation', requireAuth, async (req, res) => {
    try {
        const { email, aktivitas, pembelajaran, kendala } = req.body;

        const akt = aktivitas || 'Melakukan aktivitas testing dashboard';
        const plj = pembelajaran || 'Mempelajari cara kerja sistem testing';
        const knd = kendala || 'Tidak ada kendala berarti';

        // Format exactly like real bot draft_preview from messages.json
        const draftPreview = `*DRAF LAPORAN ANDA*\n\n*Aktivitas:* (${akt.length} karakter)\n${akt}\n\n*Pembelajaran:* (${plj.length} karakter)\n${plj}\n\n*Kendala:* (${knd.length} karakter)\n${knd}\n\n_Ketik *ya* untuk kirim._`;

        const successMessage = `✅ *BERHASIL!*\nLaporan Anda telah terkirim ke web MagangHub.\n\n_(Ini adalah simulasi, data tidak benar-benar dikirim)_`;

        res.json({
            success: true,
            message: successMessage,
            preview: draftPreview
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test AI Parsing (Groq) - Actually calls Groq API to test AI capability
router.post('/api/test/ai-parse', requireAuth, async (req, res) => {
    try {
        const { story } = req.body;

        if (!story || story.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Cerita terlalu pendek (minimal 10 karakter)'
            });
        }

        console.log('[TEST] AI Parse request:', story.substring(0, 50) + '...');

        // Call the actual Groq AI
        const result = await processFreeTextToReport(story, []);

        if (!result.success) {
            return res.json({
                success: false,
                message: result.error || 'AI gagal memproses cerita',
                preview: `❌ *AI PARSE FAILED*\n\nError: ${result.error}`
            });
        }

        // Format like real bot draft_preview
        const draftPreview = `*DRAF LAPORAN AI*

*Aktivitas:* (${result.aktivitas.length} karakter)
${result.aktivitas}

*Pembelajaran:* (${result.pembelajaran.length} karakter)
${result.pembelajaran}

*Kendala:* (${result.kendala.length} karakter)
${result.kendala}

_Diproses oleh Groq AI (llama-3.3-70b)_`;

        res.json({
            success: true,
            message: 'AI berhasil memproses cerita',
            preview: draftPreview,
            raw: result
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/api/test/check', requireAuth, async (req, res) => {
    try {
        const { email } = req.body; // Password typically not needed for just status check if session exists, but `cekStatusHarian` takes it for login retry
        // For security, maybe just use what's in DB if not provided, or Require password.
        // For now, let's assume the frontend sends what it has, or we look up the user.

        const user = getUserByPhone(email) || getAllUsers().find(u => u.email === email);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const result = await cekStatusHarian(user.email, user.password);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/api/test/riwayat', requireAuth, async (req, res) => {
    try {
        const { email } = req.body;
        const user = getUserByPhone(email) || getAllUsers().find(u => u.email === email);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const result = await getRiwayat(user.email, user.password, 3);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/api/test/gen-link', requireAuth, async (req, res) => {
    try {
        const { email } = req.body;
        const user = getUserByPhone(email) || getAllUsers().find(u => u.email === email);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Format exactly like real bot registration_link_private from messages.json
        const mockUrl = `https://monev-absenbot.my.id/auth/MOCK_${Date.now().toString(36)}`;
        const preview = `*PENDAFTARAN AKUN*

Pastikan Anda mendaftar menggunakan email dan password akun *Monev / SiapKerja* asli agar bot dapat melakukan absensi secara otomatis. Klik link di bawah ini untuk menghubungkan akun MagangHub kamu:

${mockUrl}

(Link ini aman tidak menyimpan password kamu, hanya menyimpan cookies login, hanya berlaku 10 menit)

_(Ini adalah simulasi, link tidak valid)_`;

        res.json({ success: true, url: mockUrl, preview });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/api/test/send-menu', requireAuth, async (req, res) => {
    try {
        const { email, simulation } = req.body;
        const user = getUserByPhone(email) || getAllUsers().find(u => u.email === email);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Return real menu format (no TEST prefix, pure simulation)
        const info = getMessage('!menu');

        // Always simulation mode - never send to WA
        res.json({
            success: true,
            message: 'Menu preview generated',
            preview: info
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// React Router Catch-All (Must be last)
router.use((req, res) => {
    if (fs.existsSync(clientDistPath)) {
        res.sendFile(clientDistPath);
    } else {
        res.status(404).send('Dashboard build not found. Run npm run build in client folder.');
    }
});

module.exports = router;
module.exports.setBotSocket = setBotSocket;
module.exports.setBotConnected = setBotConnected;
module.exports.isSchedulerEnabled = () => botState.isSchedulerEnabled();
module.exports.getBotStatus = () => botState.getBotStatus();
