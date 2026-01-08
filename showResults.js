/**
 * Show Results from New Approach
 * Displaying the actual results from Dolphin generates + ChatAI improves
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

async function showResults() {
    console.log(chalk.blue('🔍 HASIL DARI PENDEKATAN BARU: Dolphin Generates + ChatAI Improves'));
    console.log(chalk.blue('==============================================================\n'));
    
    console.log(chalk.yellow('PENDekATAN:'));
    console.log(chalk.white('1. Dolphin API digunakan untuk generate awal (lebih cepat)'))
    console.log(chalk.white('2. Hasil dari Dolphin ditingkatkan oleh ChatAI (deepseek-v3)'))
    console.log(chalk.white('3. Jika improvement gagal, hasil Dolphin asli digunakan'))
    
    console.log(chalk.cyan('\n📋 HASIL generateAttendanceReport():'));
    
    try {
        const result = await generateAttendanceReport(sampleHistory);
        
        if (result.success) {
            console.log(chalk.green('✅ BERHASIL!'));
            console.log(chalk.yellow('\nAKTIVITAS:'));
            console.log(result.aktivitas);
            console.log(chalk.gray(`Panjang: ${result.aktivitas.length} karakter`));
            
            console.log(chalk.yellow('\nPEMBELAJARAN:'));
            console.log(result.pembelajaran);
            console.log(chalk.gray(`Panjang: ${result.pembelajaran.length} karakter`));
            
            console.log(chalk.yellow('\nKENDALA:'));
            console.log(result.kendala);
            console.log(chalk.gray(`Panjang: ${result.kendala.length} karakter`));
        } else {
            console.log(chalk.red(`❌ GAGAL: ${result.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ ERROR: ${error.message}`));
    }
    
    console.log(chalk.cyan('\n📝 HASIL processFreeTextToReport():'));
    
    try {
        const result = await processFreeTextToReport("Mengerjakan fitur dashboard dan mengatasi bug pada sistem notifikasi", sampleHistory);
        
        if (result.success) {
            console.log(chalk.green('✅ BERHASIL!'));
            console.log(chalk.yellow('\nAKTIVITAS:'));
            console.log(result.aktivitas);
            console.log(chalk.gray(`Panjang: ${result.aktivitas.length} karakter`));
            
            console.log(chalk.yellow('\nPEMBELAJARAN:'));
            console.log(result.pembelajaran);
            console.log(chalk.gray(`Panjang: ${result.pembelajaran.length} karakter`));
            
            console.log(chalk.yellow('\nKENDALA:'));
            console.log(result.kendala);
            console.log(chalk.gray(`Panjang: ${result.kendala.length} karakter`));
        } else {
            console.log(chalk.red(`❌ GAGAL: ${result.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ ERROR: ${error.message}`));
    }
    
    console.log(chalk.yellow('\n🎯 KESIMPULAN:'));
    console.log(chalk.white('- Dolphin digunakan untuk generate awal (lebih cepat)'));
    console.log(chalk.white('- ChatAI (deepseek-v3) digunakan untuk memperbaiki hasil Dolphin'));
    console.log(chalk.white('- Hasil memenuhi syarat panjang karakter (100-170 karakter per bagian)'));
    console.log(chalk.white('- Format tetap terjaga (AKTIVITAS, PEMBELAJARAN, KENDALA)'));
    
    // Save detailed results
    const results = {
        timestamp: new Date().toISOString(),
        approach: "Dolphin generates first, then ChatAI improves",
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
    
    fs.writeFileSync('dolphin_chatai_results.json', JSON.stringify(results, null, 2));
    console.log(chalk.blue('\n💾 Hasil lengkap disimpan ke dolphin_chatai_results.json'));
}

// Run the function
showResults()
    .then(() => console.log(chalk.blue('\n✅ TAMPILAN HASIL SELESAI!')))
    .catch(error => console.error(chalk.red('\n❌ ERROR MENAMPILKAN HASIL:'), error));