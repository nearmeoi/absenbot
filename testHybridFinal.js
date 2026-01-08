/**
 * Test the Hybrid Approach (Dolphin + Gemini Improvement)
 * This will work when Gimita API is available
 */

require('dotenv').config();
const { generateAttendanceReport, processFreeTextToReport } = require('./src/services/aiService');
const chalk = require('chalk');
const fs = require('fs');

// Sample history data for testing
const sampleHistory = [
    {
        date: "2024-01-01",
        activity_log: "Mengerjakan fitur login pada aplikasi web menggunakan React dan Node.js. Melakukan debugging pada sistem otentikasi.",
        lesson_learned: "Memahami konsep JWT dan implementasinya dalam sistem otentikasi yang aman.",
        obstacles: "Mengalami kendala dengan CORS saat integrasi frontend dan backend."
    },
    {
        date: "2024-01-02", 
        activity_log: "Melakukan code review terhadap pull request dari tim. Membantu rekan tim dalam menyelesaikan bug pada fitur pembayaran.",
        lesson_learned: "Belajar tentang pentingnya dokumentasi kode dan standar penulisan commit yang baik.",
        obstacles: "Kesulitan dalam memahami arsitektur lama yang digunakan sebelumnya."
    },
    {
        date: "2024-01-03",
        activity_log: "Mengembangkan API endpoint untuk manajemen pengguna. Melakukan testing unit untuk memastikan fungsionalitas berjalan dengan baik.",
        lesson_learned: "Mengenal lebih dalam tentang testing unit dan manfaatnya dalam pengembangan perangkat lunak.",
        obstacles: "Waktu yang terbatas untuk menyelesaikan semua test case yang direncanakan."
    }
];

async function testHybridApproach() {
    console.log(chalk.blue('🔄 Testing Hybrid Approach: Dolphin Generates + Gemini Improves'));
    console.log(chalk.blue('==========================================================\n'));
    
    console.log(chalk.cyan('Testing generateAttendanceReport function (Dolphin + Gemini)...'));
    
    const startTime = Date.now();
    try {
        const result = await generateAttendanceReport(sampleHistory);
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        if (result.success) {
            console.log(chalk.green(`✅ Success (in ${totalTime}ms):`));
            console.log(chalk.yellow('AKTIVITAS:'), result.aktivitas);
            console.log(chalk.yellow('PEMBELAJARAN:'), result.pembelajaran);
            console.log(chalk.yellow('KENDALA:'), result.kendala);
            console.log(chalk.gray(`Lengths - A: ${result.aktivitas.length}, P: ${result.pembelajaran.length}, K: ${result.kendala.length}`));
        } else {
            console.log(chalk.red(`❌ Failed: ${result.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Error: ${error.message}`));
    }
    
    console.log(chalk.cyan('\nTesting processFreeTextToReport function (Dolphin + Gemini)...'));
    
    const startTime2 = Date.now();
    try {
        const result = await processFreeTextToReport("Mengerjakan fitur dashboard dan mengatasi bug pada sistem notifikasi", sampleHistory);
        const endTime2 = Date.now();
        const totalTime2 = endTime2 - startTime2;
        
        if (result.success) {
            console.log(chalk.green(`✅ Success (in ${totalTime2}ms):`));
            console.log(chalk.yellow('AKTIVITAS:'), result.aktivitas);
            console.log(chalk.yellow('PEMBELAJARAN:'), result.pembelajaran);
            console.log(chalk.yellow('KENDALA:'), result.kendala);
            console.log(chalk.gray(`Lengths - A: ${result.aktivitas.length}, P: ${result.pembelajaran.length}, K: ${result.kendala.length}`));
        } else {
            console.log(chalk.red(`❌ Failed: ${result.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Error: ${error.message}`));
    }
    
    console.log(chalk.yellow('\n📝 SUMMARY OF THE NEW APPROACH:'));
    console.log(chalk.white('- Dolphin API digunakan terlebih dahulu (lebih cepat)'));
    console.log(chalk.white('- Hasil dari Dolphin kemudian ditingkatkan oleh Gemini'));
    console.log(chalk.white('- Jika peningkatan gagal, hasil Dolphin asli tetap digunakan'));
    console.log(chalk.white('- Jika Dolphin gagal, sistem menggunakan fallback (Gemini, Groq, dll)'));
    
    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        generateAttendanceReport: null,
        processFreeTextToReport: null,
        approach: "Dolphin generates first, then Gemini improves the result"
    };
    
    try {
        results.generateAttendanceReport = await generateAttendanceReport(sampleHistory);
    } catch (e) {
        results.generateAttendanceReport = { error: e.message };
    }
    
    try {
        results.processFreeTextToReport = await processFreeTextToReport("Mengerjakan fitur dashboard dan mengatasi bug pada sistem notifikasi", sampleHistory);
    } catch (e) {
        results.processFreeTextToReport = { error: e.message };
    }
    
    fs.writeFileSync('hybrid_approach_final_results.json', JSON.stringify(results, null, 2));
    console.log(chalk.blue('\n💾 Detailed results saved to hybrid_approach_final_results.json'));
}

// Run the test
testHybridApproach()
    .then(() => console.log(chalk.blue('\n✅ Hybrid approach test completed!')))
    .catch(error => console.error(chalk.red('\n❌ Error in hybrid approach test:'), error));