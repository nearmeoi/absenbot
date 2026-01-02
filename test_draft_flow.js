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
        getRiwayat: async () => ({ success: true, logs: [] })
    }
};

const messageHandler = require('./src/handlers/messageHandler');
const { setDraft, getDraft } = require('./src/services/previewService');
const { saveUser, deleteUser } = require('./src/services/database');

// Mock socket
const mockSock = {
    sendMessage: async (jid, content, options) => {
        console.log(`\n[BOT to ${jid}]:`, JSON.stringify(content, null, 2));
        if (content.text && content.text.includes('DRAF UPADATED')) {
            console.log('[BOT LOG] Draft Preview detected');
        }
    }
};

async function testDraftFlow() {
    const userPhone = '6281234567890@s.whatsapp.net';
    const userEmail = 'test@example.com';

    // Setup: Ensure user exists in DB
    saveUser(userPhone, userEmail, 'password123');

    console.log('--- TEST START: FLOW EDIT DRAFT & SUBMIT ---');

    // 1. Setup initial draft (simulating AI result)
    console.log('\n=== STEP 1: Bot sets initial draft ===');
    setDraft(userPhone, {
        aktivitas: 'Aktivitas awal yang pendek.',
        pembelajaran: 'Pembelajaran awal yang pendek.',
        kendala: 'Tidak ada kendala.',
        type: 'ai'
    });
    console.log('Current Draft:', getDraft(userPhone));

    // 2. User sends 'EDITED' message (Copy-Paste form)
    // Simulating user editing the text to be compliant (> 100 chars)
    const encodedEdit = `*DRAF LAPORAN ANDA*

*Aktivitas:* (120 karakter)
Hari ini saya belajar tentang unit testing menggunakan Jest. Saya membuat test case sederhana untuk fungsi matematika dasar.

*Pembelajaran:* (120 karakter)
Saya memahami pentingnya coverage dalam testing. Selain itu saya juga belajar tentang mocking dependencies agar test cepat.

*Kendala:* (50 karakter)
Tidak ada kendala.
`;

    console.log('\n=== STEP 2: User sends edited draft (Message Handler Trigger) ===');
    const msgObjEdit = {
        key: { remoteJid: userPhone, fromMe: false },
        message: { conversation: encodedEdit }
    };

    await messageHandler(mockSock, msgObjEdit);

    // Check if draft updated
    const afterEdit = getDraft(userPhone);
    console.log('\n[CHECK] Draft after edit:', afterEdit);

    if (afterEdit && afterEdit.aktivitas.includes('Jest')) {
        console.log('✅ Draft successfully updated!');
    } else {
        console.error('❌ Draft did NOT update.');
    }

    // 3. User sends 'YA' to confirm
    console.log('\n=== STEP 3: User confirms by sending "ya" ===');
    const confirmMsg = {
        key: { remoteJid: userPhone, fromMe: false },
        message: { conversation: 'ya' }
    };

    await messageHandler(mockSock, confirmMsg);

    console.log('\n--- TEST FINISHED ---');

    // Cleanup
    deleteUser(userPhone);
}

testDraftFlow();
