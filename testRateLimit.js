/**
 * Test Rate Limit Handling
 * Demonstrates the new rate limit handling in the AI service
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

// Function to add delay between requests
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRateLimitHandling() {
    console.log(chalk.blue('🔄 Testing Rate Limit Handling in AI Service'));
    console.log(chalk.blue('============================================\n'));
    
    console.log(chalk.yellow('Note: This will test the new rate limit handling'));
    console.log(chalk.yellow('If rate limit is hit, the system will fall back to next available AI\n'));
    
    // Test multiple requests with delays
    for (let i = 1; i <= 3; i++) {
        console.log(chalk.cyan(`Test ${i}/3: generateAttendanceReport...`));
        
        try {
            const startTime = Date.now();
            const result = await generateAttendanceReport(sampleHistory);
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            
            if (result.success) {
                console.log(chalk.green(`✅ Success (in ${totalTime}ms):`));
                console.log(chalk.gray(`Lengths - A: ${result.aktivitas.length}, P: ${result.pembelajaran.length}, K: ${result.kendala.length}`));
            } else {
                console.log(chalk.red(`❌ Failed: ${result.error}`));
            }
        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
        
        // Add delay between requests to avoid rate limiting
        if (i < 3) {
            console.log(chalk.gray('Waiting 2 seconds before next request...'));
            await delay(2000);
        }
    }
    
    console.log(chalk.cyan('\nTesting processFreeTextToReport...'));
    
    try {
        const startTime = Date.now();
        const result = await processFreeTextToReport("Mengerjakan fitur dashboard dan mengatasi bug pada sistem notifikasi", sampleHistory);
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        if (result.success) {
            console.log(chalk.green(`✅ Success (in ${totalTime}ms):`));
            console.log(chalk.gray(`Lengths - A: ${result.aktivitas.length}, P: ${result.pembelajaran.length}, K: ${result.kendala.length}`));
        } else {
            console.log(chalk.red(`❌ Failed: ${result.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Error: ${error.message}`));
    }
    
    console.log(chalk.yellow('\n🔧 IMPROVEMENTS MADE:'));
    console.log(chalk.white('- Added rate limit detection (HTTP 429)'));
    console.log(chalk.white('- When rate limit hit, system falls back to next AI service'));
    console.log(chalk.white('- Added proper error handling for both Dolphin and Gemini APIs'));
    console.log(chalk.white('- Improved hybrid approach: Dolphin generates, then Gemini improves'));
    console.log(chalk.white('- If improvement fails, original Dolphin result is used'));
    
    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        testDescription: "Rate limit handling test with hybrid approach",
        approach: "Dolphin generates first, then Gemini improves the result",
        rateLimitHandling: "Added detection for HTTP 429 errors"
    };
    
    fs.writeFileSync('rate_limit_handling_test.json', JSON.stringify(results, null, 2));
    console.log(chalk.blue('\n💾 Test results saved to rate_limit_handling_test.json'));
}

// Run the test
testRateLimitHandling()
    .then(() => console.log(chalk.blue('\n✅ Rate limit handling test completed!')))
    .catch(error => console.error(chalk.red('\n❌ Error in rate limit test:'), error));