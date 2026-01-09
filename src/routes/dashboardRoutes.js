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
const { getMessage } = require('../services/messageService');
const { addHoliday, removeHoliday, getAllHolidays, isHoliday, getAllowedGroups } = require('../config/holidays');
const { log, getLogs, getStats, LOG_TYPES } = require('../services/activityLogger');
const botState = require('../services/botState');
const { processFreeTextToReport } = require('../services/aiService'); // Note: remote renamed groqService to aiService

// Dashboard client path
const clientDistPath = path.join(__dirname, '../../client/dist/index.html');
// Store bot socket reference (only socket is local, state is in botState.js)
let botSocket = null;

// Dashboard password from env
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '123456';

// ========================================
// MIDDLEWARE
// ========================================

function requireAuth(req, res, next) {
    // BYPASS AUTHENTICATION (Requested by user to fix login loop issues)
    // console.log(chalk.yellow(`[AUTH-BYPASS] Allowing access to: ${req.path}`));
    return next();
    
    /* Original Auth Logic (Disabled)
    if (req.session && req.session.authenticated) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/dashboard/login');
    */
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

// Get scheduler status
router.get('/api/scheduler', requireAuth, (req, res) => {
    const schedules = [
        { time: '08:00', name: 'Morning Reminder', type: 'morning' },
        { time: '16:00', name: 'Markipul', type: 'afternoon' },
        { time: '21:00', name: 'Evening Reminder 1', type: 'evening1' },
        { time: '23:00', name: 'Evening Reminder 2', type: 'evening2' },
        { time: '23:50', name: 'Draft Push', type: 'draftpush' },
        { time: '23:59', name: 'Emergency Auto-Submit', type: 'emergency' }
    ];

    res.json({
        enabled: botState.isSchedulerEnabled(),
        timezone: 'Multi-timezone (WIB/WITA/WIT)',
        schedules
    });
});

// Toggle scheduler
router.post('/api/scheduler/toggle', requireAuth, (req, res) => {
    const current = botState.isSchedulerEnabled();
    botState.setSchedulerEnabled(!current);
    const newState = botState.isSchedulerEnabled();
    log(LOG_TYPES.SCHEDULER, `Scheduler ${newState ? 'enabled' : 'disabled'} via dashboard`);
    res.json({ enabled: newState });
});

// Manual trigger scheduler
router.post('/api/scheduler/trigger/:type', requireAuth, async (req, res) => {
    const { type } = req.params;

    if (!botSocket) {
        return res.status(503).json({ error: 'Bot not connected' });
    }

    try {
        const scheduler = require('../services/scheduler');

        switch (type) {
            case 'morning':
                await scheduler.runMorningReminder(botSocket);
                break;
            case 'afternoon':
                await scheduler.runAfternoonReminder(botSocket);
                break;
            case 'reminder':
                await scheduler.runAutoReminder(botSocket);
                break;
            case 'emergency':
                await scheduler.runEmergencyAutoSubmit(botSocket);
                break;
            default:
                return res.status(400).json({ error: 'Invalid trigger type' });
        }

        log(LOG_TYPES.SCHEDULER, `Manual trigger: ${type} via dashboard`);
        res.json({ success: true, triggered: type });
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
// BOT STATUS CONTROL
// ========================================

// Get bot status (consolidated - includes all status info)
router.get('/api/bot/status', requireAuth, (req, res) => {
    res.json({
        status: botState.getBotStatus(),
        connected: botState.isBotConnected(),
        schedulerEnabled: botState.isSchedulerEnabled(),
        absenMaintenance: botState.isAbsenMaintenance()
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

// Toggle Absen Maintenance
router.post('/api/bot/absen-maintenance', requireAuth, express.json(), (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Enabled must be boolean' });
    }
    botState.setAbsenMaintenance(enabled);
    log(LOG_TYPES.WARNING, `!absen Maintenance Mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    res.json({ success: true, enabled: botState.isAbsenMaintenance() });
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
    const { groupId, name, schedulerEnabled, isTesting, holidays, skipWeekends } = req.body;
    if (!groupId) {
        return res.status(400).json({ error: 'Group ID required' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (schedulerEnabled !== undefined) updates.schedulerEnabled = schedulerEnabled;
    if (isTesting !== undefined) updates.isTesting = isTesting;
    if (holidays !== undefined) updates.holidays = holidays;
    if (skipWeekends !== undefined) updates.skipWeekends = skipWeekends;

    const group = updateGroup(groupId, updates);
    log(LOG_TYPES.INFO, `Group ${groupId} updated via dashboard`);
    res.json({ success: true, group, groups: loadGroupSettings() });
});

// ... (existing Delete and Active Groups code)

// ========================================
// DEVELOPMENT / TESTING ROUTES
// ========================================

const { loadMessages, updateMessage } = require('../services/messageService');
const { runTestScheduler } = require('../services/scheduler');

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
        const info = getMessage('menu');

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
