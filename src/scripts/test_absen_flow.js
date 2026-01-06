const chalk = require('chalk');
const path = require('path');

console.log(chalk.yellow.bold("🚀 STARTING ABSEN FLOW TEST SIMULATION\n"));

// 1. MOCK MODULE CACHE
// Force 'magang.js' to load 'magang_debug.js' logic
const magangDebugPath = path.resolve(__dirname, '../services/magang_debug');
const magangProdPath = path.resolve(__dirname, '../services/magang');
const dbPath = path.resolve(__dirname, '../services/database');

try {
    // Mock Magang Service
    const mockMagang = require(magangDebugPath);
    require.cache[require.resolve(magangProdPath)] = {
        id: require.resolve(magangProdPath),
        filename: require.resolve(magangProdPath),
        loaded: true,
        exports: mockMagang
    };

    // Mock Database Service
    const mockDb = {
        getUserByPhone: (phone) => ({
            email: 'test@example.com',
            password: 'mock_password',
            phone: phone
        }),
        saveUser: () => true,
        getAllUsers: () => [{ phone: '6281234567890@s.whatsapp.net', email: 'test@example.com' }],
        updateUserLid: () => { },
        deleteUser: () => true,
        loadSession: () => null
    };
    require.cache[require.resolve(dbPath)] = {
        id: require.resolve(dbPath),
        filename: require.resolve(dbPath),
        loaded: true,
        exports: mockDb
    };

    console.log(chalk.green("✅ Mock Injection Successful: magang_debug & database mocked."));
} catch (e) {
    console.error(chalk.red("❌ Mock Injection Failed:"), e);
    process.exit(1);
}

// 2. LOAD HANDLER
const messageHandler = require('../handlers/messageHandler');

// 3. SETUP MOCK ENVIRONMENT
const TEST_PHONE = '6281234567890@s.whatsapp.net';
// Ensure test user exists in DB - No longer needed as DB is mocked
// const testUser = getUserByPhone(TEST_PHONE);
// if (!testUser) {
//     saveUser(TEST_PHONE, 'test@example.com', 'password123'); // Create mock user if needed
// }

// Mock Socket
const mockSock = {
    sendMessage: async (jid, content, options) => {
        const text = content.text || (content.caption ? `[Image] ${content.caption}` : '[Unknown]');

        // Log Reactions
        if (content.react) {
            console.log(chalk.blue(`🤖 BOT REACTION: ${content.react.text}`));
            return { key: { id: 'mock_msg_id' } };
        }

        console.log(chalk.blue(`🤖 BOT REPLY to ${jid.split('@')[0]}:\n`));
        console.log(chalk.white(text));
        console.log(chalk.gray("------------------------------------------------"));

        return { key: { id: 'mock_msg_id' } };
    },
    groupMetadata: async () => ({ participants: [] })
};

// Helper to simulate incoming message
const simulateMessage = async (text) => {
    console.log(chalk.green(`\n👤 USER SAYS: "${text}"`));
    const msg = {
        key: { remoteJid: TEST_PHONE, fromMe: false },
        message: { conversation: text }
    };
    await messageHandler(mockSock, msg);
};

// 4. RUN SIMULATION SCENARIO
(async () => {
    try {
        // Step 1: Request Absen
        await simulateMessage("!absen belajar testing flow bot, pembelajaran memahami mocking nodejs, kendala modul cache agak tricky");

        // Wait a bit
        await new Promise(r => setTimeout(r, 2000));

        // Step 2: Edit (Revisi / Copy Paste)
        console.log(chalk.yellow("\n[SIMULATION] User copies and pastes the draft directly..."));

        const copyPasteText = `*DRAF LAPORAN ANDA*    

*Aktivitas:* (118 karakter)
Mempelajari testing flow bot untuk meningkatkan kemampuan pengujian. 
dan dokumentasi hasil kerja serta review progress

*Pembelajaran:* (121 karakter)
Memahami konsep mocking nodejs untuk pengujian yang lebih efektif. bermanfaat untuk skill menambah wawasan best practices

*Kendala:* (123 karakter)
Menghadapi kesulitan dengan modul cache yang memerlukan penanganan khusus. dan berjalan lancar sehingga selesai tepat waktu

_Ketik *ya* untuk kirim._`;

        await simulateMessage(copyPasteText);

        // Wait a bit
        await new Promise(r => setTimeout(r, 2000));

        // Step 3: Confirm
        console.log(chalk.yellow("\n[SIMULATION] User confirms the report..."));
        await simulateMessage("ya");

    } catch (e) {
        console.error("Test Error:", e);
    }
})();
