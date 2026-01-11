const express = require('express');
const router = express.Router();
const { processFreeTextToReport } = require('../services/aiService');
const { getUserByPhone } = require('../services/database');
const { getRiwayat, prosesLoginDanAbsen } = require('../services/magang');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

// WEB PUSH CONFIGURATION
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@monev-absenbot.my.id',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

const SCHEDULED_REPORTS_FILE = path.join(__dirname, '../../data/scheduled_reports.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, '../../data/push_subscriptions.json');

// Ensure data files exist
if (!fs.existsSync(path.dirname(SCHEDULED_REPORTS_FILE))) {
    fs.mkdirSync(path.dirname(SCHEDULED_REPORTS_FILE), { recursive: true });
}
if (!fs.existsSync(SCHEDULED_REPORTS_FILE)) {
    fs.writeFileSync(SCHEDULED_REPORTS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({}));
}

// Helper: Send Notification
const sendNotification = async (phone, title, body) => {
    try {
        const subsData = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
        const userSub = subsData[phone];
        
        if (userSub) {
            await webpush.sendNotification(userSub, JSON.stringify({ title, body, icon: '/pwa-192x192.png' }));
            return true;
        }
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
    return false;
};

/**
 * API: Generate AI Report from Story
 */
router.post('/api/generate-ai', async (req, res) => {
    try {
        const { phone, story } = req.body;
        if (!phone || !story) return res.status(400).json({ error: 'Nomor WA dan cerita wajib diisi' });

        const user = getUserByPhone(phone);
        if (!user) return res.status(404).json({ error: 'Nomor WhatsApp belum terdaftar di sistem bot.' });

        // Get history to provide context to AI
        const riwayatResult = await getRiwayat(user.email, user.password, 5);
        const history = riwayatResult.success ? riwayatResult.logs : [];

        // Generate report
        const aiResult = await processFreeTextToReport(story, history);

        if (aiResult.success) {
            res.json({
                success: true,
                aktivitas: aiResult.aktivitas,
                pembelajaran: aiResult.pembelajaran,
                kendala: aiResult.kendala
            });
        } else {
            res.status(500).json({ error: 'Gagal generate AI: ' + aiResult.message });
        }
    } catch (e) {
        console.error('AI Generate Route Error:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * API: Get VAPID Public Key
 */
router.get('/api/vapid-public-key', (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) {
        return res.status(500).json({ error: 'VAPID keys not configured' });
    }
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

/**
 * API: Subscribe to Push Notifications
 */
router.post('/api/subscribe', (req, res) => {
    const { phone, subscription } = req.body;
    if (!phone || !subscription) return res.status(400).json({ error: 'Data incomplete' });

    try {
        const subsData = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
        subsData[phone] = subscription;
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subsData, null, 2));
        
        res.json({ success: true });
        
        // Send test notification
        sendNotification(phone, 'Notifikasi Aktif! 🔔', 'Anda akan menerima update status absensi di sini.');
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * API: Submit report directly
 */
router.post('/api/submit', async (req, res) => {
    try {
        const { phone, aktivitas, pembelajaran, kendala } = req.body;
        
        // ... (validation logic) ...
        if (!phone || !aktivitas || !pembelajaran || !kendala) {
            return res.status(400).json({ error: 'Data tidak lengkap' });
        }

        const user = getUserByPhone(phone);
        if (!user) {
            return res.status(404).json({ error: 'Nomor WhatsApp belum terdaftar di sistem bot.' });
        }

        const result = await prosesLoginDanAbsen({
            email: user.email,
            password: user.password,
            aktivitas,
            pembelajaran,
            kendala
        });

        if (result.success) {
            res.json({ success: true, message: 'Laporan berhasil dikirim ke MagangHub!' });
            // Send Push Notification
            sendNotification(phone, 'Absensi Berhasil! ✅', 'Laporan Anda telah terkirim ke MagangHub.');
        } else {
            res.status(500).json({ error: result.pesan || 'Gagal mengirim laporan.' });
            sendNotification(phone, 'Absensi Gagal ❌', result.pesan || 'Terjadi kesalahan saat mengirim laporan.');
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ... (keep existing schedule endpoint) ...

router.post('/api/schedule', async (req, res) => {
    try {
        const { phone, aktivitas, pembelajaran, kendala, enabled } = req.body;
        
        if (!phone) {
            return res.status(400).json({ error: 'Nomor WA wajib diisi' });
        }

        const scheduled = JSON.parse(fs.readFileSync(SCHEDULED_REPORTS_FILE));
        const today = new Date().toISOString().split('T')[0];
        const existingIndex = scheduled.findIndex(s => s.phone === phone && s.date === today);

        // If disabling
        if (enabled === false) {
            if (existingIndex > -1) {
                scheduled.splice(existingIndex, 1);
                fs.writeFileSync(SCHEDULED_REPORTS_FILE, JSON.stringify(scheduled, null, 2));
            }
            return res.json({ success: true, message: 'Jadwal otomatis dibatalkan' });
        }

        // If enabling/updating
        if (!aktivitas || !pembelajaran || !kendala) {
            return res.status(400).json({ error: 'Lengkapi laporan sebelum mengaktifkan jadwal' });
        }
        
        const reportData = {
            phone,
            date: today,
            aktivitas,
            pembelajaran,
            kendala,
            status: 'pending',
            scheduledTime: '16:00',
            createdAt: new Date().toISOString()
        };

        if (existingIndex > -1) {
            scheduled[existingIndex] = reportData;
        } else {
            scheduled.push(reportData);
        }

        fs.writeFileSync(SCHEDULED_REPORTS_FILE, JSON.stringify(scheduled, null, 2));
        res.json({ success: true, message: 'Jadwal otomatis diaktifkan (Jam 16:00)' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
