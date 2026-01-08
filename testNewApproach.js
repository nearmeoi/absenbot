/**
 * New Approach Test: Dolphin First
 * Testing the new approach where Dolphin is used first (faster), then Gemini as fallback
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

async function testNewApproach() {
    console.log(chalk.blue('🔄 Testing New Approach: Dolphin First, Gemini as Fallback'));
    console.log(chalk.blue('========================================================\n'));
    
    console.log(chalk.cyan('Testing generateAttendanceReport function...'));
    
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
    
    console.log(chalk.cyan('\nTesting processFreeTextToReport function...'));
    
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
    
    // Save results
    const results = {
        generateAttendanceReport: null,
        processFreeTextToReport: null
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
    
    fs.writeFileSync('new_approach_results.json', JSON.stringify(results, null, 2));
    console.log(chalk.blue('\n💾 Detailed results saved to new_approach_results.json'));
}

// Run the test
testNewApproach()
    .then(() => console.log(chalk.blue('\n✅ New approach test completed!')))
    .catch(error => console.error(chalk.red('\n❌ Error in new approach test:'), error));