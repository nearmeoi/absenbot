// FINAL USER SIMULATION - SCENARIO BASED TESTING
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');

// ==========================================
// 1. MOCKING EXTERNAL SERVICES (SAFETY FIRST)
// ==========================================

// Mock 'magang.js' to prevent REAL requests to Kemnaker
const magangPath = require.resolve('./src/services/magang.js');
require.cache[magangPath] = {
    id: magangPath,
    filename: magangPath,
    loaded: true,
    exports: {
        prosesLoginDanAbsen: async (data) => ({
            success: true,
            pesan: "✅ [MOCK] Berhasil Absen ke Kemnaker!"
        }),
        cekKredensial: async () => ({ success: true }),
        cekStatusHarian: async () => ({ success: true, sudahAbsen: false }),
        getRiwayat: async () => ({
            success: true,
            // Return dummy history for AI generation
            logs: [
                { date: '2026-01-01', activity_log: 'Membuat fitur login', lesson_learned: 'Belajar enkripsi password', obstacles: 'Tidak ada' },
                { date: '2026-01-02', activity_log: 'Deploy ke VPS', lesson_learned: 'Belajar Nginx dan PM2', obstacles: 'Koneksi lambat' }
            ]
        })
    }
};

// Mock 'groqService.js' (Optional: use real if you want, but fast mock is better for "testing flow")
// Let's use a SEMI-REAL mock that mimics the reliable output structure
const groqPath = require.resolve('./src/services/groqService.js');
require.cache[groqPath] = {
    id: groqPath,
    filename: groqPath,
    loaded: true,
    exports: {
        generateAttendanceReport: async () => ({
            success: true,
            aktivitas: "Melakukan pengembangan fitur login dan deploy server.",
            pembelajaran: "Memahami konsep keamanan dan manajemen server Linux.",
            kendala: "Koneksi internet sempat tidak stabil namun teratasi."
        }),
        processFreeTextToReport: async (text) => ({
            success: true,
            aktivitas: text + " (diperbaiki AI).",
            pembelajaran: "Belajar hal baru dari aktivitas tersebut.",
            kendala: "Tidak ada kendala berarti."
        }),
        transcribeAudio: async () => ({ success: true, text: "Laporan via suara (simulasi)" })
    }
};

// Load Real Modules
const messageHandler = require('./src/handlers/messageHandler');
const scheduler = require('./src/services/scheduler.js');
const { saveUser, deleteUser } = require('./src/services/database');
const { removeHoliday, removeAllowedGroup } = require('./src/config/holidays'); // Cleanup tools
const { ADMIN_NUMBERS } = require('./src/config/constants');

// Constants
const ADMIN_PHONE = '6285657025300@s.whatsapp.net'; // Must match .env
const USER_PHONE = '628111222333@s.whatsapp.net';
const GROUP_ID = '123456789@g.us';

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const mockSock = {
    sendMessage: async (jid, content, options) => {
        let display = "";
        if (content.text) display = content.text;
        else if (content.caption) display = `[IMAGE] ${content.caption}`;
        else if (content.react) display = `[REACT] ${content.react.text}`;
        else display = JSON.stringify(content);

        console.log(chalk.blue(`🤖 BOT -> ${jid.split('@')[0]}:`), display.split('\n')[0] + (display.split('\n').length > 1 ? '...' : ''));
        // Simulate delay for realism
        await new Promise(r => setTimeout(r, 100));
    },
    groupMetadata: async (jid) => ({
        participants: [{ id: USER_PHONE, phoneNumber: USER_PHONE }]
    })
};

async function userSays(text, isGroup = false, sender = USER_PHONE) {
    const jid = isGroup ? GROUP_ID : sender;
    const participant = isGroup ? sender : undefined;

    console.log(chalk.green(`👤 USER (${sender.split('@')[0]}) -> ${isGroup ? 'GROUP' : 'BOT'}:`), text);

    await messageHandler(mockSock, {
        key: { remoteJid: jid, fromMe: false, participant: participant },
        participant: participant,
        message: { conversation: text }
    });
    console.log(chalk.dim('─'.repeat(50)));
}

async function simulateVoiceNote(sender) {
    console.log(chalk.green(`👤 USER (${sender.split('@')[0]}) -> BOT:`), "[SENDING VOICE NOTE] 🎤");

    // Manually trigger the logic that checks for audioMessage
    // Since messageHandler logic checks `msgObj.message.audioMessage`
    await messageHandler(mockSock, {
        key: { remoteJid: sender, fromMe: false },
        message: {
            audioMessage: { seconds: 10 },
            // Emulate complex object structure required by Baileys download (mocked)
        }
    });
    console.log(chalk.dim('─'.repeat(50)));
}

// ==========================================
// 3. THE SIMULATION
// ==========================================

async function runSimulation() {
    console.log(chalk.bold.magenta('\n🚀 STARTING FINAL USER ACCEPTANCE TEST SIMULATION 🚀\n'));

    // Setup
    saveUser(USER_PHONE, 'user@simulation.com', 'password123'); // Ensure user exists

    // --- SCENARIO 1: DAILY ATTENDANCE (ZERO INPUT) ---
    console.log(chalk.yellow.bold('\n--- SCENARIO 1: Absen Harian (Zero Input) ---'));
    await userSays('!absen');
    // Expect: AI generating draft -> Draft Preview
    await userSays('ya');
    // Expect: Submitted to "Kemnaker" (Mocked)

    // --- SCENARIO 2: USER TRIES VOICE NOTE ---
    console.log(chalk.yellow.bold('\n--- SCENARIO 2: Coba Fitur Voice Note ---'));
    await simulateVoiceNote(USER_PHONE);
    // Expect: "Maaf fitur dimatikan" message

    // --- SCENARIO 3: ADMIN MANAGES HOLIDAY ---
    console.log(chalk.yellow.bold('\n--- SCENARIO 3: Admin Set Libur ---'));
    const today = new Date().toISOString().split('T')[0];
    await userSays(`!dev libur ${today}`, false, ADMIN_PHONE);

    console.log(chalk.cyan('...User mencoba absen saat libur...'));
    await userSays('!absen', false, USER_PHONE);
    // Expect: "Hari ini libur"

    console.log(chalk.cyan('...Admin hapus libur...'));
    await userSays(`!dev hapus-libur ${today}`, false, ADMIN_PHONE);

    // --- SCENARIO 4: ADMIN MANAGES GROUPS & REMINDERS ---
    console.log(chalk.yellow.bold('\n--- SCENARIO 4: Setup Grup Reminder ---'));

    // 4a. Admin gets Group ID in a Group Chat
    await userSays('!dev showid', true, ADMIN_PHONE);

    // 4b. Admin Whitelists the Group (via DM)
    await userSays(`!dev grup add ${GROUP_ID}`, false, ADMIN_PHONE);

    // 4c. Trigger Scheduler (Morning)
    console.log(chalk.cyan('\n⏰ [SYSTEM] Triggering Morning Reminder...'));
    await scheduler.runMorningReminder(mockSock);
    // Expect: Message sent to GROUP_ID because it's whitelisted
    // Expect: Message sent to USER_PHONE (Personal DM)

    // --- CLEANUP ---
    console.log(chalk.yellow.bold('\n--- CLEANUP ---'));
    deleteUser(USER_PHONE);
    removeAllowedGroup(GROUP_ID);
    console.log(chalk.green('Test Data Cleaned.'));
}

runSimulation().catch(console.error);
