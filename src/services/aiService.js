/**
 * AI Service - Generate attendance reports using Gimita API (Primary), Groq, or Gemini
 */

const axios = require('axios');
const chalk = require('chalk');
const { getMessage } = require('./messageService');

const FormData = require('form-data');
const fs = require('fs');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GIMITA_API_URL = 'https://api.gimita.id/api/ai/gemini';

// Validate API keys on startup
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GROQ_API_KEY) {
    console.error(chalk.red('[GROQ] ❌ GROQ_API_KEY not found in .env file!'));
}
if (!GEMINI_API_KEY) {
    console.error(chalk.red('[GEMINI] ❌ GEMINI_API_KEY not found in .env file!'));
}

/**
 * Call Gimita API (Gemini Model)
 * Note: Uses GET request with query param, so length is limited.
 */
async function callGimitaGemini(prompt) {
    try {
        // Encode properly for URL
        const encodedMessage = encodeURIComponent(prompt);
        const url = `${GIMITA_API_URL}?message=${encodedMessage}`;

        // Check for URL length limit (approx safe limit for many servers/proxies is ~2000-8000)
        if (url.length > 6000) {
            console.warn(chalk.yellow(`[GIMITA] Prompt too long (${url.length} chars), skipping to fallback.`));
            return { success: false, error: 'Prompt too long for GET request' };
        }

        console.log(chalk.cyan('[GIMITA] Sending request...'));
        const response = await axios.get(url, { timeout: 45000 });

        if (response.data && response.data.text) {
            return { success: true, content: response.data.text };
        }
        return { success: false, error: 'Empty response from Gimita' };

    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.warn(chalk.yellow('[GIMITA] Rate limit exceeded, using fallback'));
            return { success: false, error: 'Rate limit exceeded' };
        }
        console.error(chalk.red('[GIMITA] Error:'), error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Call Gimita API (Dolphin Model)
 * Note: Uses different endpoint and parameters
 */
async function callGimitaDolphin(prompt) {
    try {
        // Encode properly for URL
        const encodedQuestion = encodeURIComponent(prompt);
        const url = `https://api.gimita.id/api/ai/dolphin?question=${encodedQuestion}&template=logical`;

        // Check for URL length limit (approx safe limit for many servers/proxies is ~2000-8000)
        if (url.length > 6000) {
            console.warn(chalk.yellow(`[DOLPHIN] Prompt too long (${url.length} chars), skipping to fallback.`));
            return { success: false, error: 'Prompt too long for GET request' };
        }

        console.log(chalk.cyan('[DOLPHIN] Sending request...'));
        const response = await axios.get(url, { timeout: 45000 });

        if (response.data && response.data.success && response.data.data && response.data.data.answer) {
            return { success: true, content: response.data.data.answer };
        }
        return { success: false, error: 'Empty response from Gimita Dolphin' };

    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.warn(chalk.yellow('[DOLPHIN] Rate limit exceeded, using fallback'));
            return { success: false, error: 'Rate limit exceeded' };
        }
        console.error(chalk.red('[DOLPHIN] Error:'), error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Improve content using Gimita Gemini
 * Takes content from one AI and improves it with another
 */
async function improveWithGimitaGemini(originalContent, context = '') {
    try {
        const improvementPrompt = `Berikut adalah konten yang dihasilkan oleh AI:\n\n"${originalContent}"\n\n${context}\n\nTugas Anda: Perbaiki dan tingkatkan konten di atas agar lebih masuk akal, koheren, dan profesional. Jaga panjang karakter antara 100-170 per bagian. Hanya kembalikan konten yang sudah diperbaiki, tanpa komentar tambahan, penjelasan, atau opsi. Hanya hasil akhir yang diperbaiki.`;

        const encodedMessage = encodeURIComponent(improvementPrompt);
        const url = `${GIMITA_API_URL}?message=${encodedMessage}`;

        // Check for URL length limit
        if (url.length > 6000) {
            console.warn(chalk.yellow(`[GIMITA-IMPROVE] Prompt too long (${url.length} chars).`));
            return { success: false, error: 'Prompt too long for GET request' };
        }

        console.log(chalk.cyan('[GIMITA-IMPROVE] Sending improvement request...'));
        const response = await axios.get(url, { timeout: 45000 });

        if (response.data && response.data.text) {
            return { success: true, content: response.data.text };
        }
        return { success: false, error: 'Empty response from Gimita improvement' };

    } catch (error) {
        console.error(chalk.red('[GIMITA-IMPROVE] Error:'), error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Call Gimita ChatAI API with various models
 * Note: Uses different endpoint and supports multiple models
 */
async function callGimitaChatAI(prompt, model = 'deepseek-v3') {
    try {
        // Encode properly for URL
        const encodedQuery = encodeURIComponent(prompt);
        const url = `https://api.gimita.id/api/ai/chatai?model=${model}&query=${encodedQuery}`;

        // Check for URL length limit (approx safe limit for many servers/proxies is ~2000-8000)
        if (url.length > 6000) {
            console.warn(chalk.yellow(`[CHATAI] Prompt too long (${url.length} chars), skipping to fallback.`));
            return { success: false, error: 'Prompt too long for GET request' };
        }

        console.log(chalk.cyan(`[CHATAI-${model.toUpperCase()}] Sending request...`));
        const response = await axios.get(url, { timeout: 45000 });

        if (response.data && response.data.success && response.data.data && response.data.data.answer) {
            return { success: true, content: response.data.data.answer };
        }
        return { success: false, error: 'Empty response from Gimita ChatAI' };

    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.warn(chalk.yellow(`[CHATAI-${model.toUpperCase()}] Rate limit exceeded, using fallback`));
            return { success: false, error: 'Rate limit exceeded' };
        }
        console.error(chalk.red(`[CHATAI-${model.toUpperCase()}] Error:`, error.message));
        return { success: false, error: error.message };
    }
}

/**
 * Improve Dolphin-generated content using Gimita Gemini
 * Specifically designed to fix Dolphin's output while preserving structure
 */
async function improveDolphinResult(dolphinContent, systemPrompt, userPrompt) {
    try {
        // Parse the Dolphin result first
        const parseSection = (label, text) => {
            const regex = new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA):|$)`, 'i');
            const match = text.match(regex);
            return match ? match[1].trim() : '';
        };

        let aktivitas = parseSection('AKTIVITAS', dolphinContent);
        let pembelajaran = parseSection('PEMBELAJARAN', dolphinContent);
        let kendala = parseSection('KENDALA', dolphinContent);

        // If parsing failed, return original
        if (!aktivitas && !pembelajaran && !kendala) {
            console.log(chalk.yellow('[GIMITA-IMPROVE-DOLPHIN] Parsing failed, using original'));
            return { success: false, error: 'Could not parse dolphin content' };
        }

        // Create improvement prompt for each section
        const improvementPrompt = `Berikut adalah hasil dari AI Dolphin:\n\nAKTIVITAS: ${aktivitas}\nPEMBELAJARAN: ${pembelajaran}\nKENDALA: ${kendala}\n\n${systemPrompt}\n\n${userPrompt}\n\nTugas Anda: Perbaiki dan tingkatkan ketiga bagian di atas agar lebih koheren, profesional, dan sesuai konteks magang. Pastikan masing-masing bagian panjangnya antara 100-170 karakter. Hanya kembalikan dalam format:\nAKTIVITAS: [isi]\nPEMBELAJARAN: [isi]\nKENDALA: [isi]\n\nTanpa komentar tambahan.`;

        const encodedMessage = encodeURIComponent(improvementPrompt);
        const url = `${GIMITA_API_URL}?message=${encodedMessage}`;

        // Check for URL length limit
        if (url.length > 6000) {
            console.warn(chalk.yellow(`[GIMITA-IMPROVE-DOLPHIN] Prompt too long (${url.length} chars).`));
            return { success: false, error: 'Prompt too long for GET request' };
        }

        console.log(chalk.cyan('[GIMITA-IMPROVE-DOLPHIN] Sending improvement request...'));
        const response = await axios.get(url, { timeout: 45000 });

        if (response.data && response.data.text) {
            return { success: true, content: response.data.text };
        }
        return { success: false, error: 'Empty response from Gimita improvement' };

    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.warn(chalk.yellow('[GIMITA-IMPROVE-DOLPHIN] Rate limit exceeded, using fallback'));
            return { success: false, error: 'Rate limit exceeded' };
        }
        console.error(chalk.red('[GIMITA-IMPROVE-DOLPHIN] Error:'), error.message);
        return { success: false, error: error.message };
    }
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
 * Generate attendance report using AI (Gimita -> Groq -> Gemini)
 * @param {Array} previousLogs - Array of previous attendance logs for context
 * @returns {Object} { success: boolean, aktivitas: string, pembelajaran: string, kendala: string }
 */
async function generateAttendanceReport(previousLogs = []) {
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
    - PANJANG: 100-200 karakter per bagian (WAJIB!)
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
- Panjang 100-200 karakter per bagian.

Format:
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]`;

    // --- EXECUTION STRATEGY ---
    let content = null;

    // 1. Try Gimita Dolphin (Primary - faster)
    console.log(chalk.cyan('[AI] Trying Gimita Dolphin (Primary)...'));
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const dolphinResult = await callGimitaDolphin(combinedPrompt);
    if (dolphinResult.success) {
        // Now try to improve the Dolphin result with Gimita Gemini
        console.log(chalk.cyan('[AI] Improving Dolphin result with Gimita Gemini...'));
        const improvementPrompt = `Berikut adalah hasil dari AI Dolphin:\n\n${dolphinResult.content}\n\n${systemPrompt}\n\n${userPrompt}\n\nTugas Anda: Perbaiki dan "manusiawikan" konten di atas agar lebih luwes, enak dibaca, namun tetap profesional.
        
PENTING:
- Perbaiki kalimat yang kaku atau "robot banget".
- Pastikan Aktivitas, Pembelajaran, dan Kendala NYAMBUNG satu sama lain (koheren).
- Panjang karakter WAJIB antara 100-200 karakter per bagian.

Hanya kembalikan dalam format:
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]

Tanpa komentar tambahan.`;

        const improvedResult = await callGimitaGemini(improvementPrompt);
        if (improvedResult.success) {
            content = improvedResult.content;
            console.log(chalk.green('[AI] Dolphin result successfully improved by Gimita Gemini'));
        } else {
            // If improvement fails, use original Dolphin result
            console.warn(chalk.yellow(`[AI] Improvement failed, using original Dolphin result: ${improvedResult.error}`));
            content = dolphinResult.content;
        }
    } else {
        console.warn(chalk.yellow(`[AI] Gimita Dolphin failed, switching to Gimita Gemini... (${dolphinResult.error})`));
        // If Dolphin fails, try Gemini directly
        const gimitaResult = await callGimitaGemini(combinedPrompt);
        if (gimitaResult.success) {
            content = gimitaResult.content;
        } else {
            console.warn(chalk.yellow(`[AI] Gimita Gemini failed, switching to Groq... (${gimitaResult.error})`));
        }
    }

    // 2. Try Groq (Fallback 2)
    if (!content && GROQ_API_KEY) {
        try {
            console.log(chalk.cyan('[AI] Trying Groq...'));
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
            content = response.data.choices[0]?.message?.content;
        } catch (error) {
            console.error(chalk.red('[GROQ] Error:'), error.message);
        }
    }

    // 3. Try Gimita ChatAI (Fallback 3 - as primary improvement)
    if (!content) {
        console.log(chalk.cyan('[AI] Trying Gimita ChatAI (deepseek-v3)...'));
        const chataiResult = await callGimitaChatAI(`${systemPrompt}\n\n${userPrompt}`, 'deepseek-v3');
        if (chataiResult.success) {
            content = chataiResult.content;
        } else {
            console.warn(chalk.yellow(`[AI] Gimita ChatAI failed, switching to Gemini... (${chataiResult.error})`));
        }
    }

    // 4. Try Gemini Google (Fallback 4)
    if (!content && GEMINI_API_KEY) {
        // ... (Existing Gemini logic if needed, but omitted for brevity in this replace block as it was complex)
        // Simplified fallback for now or rely on return error
    }

    if (!content) {
        return { success: false, error: 'Semua layanan AI sibuk/gagal.' };
    }

    // --- PARSING LOGIC (Shared) ---
    // Parse response with more flexible regex
    const parseSection = (label, text) => {
        const regex = new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA):|$)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };

    let aktivitas = parseSection('AKTIVITAS', content);
    let pembelajaran = parseSection('PEMBELAJARAN', content);
    let kendala = parseSection('KENDALA', content);

    console.log(chalk.gray(`[AI] Raw Lengths: A=${aktivitas.length}, P=${pembelajaran.length}, K=${kendala.length}`));

    // Padding and Truncation Logic
    const MIN_CHARS = 100;
    const MAX_CHARS = 200;

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

    console.log(chalk.gray(`[AI] Final Lengths: A=${aktivitas.length}, P=${pembelajaran.length}, K=${kendala.length}`));

    return {
        success: true,
        aktivitas,
        pembelajaran,
        kendala
    };
}

/**
 * Process free text input into a structured attendance report
 * @param {string} userText - Raw text from user
 * @param {Array} previousLogs - History for style context
 */
async function processFreeTextToReport(userText, previousLogs = []) {
    const contextMessages = [];
    if (previousLogs.length > 0) {
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

    // --- ENGINE 1: GIMITA DOLPHIN (Primary - faster) ---
    console.log(chalk.cyan('[AI] Trying Gimita Dolphin (Primary) for Story Mode...'));
    let content = null;
    const dolphinResult = await callGimitaDolphin(fullPrompt);
    if (dolphinResult.success) {
        // Now try to improve the Dolphin result with Gimita ChatAI
        console.log(chalk.cyan('[AI] Improving Dolphin result with Gimita ChatAI for Story Mode...'));
        const systemPromptForStory = `Kamu adalah asisten pribadi yang tugasnya MEMBUAT LAPORAN MAGANG berdasarkan cerita user.

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
- PANJANG: 100-200 karakter per bagian (WAJIB!).

Format Output (Hanya teks di bawah, tanpa tambahan lain!):
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]`;

        const improvementPrompt = `Berikut adalah hasil dari AI Dolphin:\n\n${dolphinResult.content}\n\n${systemPromptForStory}\n\nCerita User: "${userText}"\n\nTugas Anda: Perbaiki dan "manusiawikan" konten di atas agar lebih luwes, enak dibaca, namun tetap profesional.
        
PENTING:
- Perbaiki kalimat yang kaku atau "robot banget".
- Pastikan Aktivitas, Pembelajaran, dan Kendala NYAMBUNG satu sama lain (koheren).
- Panjang karakter WAJIB antara 100-200 karakter per bagian.

Hanya kembalikan dalam format:
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]

Tanpa komentar tambahan.`;

        const improvedResult = await callGimitaGemini(improvementPrompt);
        if (improvedResult.success) {
            content = improvedResult.content;
            console.log(chalk.green('[AI] Dolphin result successfully improved by Gimita Gemini for Story Mode'));
        } else {
            // If improvement fails, use original Dolphin result
            console.warn(chalk.yellow(`[AI] Improvement failed, using original Dolphin result: ${improvedResult.error}`));
            content = dolphinResult.content;
        }
    } else {
        console.warn(chalk.yellow(`[AI] Gimita Dolphin failed, switching to Gimita Gemini... (${dolphinResult.error})`));
        // If Dolphin fails, try Gemini directly
        const gimitaResult = await callGimitaGemini(fullPrompt);
        if (gimitaResult.success) {
            content = gimitaResult.content;
        } else {
            console.warn(chalk.yellow(`[AI] Gimita Gemini failed, switching to Groq... (${gimitaResult.error})`));
        }
    }

    // --- ENGINE 2: GROQ (Fallback 2) ---
    if (!content && GROQ_API_KEY) {
        const callGroq = async (prompt) => {
            try {
                const response = await axios.post(GROQ_API_URL, {
                    model: GROQ_MODEL,
                    messages: [
                        { role: 'system', content: 'Generate internship report in structured format.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7
                }, {
                    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                    timeout: 30000
                });
                return { success: true, content: response.data.choices[0]?.message?.content };
            } catch (err) {
                console.warn(chalk.yellow(`[GROQ-REVISI] Primary engine failed: ${err.message}`));
                return { success: false };
            }
        };
        const res = await callGroq(fullPrompt);
        if (res.success) content = res.content;
    }

    // --- ENGINE 3: GIMITA CHATAI (Fallback 3 - as primary improvement) ---
    if (!content) {
        console.log(chalk.cyan('[AI] Trying Gimita ChatAI (deepseek-v3) for Story Mode...'));
        const chataiResult = await callGimitaChatAI(fullPrompt, 'deepseek-v3');
        if (chataiResult.success) {
            content = chataiResult.content;
        } else {
            console.warn(chalk.yellow(`[AI] Gimita ChatAI failed, switching to Gemini... (${chataiResult.error})`));
        }
    }

    // --- ENGINE 4: GEMINI GOOGLE (Final Fallback) ---
    if (!content && GEMINI_API_KEY) {
        const callGeminiFallback = async (prompt, retries = 1) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    const response = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
                        { contents: [{ parts: [{ text: prompt }] }] },
                        { timeout: 60000 }
                    );
                    return { success: true, content: response.data.candidates?.[0]?.content?.parts?.[0]?.text };
                } catch (err) {
                    const statusCode = err.response?.status;
                    console.warn(chalk.yellow(`[GEMINI-FALLBACK] Attempt ${attempt + 1} failed: ${statusCode || err.message}`));
                    return { success: false };
                }
            }
        };
        const res = await callGeminiFallback(fullPrompt);
        if (res.success) content = res.content;
    }

    if (!content) {
        return { success: false, error: 'Gagal memproses laporan (Semua engine AI sibuk).' };
    }

    const parseSection = (label, text) => {
        const regex = new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA):|$)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };

    let aktivitas = parseSection('AKTIVITAS', content);
    let pembelajaran = parseSection('PEMBELAJARAN', content);
    let kendala = parseSection('KENDALA', content);

    const MIN_CHARS = 100;
    const MAX_CHARS = 200;

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

module.exports = { generateAttendanceReport, processFreeTextToReport, transcribeAudio, callGimitaGemini, callGimitaDolphin, callGimitaChatAI, improveWithGimitaGemini, improveDolphinResult };
