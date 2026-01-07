/**
 * Groq AI Service - Generate attendance reports using Groq API
 * Free tier: 30 req/min, 14,400 req/day
 */

const axios = require('axios');
const chalk = require('chalk');
const { getMessage } = require('./messageService');

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

    const userPrompt = `${context}

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
        const MAX_CHARS = 170;

        // Detect team preference from history (for future use)
        // const teamPref = detectTeamPreference(previousLogs);

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

    // --- GEMINI IMPLEMENTATION (Style Adaptive) ---
    // User prefers "Ketepatan" (Accuracy) over Speed.
    // Gemini 1.5 Flash proved superior in mimicking user style.

    const contextMessages = [];
    if (previousLogs.length > 0) {
        // Construct history context for Gemini
        let historyText = "RIWAYAT LAPORAN TERAKHIR USER (Pelajari Gaya Bahasanya):\n";
        previousLogs.forEach((log, i) => {
            historyText += `--- Log ${i + 1} (${log.date}) ---\nAktivitas: ${log.activity_log}\nPembelajaran: ${log.lesson_learned}\nKendala: ${log.obstacles}\n\n`;
        });
        contextMessages.push(historyText);
    }

    const systemPrompt = `Kamu adalah asisten pribadi yang tugasnya MEMBUAT LAPORAN MAGANG berdasarkan cerita user.

INSTRUKSI UTAMA: "TIRU GAYA BAHASA USER"
1. Lihat "RIWAYAT LAPORAN TERAKHIR USER" di atas.
2. Analisis gaya penulisannya:
   - Apakah formal ("Uraian aktivitas...") atau santai?
   - Apakah pakai bullet points atau paragraf?
   - Kosa kata apa yang sering dipakai?
3. Buat laporan baru berdasarkan cerita user dengan GAYA YANG SAMA PERSIS dengan riwayat tersebut.

ATURAN LAIN:
- HANYA KELUARKAN LAPORAN. DILARANG menyertakan analisis, kata pengantar, atau penjelasan apa pun.
- PASTIKAN isi Aktivitas, Pembelajaran, dan Kendala SALING NYAMBUNG secara logis.
- JANGAN pakai gaya robot/default jika ada riwayat. Ikuti riwayat!
- Tetap sopan dan profesional (kecuali riwayat user sangat santai).
- PANJANG: 100-170 karakter per bagian (WAJIB!).

Format Output (Hanya teks di bawah, tanpa tambahan lain!):
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]`;

    const fullPrompt = `${contextMessages.join('\n')}\n\n${systemPrompt}\n\nCerita User: "${userText}"\n\nBuatkan laporan dengan gaya saya!`;

    // --- RATE LIMIT HANDLER ---
    const callGeminiWithRetry = async (prompt, retries = 1) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY}`,
                    { contents: [{ parts: [{ text: prompt }] }] },
                    { timeout: 60000 }
                );
                return { success: true, data: response.data };
            } catch (err) {
                const statusCode = err.response?.status;
                console.warn(chalk.yellow(`[GEMINI] Attempt ${attempt + 1} failed: ${statusCode || err.message}`));

                if (statusCode === 429 && attempt < retries) {
                    console.log(chalk.blue('[GEMINI] Rate limited. Waiting 15s before retry...'));
                    await new Promise(r => setTimeout(r, 15000));
                    continue;
                }
                // Log error for debugging, but don't expose to user
                console.error(chalk.red('[GEMINI] Final Error:'), err.response?.data || err.message);
                return { success: false, error: getMessage('ai_rate_limit') };
            }
        }
    };

    const geminiResult = await callGeminiWithRetry(fullPrompt);
    if (!geminiResult.success) {
        return { success: false, error: geminiResult.error };
    }

    const content = geminiResult.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return { success: false, error: getMessage('ai_empty_response') };

    const parseSection = (label, text) => {
        const regex = new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA):|$)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };

    let aktivitas = parseSection('AKTIVITAS', content);
    let pembelajaran = parseSection('PEMBELAJARAN', content);
    let kendala = parseSection('KENDALA', content);

    const MIN_CHARS = 100;
    const MAX_CHARS = 170;

    const clamp = (text, type) => {
        let result = text;
        if (result.length < MIN_CHARS) {
            const suffixes = {
                A: [" dan melakukan dokumentasi hasil kerja", " serta review progress"],
                P: [" bermanfaat untuk skill", " menambah wawasan best practices"],
                K: [" dan berjalan lancar", " sehingga selesai tepat waktu"]
            };
            let i = 0;
            while (result.length < MIN_CHARS && i < suffixes[type].length) {
                result += suffixes[type][i++];
            }
        }
        if (result.length > MAX_CHARS) {
            result = result.substring(0, MAX_CHARS).trim();
            const lastSpace = result.lastIndexOf(' ');
            if (lastSpace > MAX_CHARS - 20) result = result.substring(0, lastSpace);
        }
        return result;
    };

    aktivitas = clamp(aktivitas, 'A');
    pembelajaran = clamp(pembelajaran, 'P');
    kendala = clamp(kendala, 'K');

    return { success: true, aktivitas, pembelajaran, kendala };
}

module.exports = { generateAttendanceReport, processFreeTextToReport, transcribeAudio };
