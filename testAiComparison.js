/**
 * AI Comparison Test Script
 * Compares Gimita Gemini vs Dolphin for attendance report generation
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

// Function to measure execution time
function measureTime(fn) {
    return async (...args) => {
        const start = Date.now();
        const result = await fn(...args);
        const end = Date.now();
        return { ...result, executionTime: end - start };
    };
}

// Function to evaluate quality of response
function evaluateQuality(response) {
    if (!response.success) {
        return { score: 0, reason: 'Failed to generate' };
    }
    
    // Check if response has all required sections
    const hasAktivitas = response.aktivitas && response.aktivitas.length >= 100;
    const hasPembelajaran = response.pembelajaran && response.pembelajaran.length >= 100;
    const hasKendala = response.kendala && response.kendala.length >= 100;
    
    // Calculate character length scores
    const aktivitasScore = Math.min(response.aktivitas.length / 170, 1);
    const pembelajaranScore = Math.min(response.pembelajaran.length / 170, 1);
    const kendalaScore = Math.min(response.kendala.length / 170, 1);
    
    // Check for relevance to history
    const text = `${response.aktivitas} ${response.pembelajaran} ${response.kendala}`.toLowerCase();
    const relevantTerms = ['react', 'node', 'api', 'testing', 'debugging', 'code', 'review'];
    const relevantCount = relevantTerms.filter(term => text.includes(term)).length;
    const relevanceScore = relevantCount / relevantTerms.length;
    
    const totalScore = (aktivitasScore + pembelajaranScore + kendalaScore + relevanceScore) / 4;
    
    return {
        score: totalScore,
        reason: `Aktivitas: ${hasAktivitas ? '✓' : '✗'}, Pembelajaran: ${hasPembelajaran ? '✓' : '✗'}, Kendala: ${hasKendala ? '✓' : '✗'}, Relevance: ${relevantCount}/${relevantTerms.length}`
    };
}

async function runComparisonTest() {
    console.log(chalk.blue('🚀 Starting AI Comparison Test: Gimita Gemini vs Dolphin'));
    console.log(chalk.blue('📊 Testing 10 iterations for each AI service\n'));
    
    const results = {
        gimitaGemini: { totalExecutionTime: 0, totalScore: 0, successCount: 0, results: [] },
        gimitaDolphin: { totalExecutionTime: 0, totalScore: 0, successCount: 0, results: [] }
    };
    
    // Test each AI 10 times
    for (let i = 0; i < 10; i++) {
        console.log(chalk.yellow(`\n--- Test Iteration ${i + 1}/10 ---`));
        
        // Test Gimita Gemini
        console.log(chalk.cyan('Testing Gimita Gemini...'));
        try {
            const geminiResult = await measureTime(generateAttendanceReport)(sampleHistory);
            const geminiEvaluation = evaluateQuality(geminiResult);
            
            results.gimitaGemini.totalExecutionTime += geminiResult.executionTime;
            results.gimitaGemini.totalScore += geminiEvaluation.score;
            if (geminiResult.success) results.gimitaGemini.successCount++;
            
            results.gimitaGemini.results.push({
                iteration: i + 1,
                executionTime: geminiResult.executionTime,
                score: geminiEvaluation.score,
                success: geminiResult.success,
                evaluation: geminiEvaluation.reason,
                response: geminiResult
            });
            
            console.log(chalk.green(`  ✅ Gemini: ${geminiResult.executionTime}ms, Score: ${(geminiEvaluation.score * 100).toFixed(2)}%`));
        } catch (error) {
            console.log(chalk.red(`  ❌ Gemini: Error - ${error.message}`));
            results.gimitaGemini.results.push({
                iteration: i + 1,
                executionTime: 0,
                score: 0,
                success: false,
                evaluation: `Error: ${error.message}`,
                response: null
            });
        }
        
        // Test Gimita Dolphin
        console.log(chalk.cyan('Testing Gimita Dolphin...'));
        try {
            const dolphinResult = await measureTime(generateAttendanceReport)(sampleHistory);
            const dolphinEvaluation = evaluateQuality(dolphinResult);
            
            results.gimitaDolphin.totalExecutionTime += dolphinResult.executionTime;
            results.gimitaDolphin.totalScore += dolphinEvaluation.score;
            if (dolphinResult.success) results.gimitaDolphin.successCount++;
            
            results.gimitaDolphin.results.push({
                iteration: i + 1,
                executionTime: dolphinResult.executionTime,
                score: dolphinEvaluation.score,
                success: dolphinResult.success,
                evaluation: dolphinEvaluation.reason,
                response: dolphinResult
            });
            
            console.log(chalk.green(`  ✅ Dolphin: ${dolphinResult.executionTime}ms, Score: ${(dolphinEvaluation.score * 100).toFixed(2)}%`));
        } catch (error) {
            console.log(chalk.red(`  ❌ Dolphin: Error - ${error.message}`));
            results.gimitaDolphin.results.push({
                iteration: i + 1,
                executionTime: 0,
                score: 0,
                success: false,
                evaluation: `Error: ${error.message}`,
                response: null
            });
        }
    }
    
    // Calculate averages
    const geminiAvgTime = results.gimitaGemini.totalExecutionTime / 10;
    const geminiAvgScore = results.gimitaGemini.totalScore / 10;
    const geminiSuccessRate = (results.gimitaGemini.successCount / 10) * 100;
    
    const dolphinAvgTime = results.gimitaDolphin.totalExecutionTime / 10;
    const dolphinAvgScore = results.gimitaDolphin.totalScore / 10;
    const dolphinSuccessRate = (results.gimitaDolphin.successCount / 10) * 100;
    
    // Display results
    console.log(chalk.blue('\n' + '='.repeat(60)));
    console.log(chalk.blue('📊 FINAL COMPARISON RESULTS'));
    console.log(chalk.blue('='.repeat(60)));
    
    console.log(chalk.yellow('\n🎯 ACCURACY & QUALITY:'));
    console.log(`Gimita Gemini  : ${(geminiAvgScore * 100).toFixed(2)}% avg score, ${geminiSuccessRate.toFixed(0)}% success rate`);
    console.log(`Gimita Dolphin : ${(dolphinAvgScore * 100).toFixed(2)}% avg score, ${dolphinSuccessRate.toFixed(0)}% success rate`);
    
    console.log(chalk.yellow('\n⚡ SPEED:'));
    console.log(`Gimita Gemini  : ${geminiAvgTime.toFixed(2)}ms avg response time`);
    console.log(`Gimita Dolphin : ${dolphinAvgTime.toFixed(2)}ms avg response time`);
    
    // Determine winner
    console.log(chalk.yellow('\n🏆 WINNER:'));
    if (geminiAvgScore > dolphinAvgScore) {
        console.log(chalk.green('Gimita Gemini wins in quality!'));
    } else if (dolphinAvgScore > geminiAvgScore) {
        console.log(chalk.green('Gimita Dolphin wins in quality!'));
    } else {
        console.log(chalk.yellow('It\'s a tie in quality!'));
    }
    
    if (geminiAvgTime < dolphinAvgTime) {
        console.log(chalk.green('Gimita Gemini wins in speed!'));
    } else if (dolphinAvgTime < geminiAvgTime) {
        console.log(chalk.green('Gimita Dolphin wins in speed!'));
    } else {
        console.log(chalk.yellow('It\'s a tie in speed!'));
    }
    
    // Save detailed results to file
    const detailedResults = {
        summary: {
            gemini: {
                avgTime: geminiAvgTime,
                avgScore: geminiAvgScore,
                successRate: geminiSuccessRate
            },
            dolphin: {
                avgTime: dolphinAvgTime,
                avgScore: dolphinAvgScore,
                successRate: dolphinSuccessRate
            }
        },
        detailedResults: results
    };
    
    fs.writeFileSync('ai_comparison_results.json', JSON.stringify(detailedResults, null, 2));
    console.log(chalk.blue('\n💾 Detailed results saved to ai_comparison_results.json'));
    
    return detailedResults;
}

// Run the comparison test
runComparisonTest()
    .then(() => console.log(chalk.blue('\n✅ Comparison test completed!')))
    .catch(error => console.error(chalk.red('\n❌ Error running comparison test:'), error));