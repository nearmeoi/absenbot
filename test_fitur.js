require('dotenv').config();
const messageHandler = require('./src/handlers/messageHandler');
const chalk = require('chalk');

// ==========================================
// MOCK OBJECTS (Tiruan WhatsApp)
// ==========================================

// Mock Socket (Pura-pura jadi Bot yang membalas)
const mockSock = {
    sendMessage: async (jid, content, options) => {
        console.log(chalk.green(`\n[BOT MEMBALAS ke ${jid}]`));
        
        if (content.text) console.log(chalk.white(`📝 Text: ${content.text}`));
        if (content.image) console.log(chalk.yellow(`🖼️ Image: [URL Gambar]`));
        if (content.caption) console.log(chalk.white(`📝 Caption: ${content.caption}`));
        if (content.mentions) console.log(chalk.blue(`@ Mentions: ${content.mentions}`));
        if (content.react) console.log(chalk.magenta(`Reaction: ${content.react.text}`));
        
        if (options && options.ephemeralExpiration) {
            console.log(chalk.gray(`(🕒 Pesan hilang dalam 24 jam)`));
        }
        
        // Simulasi delay jaringan
        await new Promise(r => setTimeout(r, 500));
    },
    
    groupMetadata: async (jid) => {
        return {
            participants: [
                { id: '6281234567890@s.whatsapp.net', admin: 'superadmin' },
                { id: '6289876543210@s.whatsapp.net', admin: null }
            ]
        };
    }
};

// Helper membuat pesan tiruan
const createMsg = (text, isGroup = false, sender = '6281234567890@s.whatsapp.net') => {
    const remoteJid = isGroup ? '120363045xxxxxx@g.us' : sender;
    return {
        key: {
            remoteJid,
            fromMe: false,
            participant: isGroup ? sender : undefined,
            id: 'TEST_MSG_' + Date.now()
        },
        message: {
            conversation: text,
            extendedTextMessage: { text: text } // Backup property
        },
        pushName: "Tester User"
    };
};

// ==========================================
// TEST RUNNER
// ==========================================

const runTests = async () => {
    console.log(chalk.bgBlue.white.bold("\n=== MULAI SIMULASI TEST FITUR ===\n"));

    // --- TEST 1: Menu ---
    console.log(chalk.cyan("🔹 TEST 1: !hai (Menu)"));
    await messageHandler(mockSock, createMsg('!hai'));

    // --- TEST 2: Daftar ---
    console.log(chalk.cyan("\n🔹 TEST 2: !daftar (PC)"));
    await messageHandler(mockSock, createMsg('!daftar'));

    // --- TEST 3: Absen Manual (Grup) ---
    console.log(chalk.cyan("\n🔹 TEST 3: !absen (Di Grup - Harus redirect ke PC)"));
    await messageHandler(mockSock, createMsg('!absen', true));

    // --- TEST 4: Absen Manual (PC) ---
    console.log(chalk.cyan("\n🔹 TEST 4: !absen (Di PC - Harus kirim template)"));
    await messageHandler(mockSock, createMsg('!absen'));

    // --- TEST 5: Cek Status ---
    console.log(chalk.cyan("\n🔹 TEST 5: !cek"));
    await messageHandler(mockSock, createMsg('!cek'));

    // --- TEST 6: Riwayat ---
    console.log(chalk.cyan("\n🔹 TEST 6: !riwayat"));
    await messageHandler(mockSock, createMsg('!riwayat'));

    // --- TEST 7: List User ---
    console.log(chalk.cyan("\n🔹 TEST 7: !listuser"));
    await messageHandler(mockSock, createMsg('!listuser'));

    // --- TEST 8: Ingatkan (Grup Only) ---
    console.log(chalk.cyan("\n🔹 TEST 8: !ingatkan (Di Grup)"));
    await messageHandler(mockSock, createMsg('!ingatkan', true));
    
    // --- TEST 9: AI Preview (Hanya simulasi trigger, mungkin gagal kalau tidak ada API Key lokal) ---
    console.log(chalk.cyan("\n🔹 TEST 9: !preview (AI Generate)"));
    console.log(chalk.gray("Note: Ini butuh koneksi internet & API Key Groq di .env"));
    try {
        await messageHandler(mockSock, createMsg('!preview'));
    } catch (e) {
        console.log("Error preview:", e.message);
    }

    console.log(chalk.bgGreen.black.bold("\n=== SEMUA TEST SELESAI ===\n"));
};

// Jalankan test
runTests();
