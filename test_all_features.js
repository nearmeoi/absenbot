// COMPREHENSIVE TEST SCRIPT - ALL NEW FEATURES
// MOCKING MUST BE DONE BEFORE REQUIRING OTHER MODULES
const path = require('path');

// Mock 'magang' service to prevent real submission
const magangPath = path.resolve(__dirname, 'src/services/magang.js');
require.cache[magangPath] = {
    id: magangPath,
    filename: magangPath,
    loaded: true,
    exports: {
        prosesLoginDanAbsen: async (data) => {
            console.log('\n[MOCK] prosesLoginDanAbsen called with:', JSON.stringify(data, null, 2));
            return { success: true, pesan: "MOCKED SUBMISSION SUCCESS" };
        },
        cekKredensial: async () => ({ success: true }),
        cekStatusHarian: async () => ({ success: true, sudahAbsen: false }),
        getRiwayat: async () => ({
            success: true,
            logs: [
                { date: '2026-01-01', activity_log: 'Membuat REST API dengan Express.js', lesson_learned: 'Memahami routing dan middleware', obstacles: 'Tidak ada kendala.' },
                { date: '2025-12-31', activity_log: 'Belajar React components', lesson_learned: 'Memahami state dan props', obstacles: 'Tidak ada kendala.' }
            ]
        })
    }
};

const messageHandler = require('./src/handlers/messageHandler');
const { setDraft, getDraft, deleteDraft } = require('./src/services/previewService');
const { saveUser, deleteUser } = require('./src/services/database');

// Mock socket
const mockSock = {
    sendMessage: async (jid, content, options) => {
        console.log(`\n[BOT to ${jid}]:`, JSON.stringify(content, null, 2));
    }
};

async function testAllFeatures() {
    const userPhone = '6281234567890@s.whatsapp.net';
    const userEmail = 'test@example.com';

    // Setup: Ensure user exists in DB
    saveUser(userPhone, userEmail, 'password123');

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              TEST SEMUA FITUR BARU                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // ========================================
    // TEST 1: Zero-input !absen
    // ========================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST 1: Zero-input !absen (tanpa argumen)');
    console.log('═══════════════════════════════════════════════════════════');

    const msgAbsenEmpty = {
        key: { remoteJid: userPhone, fromMe: false },
        message: { conversation: '!absen' }
    };
    await messageHandler(mockSock, msgAbsenEmpty);

    console.log('\n[CHECK] Draft after zero-input:', getDraft(userPhone));

    // ========================================
    // TEST 2: User sends edited draft (copy-paste)
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 2: User kirim draft yang diedit (copy-paste)');
    console.log('═══════════════════════════════════════════════════════════');

    const editedDraft = `*DRAF LAPORAN OTOMATIS* 🤖

*Aktivitas:* (120 karakter)
Hari ini saya belajar tentang unit testing menggunakan Jest. Saya membuat test case sederhana untuk fungsi matematika dasar.

*Pembelajaran:* (120 karakter)
Saya memahami pentingnya coverage dalam testing. Selain itu saya juga belajar tentang mocking dependencies agar test cepat.

*Kendala:* (50 karakter)
Tidak ada kendala.
`;

    const msgEdit = {
        key: { remoteJid: userPhone, fromMe: false },
        message: { conversation: editedDraft }
    };
    await messageHandler(mockSock, msgEdit);

    console.log('\n[CHECK] Draft after edit:', getDraft(userPhone));

    // ========================================
    // TEST 3: User confirms with 'ya'
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 3: User konfirmasi dengan "ya"');
    console.log('═══════════════════════════════════════════════════════════');

    const msgYa = {
        key: { remoteJid: userPhone, fromMe: false },
        message: { conversation: 'ya' }
    };
    await messageHandler(mockSock, msgYa);

    // ========================================
    // TEST 4: !absen with story (semi-auto)
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 4: !absen dengan cerita (Semi-Auto AI)');
    console.log('═══════════════════════════════════════════════════════════');

    const msgAbsenStory = {
        key: { remoteJid: userPhone, fromMe: false },
        message: { conversation: '!absen belajar docker dan kubernetes' }
    };
    await messageHandler(mockSock, msgAbsenStory);

    // ========================================
    // TEST 5: !absen manual with tags
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 5: !absen manual dengan tag #');
    console.log('═══════════════════════════════════════════════════════════');

    const manualReport = `!absen #aktivitas Hari ini saya melakukan code review dan refactoring pada modul authentication. Saya juga memperbaiki beberapa bug yang ditemukan.
#pembelajaran Saya belajar tentang best practices dalam menulis kode yang bersih dan maintainable. Refactoring membantu memahami kode lebih dalam.
#kendala Tidak ada kendala.`;

    const msgManual = {
        key: { remoteJid: userPhone, fromMe: false },
        message: { conversation: manualReport }
    };
    await messageHandler(mockSock, msgManual);

    // ========================================
    // TEST 6: Voice Note (should be disabled)
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 6: Voice Note (harus disabled)');
    console.log('═══════════════════════════════════════════════════════════');

    const msgVN = {
        key: { remoteJid: userPhone, fromMe: false },
        message: { audioMessage: { mimetype: 'audio/ogg' } }
    };
    await messageHandler(mockSock, msgVN);

    // ========================================
    // CLEANUP
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('CLEANUP');
    console.log('═══════════════════════════════════════════════════════════');
    deleteUser(userPhone);
    deleteDraft(userPhone);
    console.log('User dan draft dihapus.');

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              TEST SELESAI                                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
}

testAllFeatures();
