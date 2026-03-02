/**
 * AI Service - Generate attendance reports using Groq (Primary)
 */

const axios = require('axios');
const chalk = require('chalk');
const { getMessage } = require('./messageService');
const { AI_CONFIG } = require('../config/constants');

const FormData = require('form-data');
const fs = require('fs');

// Use constants from config
const GROQ_API_URL = AI_CONFIG.GROQ.API_URL;
const GROQ_AUDIO_URL = AI_CONFIG.GROQ.AUDIO_URL;
const GROQ_MODEL = AI_CONFIG.GROQ.MODEL;

// Validate API keys on startup
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function runGeminiGeneration(systemPrompt, userPrompt) {
    if (!GEMINI_API_KEY) return { success: false };
    try {
        console.log(chalk.cyan('[AI] Trying Gemini...'));
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await axios.post(url, {
            contents: [{
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 800,
            }
        }, { timeout: 30000 });

        const content = response.data.candidates[0]?.content?.parts[0]?.text;
        return { success: !!content, content };
    } catch (err) {
        console.warn(chalk.yellow(`[GEMINI] Fallback engine failed: ${err.message}`));
        return { success: false };
    }
}

async function runBlackboxGeneration(systemPrompt, userPrompt) {
    try {
        console.log(chalk.cyan('[AI] Trying Blackbox...'));
        const response = await axios.post('https://www.blackbox.ai/api/chat', {
            messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}`, id: 'absenbot_web' }],
            id: 'absenbot_web',
            codeModelMode: false,
            trendingAgentMode: {},
            isMicMode: false,
            maxTokens: 1024,
            isChromeExt: false,
            githubToken: '',
            clickedForceWebSearch: false,
            visitFromDelta: true,
            isMemoryEnabled: false,
            mobileClient: true,
            validated: 'a38f5889-8fef-46d4-8ede-bf4668b6a9bb',
            imageGenerationMode: false,
            webSearchModePrompt: false,
            deepSearchMode: false,
            vscodeClient: false,
            codeInterpreterMode: false,
            customProfile: {
                name: '',
                occupation: '',
                traits: [],
                additionalInfo: '',
                enableNewChats: false
            },
            webSearchModeOption: {
                autoMode: true,
                webMode: false,
                offlineMode: false
            },
            isPremium: false,
            beastMode: false,
            designerMode: false,
            asyncMode: false
        }, {
            headers: {
                'authority': 'www.blackbox.ai',
                'accept': '*/*',
                'content-type': 'application/json',
                'origin': 'https://www.blackbox.ai',
                'referer': 'https://www.blackbox.ai/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
            },
            timeout: 30000
        });

        let content = response.data;
        if (typeof content !== 'string') content = JSON.stringify(content);

        // Clean up blackbox specific markers if any
        content = content.replace(/\$~~~\$\[.*?\]\$~~~\$/gs, '');

        return { success: true, content };
    } catch (err) {
        console.warn(chalk.yellow(`[BLACKBOX] Fallback engine failed: ${err.message}`));
        return { success: false };
    }
}

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

// --- SHARED LOGIC ---

async function runGroqGeneration(systemPrompt, userPrompt) {
    // 1. Try Groq (Primary)
    if (GROQ_API_KEY) {
        try {
            console.log(chalk.cyan('[AI] Trying Groq...'));
            const response = await axios.post(GROQ_API_URL, {
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.6,
                max_tokens: 600
            }, {
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: AI_CONFIG.GROQ.TIMEOUT
            });
            const content = response.data.choices[0]?.message?.content;
            if (content) return { success: true, content };
        } catch (err) {
            console.warn(chalk.yellow(`[GROQ] Primary engine failed: ${err.message}`));
        }
    }

    // 2. Try Gemini (Secondary Fallback)
    const geminiRes = await runGeminiGeneration(systemPrompt, userPrompt);
    if (geminiRes.success) return geminiRes;

    // 3. Try Blackbox (Tertiary Fallback - No Key Needed)
    return await runBlackboxGeneration(systemPrompt, userPrompt);
}

async function runGroqRefinement(content, userStory, previousLogs) {
    if (!GROQ_API_KEY) return content;

    console.log(chalk.cyan('[AI] Groq Refinement (Double Check)...'));
    let historySummary = "-";
    if (previousLogs && previousLogs.length > 0) {
        historySummary = previousLogs.map(l => `[${l.date}] ${l.activity_log.substring(0, 50)}...`).join('; ');
    }

    const refinementPrompt = getMessage('AI_REFINEMENT_WITH_CONTEXT_PROMPT')
        .replace('{content}', content)
        .replace('{user_story}', userStory)
        .replace('{history_summary}', historySummary);

    try {
        const refineResponse = await axios.post(GROQ_API_URL, {
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: "Kamu adalah Supervisor Editor. Pastikan konten akurat, logis, dan TIDAK HALUSINASI." },
                { role: 'user', content: refinementPrompt }
            ],
            temperature: 0.5, // Lower temperature for accuracy
            max_tokens: AI_CONFIG.GROQ.MAX_TOKENS
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: AI_CONFIG.GROQ.TIMEOUT
        });

        const refined = refineResponse.data.choices[0]?.message?.content;
        if (refined) {
            console.log(chalk.green('[AI] Groq Refinement Successful.'));
            return refined;
        }
    } catch (e) {
        console.warn(chalk.yellow('[AI] Groq Refinement failed:'), e.message);
    }
    return content;
}

const parseAndClamp = (content) => {
    const parseSection = (label, text) => {
        try {
            // BACKSLASH-SAFE REGEX STRATEGY:
            // Avoid \s because of backslash hell. Use [ \t] instead.
            // Avoid [\s\S] because of backslash hell. Use [^] (any char).

            // Regex logic:
            // (?:^|[\n\r])  -> Start of line or string
            // [ \t]*        -> Optional spaces/tabs
            // [*#\-.0-9]*   -> Optional markdown/list markers
            // [ \t]*        -> Optional spaces/tabs
            // ${label}      -> "AKTIVITAS", etc
            // [*: ]*        -> Optional suffix (colon, star, space)
            // [ \t]*        -> Optional spaces/tabs
            // ([^]*?)       -> Capture EVERYTHING until...
            // (?=...)       -> Lookahead for next section header or end of string

            const regexStr = `(?:^|[\\n\\r])[ \t]*[*#\\-.0-9]*[ \t]*${label}[*: ]*[ \t]*([^]*?)(?=(?:^|[\\n\\r])[ \t]*[*#\\-.0-9]*[ \t]*(?:AKTIVITAS|PEMBELAJARAN|KENDALA)|$)`;

            const regex = new RegExp(regexStr, 'i');
            const match = text.match(regex);

            if (match && match[1] && match[1].trim().length > 0) {
                return match[1].trim();
            }
        } catch (e) {
            console.error(`[AI-PARSE] Error parsing ${label}:`, e.message);
        }
        return '';
    };

    let aktivitas = parseSection('AKTIVITAS', content);
    let pembelajaran = parseSection('PEMBELAJARAN', content);
    let kendala = parseSection('KENDALA', content);

    // FINAL FALLBACK: Manual line-by-line check if everything is empty
    if (!aktivitas && !pembelajaran && !kendala) {
        console.log(chalk.cyan('[AI-PARSE] Regex failed, using manual line split fallback...'));
        const lines = content.split('\n');
        let currentSection = null;

        // Reset variables for fallback
        let a_temp = '', p_temp = '', k_temp = '';

        lines.forEach(line => {
            const l = line.trim().toUpperCase();
            // Check headers with flexible matching
            if (l.match(/[*#\-.0-9]*\s*AKTIVITAS[*: ]*/)) {
                currentSection = 'A';
                // Remove header and keep content
                a_temp = line.replace(/.*AKTIVITAS[*: ]*/i, '').trim();
            }
            else if (l.match(/[*#\-.0-9]*\s*PEMBELAJARAN[*: ]*/)) {
                currentSection = 'P';
                p_temp = line.replace(/.*PEMBELAJARAN[*: ]*/i, '').trim();
            }
            else if (l.match(/[*#\-.0-9]*\s*KENDALA[*: ]*/)) {
                currentSection = 'K';
                k_temp = line.replace(/.*KENDALA[*: ]*/i, '').trim();
            }
            else if (currentSection && line.trim()) {
                // Append continuation lines
                if (currentSection === 'A') a_temp += ' ' + line.trim();
                else if (currentSection === 'P') p_temp += ' ' + line.trim();
                else if (currentSection === 'K') k_temp += ' ' + line.trim();
            }
        });

        if (a_temp) aktivitas = a_temp;
        if (p_temp) pembelajaran = p_temp;
        if (k_temp) kendala = k_temp;
    }

    const MAX_CHARS = AI_CONFIG.REPORT.MAX_CHARS;
    const clamp = (text) => {
        let result = (text || '').trim();
        if (result.length > MAX_CHARS) {
            result = result.substring(0, MAX_CHARS).trim();
            const lastSpace = result.lastIndexOf(' ');
            if (lastSpace > MAX_CHARS - AI_CONFIG.REPORT.TRUNCATE_BUFFER) result = result.substring(0, lastSpace);
        }
        return result;
    };

    return {
        success: true,
        aktivitas: clamp(aktivitas),
        pembelajaran: clamp(pembelajaran),
        kendala: clamp(kendala)
    };
};

/**
 * Generate attendance report (Manual Points)
 */
async function generateAttendanceReport(previousLogs = []) {
    // Build context
    let context = '';
    if (previousLogs.length > 0) {
        context = 'Berikut adalah riwayat laporan sebelumnya:\n\n';
        previousLogs.forEach((log, i) => {
            if (log && log.activity_log) {
                context += `--- ${log.date} ---\nAktivitas: ${log.activity_log}\nPembelajaran: ${log.lesson_learned}\nKendala: ${log.obstacles}\n\n`;
            }
        });
    }

    const systemPrompt = getMessage('AI_SYSTEM_PROMPT');
    const userPrompt = getMessage('AI_USER_PROMPT').replace('{context}', context);

    // 1. Try Groq
    let res = await runGroqGeneration(systemPrompt, userPrompt);
    let content = res.content;

    if (!content) return { success: false, error: 'Layanan AI sedang sibuk/gagal.' };

    // 2. Double Check
    content = await runGroqRefinement(content, "(Manual Input Context)", previousLogs);

    return parseAndClamp(content);
}

/**
 * Process free text input into a structured attendance report (Story Mode)
 * Optimized: skips separate refinement for short input, combines with expansion
 */
async function processFreeTextToReport(userText, previousLogs = []) {
    const contextMessages = [];
    if (previousLogs.length > 0) {
        let historyText = "RIWAYAT LAPORAN TERAKHIR USER:\n";
        previousLogs.forEach((log, i) => {
            historyText += `--- Log ${i + 1} (${log.date}) ---\nAktivitas: ${log.activity_log}\nPembelajaran: ${log.lesson_learned}\nKendala: ${log.obstacles}\n\n`;
        });

        // Truncate history to avoid URL length limits
        if (historyText.length > 2000) {
            historyText = historyText.substring(0, 2000) + "\n...(Riwayat dipotong)...";
        }
        contextMessages.push(historyText);
    }

    const systemPrompt = getMessage('AI_SYSTEM_PROMPT_STORY');
    const fullPrompt = `${contextMessages.join('\n')}\n\n${systemPrompt}\n\nCerita User: \"${userText}\"\n\nBuatkan laporan dengan gaya saya!`;

    // 1. Try Groq (Primary)
    let res = await runGroqGeneration(systemPrompt, fullPrompt);
    let content = res.content;

    if (!content) return { success: false, error: 'Gagal memproses laporan (Engine AI sibuk).' };

    // 3. Smart Refinement: Skip separate refinement if input is short
    //    (expansion will handle both refinement + lengthening in one call)
    const wordCount = userText.trim().split(/\s+/).length;
    const skipRefinement = wordCount < 50;

    if (!skipRefinement) {
        content = await runGroqRefinement(content, userText, previousLogs);
    }

    console.log(chalk.yellow('[AI-DEBUG] RAW CONTENT BEFORE PARSE:\n', content));

    let report = parseAndClamp(content);

    // --- COMBINED REFINEMENT + EXPANSION if sections too short ---
    if (GROQ_API_KEY && (report.aktivitas.length < 100 || report.pembelajaran.length < 100 || report.kendala.length < 100)) {
        console.log(chalk.cyan('[AI] Sections too short, running combined refinement+expansion...'));

        // For very short user input, allow more creative elaboration
        const isMinimalInput = wordCount < 10;
        const expansionPrompt = `Laporan magang ini perlu diperpanjang.${isMinimalInput ? `\nUser hanya bilang: "${userText}". Elaborasi dengan detail teknis yang WAJAR dan REALISTIS untuk kegiatan tersebut.` : `\nCERITA ASLI USER: "${userText}"`}

DRAFT SAAT INI:
AKTIVITAS: ${report.aktivitas}
PEMBELAJARAN: ${report.pembelajaran}
KENDALA: ${report.kendala}

INSTRUKSI:
1. Perpanjang SETIAP bagian agar mencapai 110-150 karakter.
2. Tambahkan detail teknis yang WAJAR dan REALISTIS sesuai konteks kegiatan.
3. JANGAN pakai kalimat klise/lebay ("tetap semangat", "mencari solusi terbaik", "tidak menyurutkan").
4. Tulis to-the-point, natural, profesional.
5. JANGAN PERNAH mempersingkat. Hanya PERPANJANG.

Format output:
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]`;

        try {
            const expandRes = await runGroqGeneration(
                "Kamu adalah Editor laporan magang. TUGASMU: perpanjang setiap bagian agar mencapai 110-150 karakter. Tambahkan detail teknis yang wajar. JANGAN PERNAH mempersingkat atau menghapus konten. Output HANYA format AKTIVITAS/PEMBELAJARAN/KENDALA.",
                expansionPrompt
            );

            if (expandRes.success && expandRes.content) {
                console.log(chalk.green('[AI] Combined refinement+expansion successful.'));
                report = parseAndClamp(expandRes.content);
            }
        } catch (e) {
            console.warn(chalk.yellow('[AI] Expansion failed:'), e.message);
        }
    }

    return report;
}

/**
 * Summarize Islamic Content (Hadith/Ayat)
 * @param {string} text - Full text
 * @returns {Promise<string>} - Summarized text (Hikmah/Intisari)
 */
async function summarizeIslamicContent(text) {
    // If text is short enough, return as is
    if (!text || text.length < 250) return text;

    console.log(chalk.cyan(`[AI] Summarizing Islamic content (${text.length} chars)...`));

    const prompt = `Ringkas hadits/ayat berikut menjadi 1-2 kalimat pendek yang berisi "Hikmah" atau "Intisari" utamanya saja.
    Jangan ubah makna. Bahasa Indonesia santai, ramah, tapi sopan. 
    JANGAN pakai emoji berlebihan (maksimal 1).
    JANGAN pakai kata pembuka "Berikut ringkasannya". Langsung isinya.
    
    Teks Asli: "${text}"`;

    if (GROQ_API_KEY) {
        try {
            const res = await axios.post(GROQ_API_URL, {
                model: 'llama3-8b-8192', // Fast model
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 150
            }, {
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 10000
            });
            const summary = res.data.choices[0]?.message?.content;
            if (summary) return summary.trim();
        } catch (e) {
            console.warn(chalk.yellow('[AI-SUMMARY] Groq failed.'));
        }
    }

    return text; // Return original if all fail
}

// Exports (Keep existing names)
module.exports = {
    generateAttendanceReport,
    processFreeTextToReport,
    summarizeIslamicContent,
    transcribeAudio,
    smartChat: async (prompt, systemPrompt = '') => {
        if (!GROQ_API_KEY) return { success: false, error: 'API key missing' };
        try {
            const res = await axios.post(GROQ_API_URL, {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    { role: 'user', content: prompt }
                ],
            }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` } });
            return { success: true, content: res.data.choices[0]?.message?.content, model: 'Groq' };
        } catch (e) {
            return { success: false, error: 'Busy' };
        }
    }
};
