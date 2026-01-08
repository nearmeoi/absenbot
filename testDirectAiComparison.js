/**
 * Direct AI Comparison Test Script
 * Compares Gimita Gemini vs Dolphin directly for attendance report generation
 */

require('dotenv').config();
const aiService = require('./src/services/aiService');
const callGimitaGemini = aiService.callGimitaGemini;
const callGimitaDolphin = aiService.callGimitaDolphin;
const chalk = require('chalk');
const fs = require('fs');

// Sample prompt for attendance report generation
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

const systemPrompt = `Kamu adalah asisten yang membantu menulis laporan magang harian dengan gaya PROFESIONAL namun NATURAL.

TUGAS UTAMA:
1. ANALISIS MENDALAM riwayat laporan user:
   - Identifikasi kata-kata dan frasa yang SERING MUNCUL
   - Perhatikan istilah teknis yang konsisten digunakan
   - Catat pola kalimat dan struktur penulisan user
   - Temukan kata kunci yang berulang dari hari ke hari

2. TIRU GAYA PENULISAN user:
   - Gunakan KATA-KATA YANG SAMA yang sering user pakai
   - Ikuti struktur kalimat user
   - Pertahankan tingkat formalitas yang sama
   - Jika user pakai istilah tertentu (misal: "koordinasi", "evaluasi", "implementasi"), GUNAKAN LAGI

128. ATURAN PENULISAN:
    - Tetap profesional dan sopan
    - Tulis natural tapi tetap formal
    - PANJANG: 100-170 karakter per bagian (WAJIB!)
    - HANYA KELUARKAN LAPORAN. Dilarang menyertakan analisis, kata pengantar, atau komentar apa pun!

129. PENGECEKAN LOGIKA (COHERENCE):
    - Pastikan Aktivitas, Pembelajaran, dan Kendala saling "nyambung" secara logis sebagai satu hari kerja.
    - Hindari pengulangan kalimat yang sama di bagian yang berbeda.

CONTOH ANALISIS KONSISTENSI (Internal saja, jangan ditulis di output!):
Jika user sering pakai: "melakukan", "bersama tim", "sistem", "database"
Maka gunakan kata-kata tersebut dalam laporan baru.

Ingat: Tiru gaya user, jangan buat gaya sendiri! HANYA OUTPUT FORMAT DI BAWAH!`;

const userPrompt = `${sampleHistory.map((log, i) => `--- ${log.date} ---\nAktivitas: ${log.activity_log}\nPembelajaran: ${log.lesson_learned}\nKendala: ${log.obstacles}\n`).join('\n')}

Tugas: Buatkan laporan hari ini dengan GAYA YANG SAMA PERSIS dengan riwayat di atas.
Gunakan KATA-KATA YANG SAMA yang user sering pakai!

PENTING:
- Pastikan isi Aktivitas, Pembelajaran, dan Kendala SALING NYAMBUNG dan logis.
- HANYA KELUARKAN ISI LAPORAN.
- DILARANG menyertakan analisis, daftar kata kunci, atau penjelasan gaya bahasa di dalam output.
- JANGAN ADA TEKS LAIN selain format AKTIVITAS, PEMBELAJARAN, dan KENDALA di bawah.
- Panjang 100-170 karakter per bagian.

Format:
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]`;

// Function to measure execution time
async function measureTime(fn, ...args) {
    const start = Date.now();
    const result = await fn(...args);
    const end = Date.now();
    return { ...result, executionTime: end - start };
}

// Function to parse response into structured format
function parseResponse(content) {
    if (!content) return { success: false, error: 'Empty content' };
    
    // Parse response with more flexible regex
    const parseSection = (label, text) => {
        const regex = new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA):|$)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };

    let aktivitas = parseSection('AKTIVITAS', content);
    let pembelajaran = parseSection('PEMBELAJARAN', content);
    let kendala = parseSection('KENDALA', content);

    // Padding and Truncation Logic
    const MIN_CHARS = 100;
    const MAX_CHARS = 170;

    // Clamping Logic: Pad if too short, Truncate if too long
    const clamp = (text, type) => {
        let result = text;

        // Pad if too short
        if (result.length < MIN_CHARS) {
            const suffixes = {
                A: [
                    " dan melakukan dokumentasi hasil kerja",
                    " serta melakukan review terhadap progress",
                    " dan berkoordinasi untuk kelanjutan tugas"
                ],
                P: [
                    " yang sangat bermanfaat untuk pengembangan skill",
                    " dan menambah wawasan tentang best practices",
                    " serta meningkatkan pemahaman teknis"
                ],
                K: [
                    " dan semua berjalan lancar",
                    " sehingga pekerjaan dapat diselesaikan",
                    " dan tidak menghambat progress"
                ]
            };

            let suffixIndex = 0;
            while (result.length < MIN_CHARS && suffixIndex < suffixes[type].length) {
                result += suffixes[type][suffixIndex];
                suffixIndex++;
            }
        }

        // Truncate if too long (final guard)
        if (result.length > MAX_CHARS) {
            result = result.substring(0, MAX_CHARS).trim();
            // Ensure we don't end in the middle of a word if possible
            const lastSpace = result.lastIndexOf(' ');
            if (lastSpace > MAX_CHARS - 20) {
                result = result.substring(0, lastSpace);
            }
        }

        return result;
    };

    aktivitas = clamp(aktivitas, 'A');
    pembelajaran = clamp(pembelajaran, 'P');
    kendala = clamp(kendala, 'K');

    return {
        success: true,
        aktivitas,
        pembelajaran,
        kendala
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
        reason: `Aktivitas: ${hasAktivitas ? '✓' : '✗'} (${response.aktivitas.length} chars), Pembelajaran: ${hasPembelajaran ? '✓' : '✗'} (${response.pembelajaran.length} chars), Kendala: ${hasKendala ? '✓' : '✗'} (${response.kendala.length} chars), Relevance: ${relevantCount}/${relevantTerms.length}`
    };
}

async function runDirectComparisonTest() {
    console.log(chalk.blue('🚀 Starting Direct AI Comparison Test: Gimita Gemini vs Dolphin'));
    console.log(chalk.blue('📊 Testing 10 iterations for each AI service\n'));
    
    const results = {
        gimitaGemini: { totalExecutionTime: 0, totalScore: 0, successCount: 0, results: [] },
        gimitaDolphin: { totalExecutionTime: 0, totalScore: 0, successCount: 0, results: [] }
    };
    
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    // Test each AI 10 times
    for (let i = 0; i < 10; i++) {
        console.log(chalk.yellow(`\n--- Test Iteration ${i + 1}/10 ---`));
        
        // Test Gimita Gemini
        console.log(chalk.cyan('Testing Gimita Gemini...'));
        try {
            const geminiResult = await measureTime(callGimitaGemini, combinedPrompt);
            if (geminiResult.success) {
                const parsedResponse = parseResponse(geminiResult.content);
                const geminiEvaluation = evaluateQuality(parsedResponse);

                results.gimitaGemini.totalExecutionTime += geminiResult.executionTime;
                results.gimitaGemini.totalScore += geminiEvaluation.score;
                results.gimitaGemini.successCount++;

                results.gimitaGemini.results.push({
                    iteration: i + 1,
                    executionTime: geminiResult.executionTime,
                    score: geminiEvaluation.score,
                    success: true,
                    evaluation: geminiEvaluation.reason,
                    response: parsedResponse
                });

                console.log(chalk.green(`  ✅ Gemini: ${geminiResult.executionTime}ms, Score: ${(geminiEvaluation.score * 100).toFixed(2)}%`));
            } else {
                results.gimitaGemini.results.push({
                    iteration: i + 1,
                    executionTime: geminiResult.executionTime || 0,
                    score: 0,
                    success: false,
                    evaluation: `Error: ${geminiResult.error}`,
                    response: null
                });

                console.log(chalk.red(`  ❌ Gemini: Failed - ${geminiResult.error}`));
            }
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
            const dolphinResult = await measureTime(callGimitaDolphin, combinedPrompt);
            if (dolphinResult.success) {
                const parsedResponse = parseResponse(dolphinResult.content);
                const dolphinEvaluation = evaluateQuality(parsedResponse);

                results.gimitaDolphin.totalExecutionTime += dolphinResult.executionTime;
                results.gimitaDolphin.totalScore += dolphinEvaluation.score;
                results.gimitaDolphin.successCount++;

                results.gimitaDolphin.results.push({
                    iteration: i + 1,
                    executionTime: dolphinResult.executionTime,
                    score: dolphinEvaluation.score,
                    success: true,
                    evaluation: dolphinEvaluation.reason,
                    response: parsedResponse
                });

                console.log(chalk.green(`  ✅ Dolphin: ${dolphinResult.executionTime}ms, Score: ${(dolphinEvaluation.score * 100).toFixed(2)}%`));
            } else {
                results.gimitaDolphin.results.push({
                    iteration: i + 1,
                    executionTime: dolphinResult.executionTime || 0,
                    score: 0,
                    success: false,
                    evaluation: `Error: ${dolphinResult.error}`,
                    response: null
                });

                console.log(chalk.red(`  ❌ Dolphin: Failed - ${dolphinResult.error}`));
            }
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
    
    fs.writeFileSync('direct_ai_comparison_results.json', JSON.stringify(detailedResults, null, 2));
    console.log(chalk.blue('\n💾 Detailed results saved to direct_ai_comparison_results.json'));
    
    return detailedResults;
}

// Run the comparison test
runDirectComparisonTest()
    .then(() => console.log(chalk.blue('\n✅ Direct comparison test completed!')))
    .catch(error => console.error(chalk.red('\n❌ Error running direct comparison test:'), error));