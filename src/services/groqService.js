/**
 * Groq AI Service - Generate attendance reports using Groq API
 * Free tier: 30 req/min, 14,400 req/day
 */

const axios = require('axios');
const chalk = require('chalk');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Model aktif terbaru

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

    const systemPrompt = `Kamu membantu membuat laporan magang harian SINGKAT.
Setiap bagian WAJIB 100-125 karakter saja. JANGAN LEBIH PANJANG!
Tulis santai tapi sopan, tanpa sudut pandang orang pertama (aku/saya).

ATURAN:
- JANGAN sebut pak/bu, sebut "co mentor"
- JANGAN sebut meeting (kerja sendiri/2 orang)
- Tulis langsung aksinya: "Mengerjakan..." bukan "Aku mengerjakan..."
- AKTIVITAS: pakai 2-3 poin pendek
- PEMBELAJARAN & KENDALA: 1 kalimat singkat saja`;

    const userPrompt = `${context}

Buatkan laporan magang dengan gaya santai. Minimal 100 karakter per bagian!

AKTIVITAS:
1. [kegiatan utama hari ini]
2. [kegiatan lain]
3. [tambahan jika perlu]

PEMBELAJARAN:
[Tulis dalam 1 paragraf singkat tanpa poin, minimal 100 karakter]

KENDALA:
[Tulis dalam 1 paragraf singkat tanpa poin, minimal 100 karakter]`;

    try {
        console.log(chalk.cyan('[GROQ] Generating attendance report...'));

        const response = await axios.post(GROQ_API_URL, {
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 1024
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const content = response.data.choices[0]?.message?.content;

        if (!content) {
            return { success: false, error: 'Response kosong dari Groq' };
        }

        // Parse response
        const aktivitasMatch = content.match(/AKTIVITAS:\s*([\s\S]*?)(?=PEMBELAJARAN:|$)/i);
        const pembelajaranMatch = content.match(/PEMBELAJARAN:\s*([\s\S]*?)(?=KENDALA:|$)/i);
        const kendalaMatch = content.match(/KENDALA:\s*([\s\S]*?)$/i);

        let aktivitas = aktivitasMatch ? aktivitasMatch[1].trim() : '';
        let pembelajaran = pembelajaranMatch ? pembelajaranMatch[1].trim() : '';
        let kendala = kendalaMatch ? kendalaMatch[1].trim() : '';

        console.log(chalk.gray(`[GROQ] Lengths: A=${aktivitas.length}, P=${pembelajaran.length}, K=${kendala.length}`));

        // Validate minimum 100 characters per section
        const MIN_CHARS = 100;

        if (aktivitas.length < MIN_CHARS || pembelajaran.length < MIN_CHARS || kendala.length < MIN_CHARS) {
            console.log(chalk.yellow('[GROQ] Content too short, padding...'));

            // Pad sections that are too short
            if (aktivitas.length < MIN_CHARS) {
                aktivitas = aktivitas + ' Melakukan koordinasi dengan tim terkait pekerjaan yang dilakukan hari ini.';
            }
            if (pembelajaran.length < MIN_CHARS) {
                pembelajaran = pembelajaran + ' Memahami lebih dalam tentang proses dan alur kerja di tempat magang.';
            }
            if (kendala.length < MIN_CHARS) {
                kendala = kendala + ' Perlu waktu untuk adaptasi dengan sistem dan prosedur yang berlaku.';
            }

            console.log(chalk.gray(`[GROQ] After padding: A=${aktivitas.length}, P=${pembelajaran.length}, K=${kendala.length}`));
        }

        // Final check - must be at least 100
        if (aktivitas.length < MIN_CHARS || pembelajaran.length < MIN_CHARS || kendala.length < MIN_CHARS) {
            return {
                success: false,
                error: `Gagal generate minimal 100 karakter. A=${aktivitas.length}, P=${pembelajaran.length}, K=${kendala.length}`
            };
        }

        console.log(chalk.green('[GROQ] Successfully generated report'));

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

module.exports = { generateAttendanceReport };
