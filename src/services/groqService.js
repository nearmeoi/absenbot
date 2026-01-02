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

    const systemPrompt = `Kamu membantu membuat laporan magang harian. 
TUGAS UTAMA: 
1. Analisis gaya bahasa, kosakata, dan kata-kata yang sering digunakan user dari riwayat laporan yang diberikan.
2. Tiru gaya penulisan tersebut agar laporan terasa natural (seperti ditulis oleh user sendiri).
3. PENTING: Setiap bagian WAJIB 100-150 karakter. TIDAK BOLEH lebih dari 150 karakter!

ATURAN:
- Jika user sering menggunakan istilah teknis tertentu, gunakan kembali.
- Sebut pembimbing sebagai "co mentor" kecuali user punya sebutan khusus di riwayatnya.
- Tulis santai tapi sopan, tanpa menggunakan kata ganti orang pertama (aku/saya).
- Buat kalimat yang padat dan efisien, 100-150 karakter saja.`;

    const userPrompt = `${context}

Berdasarkan riwayat di atas, buatkan laporan magang hari ini dengan GAYA PENULISAN YANG SAMA. 
PENTING: Setiap bagian HARUS 100-150 karakter. JANGAN lebih dari 150!

Format balasan:
AKTIVITAS: [isi 100-150 karakter]
PEMBELAJARAN: [isi 100-150 karakter]
KENDALA: [isi 100-150 karakter]`;

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

        const pad = (text, type) => {
            // Truncate if too long
            if (text.length > MAX_CHARS) {
                return text.substring(0, MAX_CHARS).trim();
            }

            // Pad if too short
            if (text.length < MIN_CHARS) {
                const extra = {
                    A: " dan melakukan koordinasi dengan tim.",
                    P: " serta memberikan wawasan baru.",
                    K: " namun dapat diatasi dengan baik."
                };

                let padded = text;
                while (padded.length < MIN_CHARS && padded.length < MAX_CHARS) {
                    padded += extra[type];
                }

                // Final truncate if still over
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

    const systemPrompt = `Kamu adalah asisten MagangHub. 
TUGAS: Mengubah cerita singkat user menjadi laporan magang formal (AKTIVITAS, PEMBELAJARAN, KENDALA).
SYARAT MUTLAK: 
1. Setiap bagian WAJIB 100-150 karakter. TIDAK BOLEH lebih dari 150!
2. Jika cerita user terlalu pendek, kembangkan dengan kalimat deskriptif yang relevan dan profesional.
3. Tiru kosakata dan gaya bahasa user dari riwayat yang diberikan.
4. Gunakan sudut pandang orang ketiga (jangan pakai "aku/saya"). Sebut pembimbing "co mentor".`;

    const userPrompt = `${context}
Cerita User: "${userText}"

Buatkan laporan berdasarkan cerita di atas. PENTING: 100-150 karakter per bagian, JANGAN lebih!

Format:
AKTIVITAS: [isi 100-150 karakter]
PEMBELAJARAN: [isi 100-150 karakter]
KENDALA: [isi 100-150 karakter]`;

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

        const pad = (text, type) => {
            if (text.length > MAX_CHARS) {
                return text.substring(0, MAX_CHARS).trim();
            }

            if (text.length < MIN_CHARS) {
                const extra = {
                    A: " dan melakukan koordinasi dengan tim.",
                    P: " serta memberikan wawasan baru.",
                    K: " namun dapat diatasi dengan baik."
                };

                let padded = text;
                while (padded.length < MIN_CHARS && padded.length < MAX_CHARS) {
                    padded += extra[type];
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
