/**
 * Groq AI Service - Generate attendance reports using Groq API
 * Free tier: 30 req/min, 14,400 req/day
 */

const axios = require('axios');
const chalk = require('chalk');

const FormData = require('form-data');
const fs = require('fs');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Validate API key on startup
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
    console.error(chalk.red('[GROQ] ❌ GROQ_API_KEY not found in .env file!'));
    console.error(chalk.yellow('[GROQ] Get your free API key at: https://console.groq.com'));
    process.exit(1);
}

/**
 * Transcribe audio file to text using Groq Whisper
 * @param {string} filePath - Path to the audio file
 * @returns {Object} { success: boolean, text: string }
 */
async function transcribeAudio(filePath) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        formData.append('model', 'whisper-large-v3-turbo');

        const response = await axios.post(GROQ_AUDIO_URL, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            }
        });

        return {
            success: true,
            text: response.data.text
        };
    } catch (error) {
        console.error(chalk.red('[GROQ] Transcribe Error:'), error.response?.data || error.message);
        return {
            success: false,
            error: 'Gagal mendengarkan VN Anda.'
        };
    }
}

/**
 * Detect team preference from user's history
 * Default: null (no team mention - optional)
 * Only use "teman" or "tim" if user explicitly mentioned it
 */
function detectTeamPreference(previousLogs = []) {
    if (!previousLogs || previousLogs.length === 0) {
        return null; // No history = no team mention
    }

    // Check if user ever mentioned "teman" or "tim" in their reports
    const allText = previousLogs.map(log => {
        return [log.activity_log, log.lesson_learned, log.obstacles].filter(Boolean).join(' ').toLowerCase();
    }).join(' ');

    // Check for "teman" first (more common in 2-person internship)
    if (allText.includes(' teman ') || allText.includes('teman ') || allText.includes(' teman')) {
        return 'teman';
    }

    // Check for "tim" (only if explicitly mentioned)
    if (allText.includes(' tim ') || allText.includes('tim ') || allText.includes(' tim')) {
        return 'tim';
    }

    // Default: no team mention (user works alone or doesn't mention collaboration)
    return null;
}

/**
 * Generate attendance report using Groq AI
 * @param {Array} previousLogs - Array of previous attendance logs for context
 * @returns {Object} { success: boolean, aktivitas: string, pembelajaran: string, kendala: string }
 */
async function generateAttendanceReport(previousLogs = []) {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        console.error(chalk.red('[GROQ] API key not configured'));
        return { success: false, error: 'GROQ_API_KEY tidak dikonfigurasi' };
    }

    // Build context from previous logs
    let context = '';
    if (previousLogs.length > 0) {
        context = 'Berikut adalah riwayat laporan sebelumnya:\n\n';
        previousLogs.forEach((log, i) => {
            if (log && log.activity_log) {
                context += `--- ${log.date} ---\n`;
                context += `Aktivitas: ${log.activity_log}\n`;
                if (log.lesson_learned) context += `Pembelajaran: ${log.lesson_learned}\n`;
                if (log.obstacles) context += `Kendala: ${log.obstacles}\n`;
                context += '\n';
            }
        });
    }

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

3. ATURAN PENULISAN:
   - Tetap profesional dan sopan
   - JANGAN terlalu gaul atau informal
   - JANGAN pakai kata robot seperti "melakukan koordinasi intensif" atau "memberikan wawasan mendalam yang komprehensif"
   - Tulis natural tapi tetap formal
   - PANJANG: 100-150 karakter per bagian (WAJIB!)

CONTOH ANALISIS KONSISTENSI:
Jika user sering pakai: "melakukan", "bersama tim", "sistem", "database"
Maka gunakan kata-kata tersebut dalam laporan baru.

Ingat: Tiru gaya user, jangan buat gaya sendiri!`;

    const userPrompt = `${context}

ANALISIS riwayat di atas dan temukan:
- Kata-kata apa yang SERING MUNCUL?
- Istilah teknis apa yang KONSISTEN dipakai?
- Bagaimana pola kalimat user?

Lalu buatkan laporan hari ini dengan GAYA YANG SAMA PERSIS.
Gunakan KATA-KATA YANG SAMA yang user sering pakai!

PENTING: 100-150 karakter per bagian, JANGAN lebih!

Format:
AKTIVITAS: [isi 100-150 karakter, pakai kata-kata user]
PEMBELAJARAN: [isi 100-150 karakter, pakai kata-kata user]
KENDALA: [isi 100-150 karakter, pakai kata-kata user]`;

    try {
        console.log(chalk.cyan('[GROQ] Generating attendance report...'));

        const response = await axios.post(GROQ_API_URL, {
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 1000
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const content = response.data.choices[0]?.message?.content;

        if (!content) {
            return { success: false, error: 'Response kosong dari Groq' };
        }

        // Parse response with more flexible regex
        const parseSection = (label, text) => {
            const regex = new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA):|$)`, 'i');
            const match = text.match(regex);
            return match ? match[1].trim() : '';
        };

        let aktivitas = parseSection('AKTIVITAS', content);
        let pembelajaran = parseSection('PEMBELAJARAN', content);
        let kendala = parseSection('KENDALA', content);

        console.log(chalk.gray(`[GROQ] Raw Lengths: A=${aktivitas.length}, P=${pembelajaran.length}, K=${kendala.length}`));

        // Padding and Truncation Logic
        const MIN_CHARS = 100;
        const MAX_CHARS = 150;

        // Detect team preference from history
        const teamPref = detectTeamPreference(previousLogs);

        const pad = (text, type) => {
            // Truncate if too long
            if (text.length > MAX_CHARS) {
                return text.substring(0, MAX_CHARS).trim();
            }

            // Pad if too short - add suffix ONCE, not in a loop
            if (text.length < MIN_CHARS) {
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

                let padded = text;
                let suffixIndex = 0;

                // Add suffixes one by one until min reached (max 2 suffixes)
                while (padded.length < MIN_CHARS && suffixIndex < suffixes[type].length) {
                    padded += suffixes[type][suffixIndex];
                    suffixIndex++;
                }

                // Final truncate if over max
                return padded.length > MAX_CHARS ? padded.substring(0, MAX_CHARS).trim() : padded;
            }

            return text;
        };

        if (aktivitas.length < MIN_CHARS) aktivitas = pad(aktivitas, 'A');
        if (pembelajaran.length < MIN_CHARS) pembelajaran = pad(pembelajaran, 'P');
        if (kendala.length < MIN_CHARS) kendala = pad(kendala, 'K');

        console.log(chalk.gray(`[GROQ] Final Lengths: A=${aktivitas.length}, P=${pembelajaran.length}, K=${kendala.length}`));

        return {
            success: true,
            aktivitas,
            pembelajaran,
            kendala
        };

    } catch (error) {
        console.error(chalk.red('[GROQ] Error:'), error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}

/**
 * Process free text input into a structured attendance report
 * @param {string} userText - Raw text from user
 * @param {Array} previousLogs - History for style context
 */
async function processFreeTextToReport(userText, previousLogs = []) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return { success: false, error: 'GROQ_API_KEY tidak dikonfigurasi' };

    let context = '';
    if (previousLogs.length > 0) {
        context = 'Riwayat gaya bahasa user:\n' + previousLogs.slice(0, 5).map(log => log.activity_log).join('\n') + '\n\n';
    }

    const systemPrompt = `Kamu membantu mengubah cerita singkat jadi laporan magang yang PROFESIONAL namun NATURAL.

ATURAN:
1. Analisis riwayat user (jika ada) untuk menemukan kata-kata yang sering dipakai
2. Gunakan kata-kata yang SAMA dengan yang user sering pakai
3. Tetap profesional dan sopan, JANGAN terlalu gaul
4. JANGAN pakai frasa robot seperti "melakukan koordinasi intensif yang komprehensif"
5. PANJANG: 100-150 karakter per bagian (WAJIB!)
6. KOLABORASI: Jangan sebut "teman" atau "tim" KECUALI user pernah menyebutnya di riwayat. Jika user kerja sendiri, jangan tambahkan elemen kolaborasi.

CONTOH YANG BAIK:
"Melakukan testing fitur login dan memperbaiki bug yang ditemukan"
"Belajar tentang authentication flow dan implementasi JWT"
"Kendala pada integrasi API, diselesaikan dengan bantuan mentor"`;

    const userPrompt = `${context}
Cerita User: "${userText}"

Buatkan laporan dari cerita di atas. 
Tetap profesional tapi natural, JANGAN terlalu gaul!
PENTING: 100-150 karakter per bagian, JANGAN lebih!

Format:
AKTIVITAS: [isi 100-150 karakter, profesional]
PEMBELAJARAN: [isi 100-150 karakter, profesional]
KENDALA: [isi 100-150 karakter, profesional]`;

    try {
        const response = await axios.post(GROQ_API_URL, {
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 30000
        });

        const content = response.data.choices[0]?.message?.content;
        if (!content) return { success: false, error: 'AI tidak merespon' };

        const parseSection = (label, text) => {
            const regex = new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA):|$)`, 'i');
            const match = text.match(regex);
            return match ? match[1].trim() : '';
        };

        let aktivitas = parseSection('AKTIVITAS', content);
        let pembelajaran = parseSection('PEMBELAJARAN', content);
        let kendala = parseSection('KENDALA', content);

        // Padding and Truncation
        const MIN_CHARS = 100;
        const MAX_CHARS = 150;

        // Detect team preference from history
        const teamPref = detectTeamPreference(previousLogs);

        const pad = (text, type) => {
            if (text.length > MAX_CHARS) {
                return text.substring(0, MAX_CHARS).trim();
            }

            if (text.length < MIN_CHARS) {
                const suffixes = {
                    A: [
                        " dan melakukan dokumentasi hasil kerja",
                        " serta melakukan review terhadap progress"
                    ],
                    P: [
                        " yang sangat bermanfaat untuk pengembangan skill",
                        " dan menambah wawasan tentang best practices"
                    ],
                    K: [
                        " dan semua berjalan lancar",
                        " sehingga pekerjaan dapat diselesaikan"
                    ]
                };

                let padded = text;
                let suffixIndex = 0;

                while (padded.length < MIN_CHARS && suffixIndex < suffixes[type].length) {
                    padded += suffixes[type][suffixIndex];
                    suffixIndex++;
                }

                return padded.length > MAX_CHARS ? padded.substring(0, MAX_CHARS).trim() : padded;
            }

            return text;
        };



        if (aktivitas.length < MIN_CHARS) aktivitas = pad(aktivitas, 'A');
        if (pembelajaran.length < MIN_CHARS) pembelajaran = pad(pembelajaran, 'P');
        if (kendala.length < MIN_CHARS) kendala = pad(kendala, 'K');

        return { success: true, aktivitas, pembelajaran, kendala };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = { generateAttendanceReport, processFreeTextToReport, transcribeAudio };
