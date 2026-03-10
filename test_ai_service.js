const aiService = require('./src/services/aiService');

async function testGeneration() {
    console.log('🤖 Menguji fungsi Master Generation (The Ultimate 6 Pillars Load Balancer)...');

    // Mock history untuk ngetes report generator AbsenBot
    const mockLogs = [
        { activity_log: 'Memperbaiki koneksi database yang terputus.' },
        { activity_log: 'Menambahkan fitur load balancer untuk API LLM.' }
    ];

    console.log('\nMemanggil generateAttendanceReport()...');
    const result = await aiService.generateAttendanceReport(mockLogs);

    console.log('\n✅ HASIL AKHIR:');
    console.log(result);
}

testGeneration();
