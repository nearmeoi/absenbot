/**
 * Show Generated Results Comparison
 * Displays the actual generated attendance reports from both APIs
 */

require('dotenv').config();
const aiService = require('./src/services/aiService');
const callGimitaGemini = aiService.callGimitaGemini;
const callGimitaDolphin = aiService.callGimitaDolphin;
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

async function showGeneratedResults() {
    console.log(chalk.blue('🔍 Showing Generated Results Comparison'));
    console.log(chalk.blue('=====================================\n'));
    
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    // Test Gimita Gemini
    console.log(chalk.cyan('Testing Gimita Gemini...'));
    try {
        const geminiResult = await callGimitaGemini(combinedPrompt);
        if (geminiResult.success) {
            const parsedResponse = parseResponse(geminiResult.content);
            console.log(chalk.green('✅ GIMITA GEMINI RESULT:'));
            console.log(chalk.yellow('AKTIVITAS:'), parsedResponse.aktivitas);
            console.log(chalk.yellow('PEMBELAJARAN:'), parsedResponse.pembelajaran);
            console.log(chalk.yellow('KENDALA:'), parsedResponse.kendala);
            console.log(chalk.gray(`Lengths - A: ${parsedResponse.aktivitas.length}, P: ${parsedResponse.pembelajaran.length}, K: ${parsedResponse.kendala.length}\n`));
        } else {
            console.log(chalk.red(`❌ Gimita Gemini: Failed - ${geminiResult.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Gimita Gemini: Error - ${error.message}`));
    }
    
    // Test Gimita Dolphin
    console.log(chalk.cyan('Testing Gimita Dolphin...'));
    try {
        const dolphinResult = await callGimitaDolphin(combinedPrompt);
        if (dolphinResult.success) {
            const parsedResponse = parseResponse(dolphinResult.content);
            console.log(chalk.green('✅ GIMITA DOLPHIN RESULT:'));
            console.log(chalk.yellow('AKTIVITAS:'), parsedResponse.aktivitas);
            console.log(chalk.yellow('PEMBELAJARAN:'), parsedResponse.pembelajaran);
            console.log(chalk.yellow('KENDALA:'), parsedResponse.kendala);
            console.log(chalk.gray(`Lengths - A: ${parsedResponse.aktivitas.length}, P: ${parsedResponse.pembelajaran.length}, K: ${parsedResponse.kendala.length}\n`));
        } else {
            console.log(chalk.red(`❌ Gimita Dolphin: Failed - ${dolphinResult.error}`));
        }
    } catch (error) {
        console.log(chalk.red(`❌ Gimita Dolphin: Error - ${error.message}`));
    }
    
    // Save results to file for reference
    const results = {
        prompt: combinedPrompt,
        gemini: null,
        dolphin: null
    };
    
    try {
        const geminiResult = await callGimitaGemini(combinedPrompt);
        if (geminiResult.success) {
            results.gemini = parseResponse(geminiResult.content);
        }
    } catch (e) {
        results.gemini = { error: e.message };
    }
    
    try {
        const dolphinResult = await callGimitaDolphin(combinedPrompt);
        if (dolphinResult.success) {
            results.dolphin = parseResponse(dolphinResult.content);
        }
    } catch (e) {
        results.dolphin = { error: e.message };
    }
    
    fs.writeFileSync('generated_results_comparison.json', JSON.stringify(results, null, 2));
    console.log(chalk.blue('\n💾 Detailed results saved to generated_results_comparison.json'));
}

// Run the comparison
showGeneratedResults()
    .then(() => console.log(chalk.blue('\n✅ Results display completed!')))
    .catch(error => console.error(chalk.red('\n❌ Error displaying results:'), error));