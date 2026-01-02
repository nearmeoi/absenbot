// TEST AI QUALITY - Calls real Groq API (no submission to Kemnaker)
require('dotenv').config();

const { generateAttendanceReport, processFreeTextToReport } = require('./src/services/groqService');

// Sample history data untuk konteks
const sampleHistory = [
    {
        date: '2026-01-01',
        activity_log: 'Membuat REST API dengan Express.js untuk modul user management. Implementasi endpoint CRUD untuk data pengguna.',
        lesson_learned: 'Memahami konsep routing dan middleware di Express. Belajar validasi input menggunakan Joi.',
        obstacles: 'Tidak ada kendala yang signifikan.'
    },
    {
        date: '2025-12-31',
        activity_log: 'Mempelajari React components dan state management. Membuat komponen form registrasi dengan validasi.',
        lesson_learned: 'Memahami lifecycle hooks dan penggunaan useState dan useEffect dengan baik.',
        obstacles: 'Sempat bingung dengan useEffect cleanup tapi sudah teratasi.'
    },
    {
        date: '2025-12-30',
        activity_log: 'Melakukan setup database PostgreSQL dan membuat skema tabel untuk sistem absensi.',
        lesson_learned: 'Memahami normalisasi database dan relasi antar tabel.',
        obstacles: 'Tidak ada kendala.'
    }
];

async function testAIQuality() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              TEST KUALITAS AI (GROQ)                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // ========================================
    // TEST 1: generateAttendanceReport (dari history)
    // ========================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST 1: generateAttendanceReport (dari riwayat)');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Input: 3 hari riwayat tentang REST API, React, dan PostgreSQL\n');

    const result1 = await generateAttendanceReport(sampleHistory);

    if (result1.success) {
        console.log('✅ AI BERHASIL GENERATE!\n');
        console.log('📝 AKTIVITAS:');
        console.log(`   "${result1.aktivitas}"`);
        console.log(`   (${result1.aktivitas.length} karakter)\n`);

        console.log('📚 PEMBELAJARAN:');
        console.log(`   "${result1.pembelajaran}"`);
        console.log(`   (${result1.pembelajaran.length} karakter)\n`);

        console.log('⚠️ KENDALA:');
        console.log(`   "${result1.kendala}"`);
        console.log(`   (${result1.kendala.length} karakter)\n`);
    } else {
        console.log('❌ AI GAGAL:', result1.error);
    }

    // ========================================
    // TEST 2: processFreeTextToReport (dari cerita user)
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 2: processFreeTextToReport (dari cerita user)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const userStory = 'belajar docker dan kubernetes untuk deployment aplikasi';
    console.log(`Input: "${userStory}"\n`);

    const result2 = await processFreeTextToReport(userStory, sampleHistory);

    if (result2.success) {
        console.log('✅ AI BERHASIL GENERATE!\n');
        console.log('📝 AKTIVITAS:');
        console.log(`   "${result2.aktivitas}"`);
        console.log(`   (${result2.aktivitas.length} karakter)\n`);

        console.log('📚 PEMBELAJARAN:');
        console.log(`   "${result2.pembelajaran}"`);
        console.log(`   (${result2.pembelajaran.length} karakter)\n`);

        console.log('⚠️ KENDALA:');
        console.log(`   "${result2.kendala}"`);
        console.log(`   (${result2.kendala.length} karakter)\n`);
    } else {
        console.log('❌ AI GAGAL:', result2.error);
    }

    // ========================================
    // TEST 3: processFreeTextToReport (cerita pendek)
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 3: processFreeTextToReport (cerita sangat pendek)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const shortStory = 'meeting';
    console.log(`Input: "${shortStory}"\n`);

    const result3 = await processFreeTextToReport(shortStory, []);

    if (result3.success) {
        console.log('✅ AI BERHASIL GENERATE!\n');
        console.log('📝 AKTIVITAS:');
        console.log(`   "${result3.aktivitas}"`);
        console.log(`   (${result3.aktivitas.length} karakter)\n`);

        console.log('📚 PEMBELAJARAN:');
        console.log(`   "${result3.pembelajaran}"`);
        console.log(`   (${result3.pembelajaran.length} karakter)\n`);

        console.log('⚠️ KENDALA:');
        console.log(`   "${result3.kendala}"`);
        console.log(`   (${result3.kendala.length} karakter)\n`);
    } else {
        console.log('❌ AI GAGAL:', result3.error);
    }

    // ========================================
    // TEST 4: processFreeTextToReport (cerita lengkap)
    // ========================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST 4: processFreeTextToReport (cerita lengkap: aktivitas, belajar, kendala)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const detailedStory = 'Hari ini saya memperbaiki bug di fitur login yang error kalau password salah. Saya belajar cara debugging pakai console log dan inspector di chrome. Kendalanya tadi sempat pusing karena error message nya kurang jelas, tapi akhirnya ketemu.';
    console.log(`Input: "${detailedStory}"\n`);

    const result4 = await processFreeTextToReport(detailedStory, []);

    if (result4.success) {
        console.log('✅ AI BERHASIL GENERATE!\n');
        console.log('📝 AKTIVITAS:');
        console.log(`   "${result4.aktivitas}"`);
        console.log(`   (${result4.aktivitas.length} karakter)\n`);

        console.log('📚 PEMBELAJARAN:');
        console.log(`   "${result4.pembelajaran}"`);
        console.log(`   (${result4.pembelajaran.length} karakter)\n`);

        console.log('⚠️ KENDALA:');
        console.log(`   "${result4.kendala}"`);
        console.log(`   (${result4.kendala.length} karakter)\n`);
    } else {
        console.log('❌ AI GAGAL:', result4.error);
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              TEST SELESAI                                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
}

testAIQuality();
