/**
 * Hybrid AI Approach Test
 * Dolphin generates first, then Gemini improves the result
 */

require('dotenv').config();
const aiService = require('./src/services/aiService');
const callGimitaDolphin = aiService.callGimitaDolphin;
const improveWithGimitaGemini = aiService.improveWithGimitaGemini;
const chalk = require('chalk');
const fs = require('fs');

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

async function testHybridApproach() {
    console.log(chalk.blue('🔄 Testing Hybrid AI Approach: Dolphin + Gemini Improvement'));
    console.log(chalk.blue('========================================================\n'));
    
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    // Step 1: Generate with Dolphin (faster)
    console.log(chalk.cyan('Step 1: Generating with Gimita Dolphin...'));
    try {
        const startTime = Date.now();
        const dolphinResult = await callGimitaDolphin(combinedPrompt);
        const dolphinTime = Date.now() - startTime;
        
        if (dolphinResult.success) {
            console.log(chalk.green(`✅ Dolphin Result (in ${dolphinTime}ms):`));
            console.log(chalk.yellow('Raw Dolphin Output:'), dolphinResult.content);
            
            // Parse the raw result
            const parsedDolphin = parseResponse(dolphinResult.content);
            console.log(chalk.gray(`Parsed - A: ${parsedDolphin.aktivitas.length}, P: ${parsedDolphin.pembelajaran.length}, K: ${parsedDolphin.kendala.length}\n`));
            
            // Step 2: Improve with Gimita Gemini
            console.log(chalk.cyan('Step 2: Improving with Gimita Gemini...'));
            const improvementContext = "Perbaiki agar lebih koheren, profesional, dan sesuai dengan format yang diminta.";
            const improvementStartTime = Date.now();
            const improvedResult = await improveWithGimitaGemini(dolphinResult.content, improvementContext);
            const improvementTime = Date.now() - improvementStartTime;
            
            if (improvedResult.success) {
                console.log(chalk.green(`✅ Improved Result (in ${improvementTime}ms):`));
                const parsedImproved = parseResponse(improvedResult.content);
                
                console.log(chalk.yellow('AKTIVITAS:'), parsedImproved.aktivitas);
                console.log(chalk.yellow('PEMBELAJARAN:'), parsedImproved.pembelajaran);
                console.log(chalk.yellow('KENDALA:'), parsedImproved.kendala);
                console.log(chalk.gray(`Lengths - A: ${parsedImproved.aktivitas.length}, P: ${parsedImproved.pembelajaran.length}, K: ${parsedImproved.kendala.length}`));
                
                // Calculate total time
                const totalTime = dolphinTime + improvementTime;
                console.log(chalk.blue(`\n⏱️  Total time: ${totalTime}ms`));
                
                // Save results
                const results = {
                    originalPrompt: combinedPrompt,
                    dolphin: {
                        raw: dolphinResult.content,
                        parsed: parsedDolphin,
                        time: dolphinTime
                    },
                    improved: {
                        raw: improvedResult.content,
                        parsed: parsedImproved,
                        time: improvementTime
                    },
                    totalTime: totalTime
                };
                
                fs.writeFileSync('hybrid_approach_results.json', JSON.stringify(results, null, 2));
                console.log(chalk.blue('\n💾 Detailed results saved to hybrid_approach_results.json'));
            } else {
                console.log(chalk.red(`❌ Improvement failed: ${improvedResult.error}`));
            }
        } else {
            console.log(chalk.red(`❌ Dolphin failed: ${dolphinResult.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Error in hybrid approach: ${error.message}`));
    }
}

// Run the test
testHybridApproach()
    .then(() => console.log(chalk.blue('\n✅ Hybrid approach test completed!')))
    .catch(error => console.error(chalk.red('\n❌ Error in hybrid approach test:'), error));