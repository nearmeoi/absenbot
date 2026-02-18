/**
 * AI Service - Generate attendance reports using Groq (Primary), Gimita, or Gemini
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
const GIMITA_API_URL = AI_CONFIG.GIMITA.GEMINI_API_URL;

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
 */
async function callGimitaGemini(prompt) {
    try {
        const encodedMessage = encodeURIComponent(prompt);
        const url = `${GIMITA_API_URL}?message=${encodedMessage}`;

        if (url.length > AI_CONFIG.GIMITA.URL_LENGTH_LIMIT) {
            console.warn(chalk.yellow(`[GIMITA] Prompt too long (${url.length} chars), skipping to fallback.`));
            return { success: false, error: 'Prompt too long for GET request' };
        }

        console.log(chalk.cyan('[GIMITA] Sending request...'));
        const response = await axios.get(url, { timeout: AI_CONFIG.GIMITA.TIMEOUT });

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
 */
async function callGimitaDolphin(prompt) {
    try {
        const encodedQuestion = encodeURIComponent(prompt);
        const url = `${AI_CONFIG.GIMITA.DOLPHIN_API_URL}?question=${encodedQuestion}&template=logical`;

        if (url.length > AI_CONFIG.GIMITA.URL_LENGTH_LIMIT) {
            console.warn(chalk.yellow(`[DOLPHIN] Prompt too long (${url.length} chars), skipping to fallback.`));
            return { success: false, error: 'Prompt too long for GET request' };
        }

        console.log(chalk.cyan('[DOLPHIN] Sending request...'));
        const response = await axios.get(url, { timeout: AI_CONFIG.GIMITA.TIMEOUT });

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

async function callGimitaChatAI(prompt, model = 'deepseek-v3') {
    try {
        const encodedQuery = encodeURIComponent(prompt);
        const url = `${AI_CONFIG.GIMITA.CHATAI_API_URL}?model=${model}&query=${encodedQuery}`;

        if (url.length > AI_CONFIG.GIMITA.URL_LENGTH_LIMIT) {
            console.warn(chalk.yellow(`[CHATAI] Prompt too long (${url.length} chars), skipping to fallback.`));
            return { success: false, error: 'Prompt too long for GET request' };
        }

        console.log(chalk.cyan(`[CHATAI-${model.toUpperCase()}] Sending request...`));
        const response = await axios.get(url, { timeout: AI_CONFIG.GIMITA.TIMEOUT });

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
    if (!GROQ_API_KEY) return { success: false };
    try {
        console.log(chalk.cyan('[AI] Trying Groq (Primary)...'));
        const response = await axios.post(GROQ_API_URL, {
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: AI_CONFIG.GROQ.MAX_TOKENS
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: AI_CONFIG.GROQ.TIMEOUT
        });
        return { success: true, content: response.data.choices[0]?.message?.content };
    } catch (err) {
        console.warn(chalk.yellow(`[GROQ] Primary engine failed: ${err.message}`));
        return { success: false };
    }
}

async function runFallbackChain(systemPrompt, userPrompt) {
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // 1. Dolphin
    console.log(chalk.cyan('[AI] Fallback: Trying Gimita Dolphin...'));
    let result = await callGimitaDolphin(combinedPrompt);
    if (result.success) return { success: true, content: result.content };

    // 2. ChatAI (DeepSeek)
    console.log(chalk.cyan('[AI] Fallback: Trying Gimita ChatAI (DeepSeek)...'));
    result = await callGimitaChatAI(combinedPrompt, 'deepseek-v3');
    if (result.success) return { success: true, content: result.content };

    // 3. Gemini
    console.log(chalk.cyan('[AI] Fallback: Trying Gimita Gemini...'));
    result = await callGimitaGemini(combinedPrompt);
    if (result.success) return { success: true, content: result.content };

    return { success: false };
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

    // 2. Fallback
    if (!content) {
        res = await runFallbackChain(systemPrompt, userPrompt);
        content = res.content;
    }

    if (!content) return { success: false, error: 'Semua layanan AI sibuk/gagal.' };

    // 3. Double Check
    content = await runGroqRefinement(content, "(Manual Input Context)", previousLogs);

    return parseAndClamp(content);
}

/**
 * Process free text input into a structured attendance report (Story Mode)
 */
async function processFreeTextToReport(userText, previousLogs = []) {
    const contextMessages = [];
    if (previousLogs.length > 0) {
        let historyText = "RIWAYAT LAPORAN TERAKHIR USER:\n";
        previousLogs.forEach((log, i) => {
            historyText += `--- Log ${i + 1} (${log.date}) ---\nAktivitas: ${log.activity_log}\nPembelajaran: ${log.lesson_learned}\nKendala: ${log.obstacles}\n\n`;
        });

        // Truncate history to avoid URL length limits (approx 2000 chars safe for context)
        if (historyText.length > 2000) {
            historyText = historyText.substring(0, 2000) + "\n...(Riwayat dipotong)...";
        }
        contextMessages.push(historyText);
    }

    const systemPrompt = getMessage('AI_SYSTEM_PROMPT_STORY');
    const fullPrompt = `${contextMessages.join('\n')}\n\n${systemPrompt}\n\nCerita User: \"${userText}\"\n\nBuatkan laporan dengan gaya saya!`;

    // 1. Try Groq (Primary)
    let res = await runGroqGeneration(systemPrompt, fullPrompt); // Use systemPrompt for role, fullPrompt for user
    let content = res.content;

    // 2. Fallback
    if (!content) {
        res = await runFallbackChain(systemPrompt, fullPrompt);
        content = res.content;
    }

    if (!content) return { success: false, error: 'Gagal memproses laporan (Semua engine AI sibuk).' };

    // 3. Double Check (Refinement)
    content = await runGroqRefinement(content, userText, previousLogs);

    console.log(chalk.yellow('[AI-DEBUG] RAW CONTENT BEFORE PARSE:\n', content));

    let report = parseAndClamp(content);

    // --- FORCE EXPANSION IF BELOW 100 CHARS ---
    if (GROQ_API_KEY && (report.aktivitas.length < 100 || report.pembelajaran.length < 100 || report.kendala.length < 100)) {
        console.log(chalk.cyan('[AI] Some sections too short, performing Expansion Pass...'));

        const expansionPrompt = `Laporan ini terlalu singkat. Perpanjang bagian yang kurang agar mencapai 110-140 karakter dengan menambahkan detail profesional/faktual berdasarkan cerita: "${userText}". 
        PENTING: JANGAN LEBAY, jangan pakai kalimat klise (seperti "tetap semangat", "mencari solusi"). Cukup jelaskan prosesnya secara natural.
        
        Draft:
        AKTIVITAS: ${report.aktivitas}
        PEMBELAJARAN: ${report.pembelajaran}
        KENDALA: ${report.kendala}
        
        Kembalikan dalam format AKTIVITAS, PEMBELAJARAN, KENDALA.`;

        try {
            const expandRes = await axios.post(GROQ_API_URL, {
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: "Kamu adalah Senior Editor. Tugasmu memperjelas tulisan agar mencapai minimal 110 karakter tanpa tambahan kata-kata dramatis." },
                    { role: 'user', content: expansionPrompt }
                ],
                temperature: 0.5
            }, {
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: AI_CONFIG.GROQ.TIMEOUT
            });

            const expandedContent = expandRes.data.choices[0]?.message?.content;
            if (expandedContent) {
                console.log(chalk.green('[AI] Expansion Pass Successful.'));
                report = parseAndClamp(expandedContent);
            }
        } catch (e) {
            console.warn(chalk.yellow('[AI] Expansion Pass failed:'), e.message);
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

    // 1. Try Groq (Fastest)
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
            console.warn(chalk.yellow('[AI-SUMMARY] Groq failed, trying fallback...'));
        }
    }

    // 2. Fallback to Gimita (ChatAI)
    const res = await callGimitaChatAI(prompt, 'deepseek-v3');
    if (res.success) return res.content;

    return text; // Return original if all fail
}

// Exports (Keep existing names)
module.exports = {
    generateAttendanceReport,
    processFreeTextToReport,
    summarizeIslamicContent,
    transcribeAudio,
    callGimitaGemini,
    callGimitaDolphin,
    callGimitaChatAI,
    smartChat: async (prompt, systemPrompt = '') => {
        const full = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
        let r = await callGimitaDolphin(full);
        if (r.success) return { success: true, content: r.content, model: 'Dolphin' };
        r = await callGimitaChatAI(full, 'deepseek-v3');
        if (r.success) return { success: true, content: r.content, model: 'DeepSeek' };
        return { success: false, error: 'Busy' };
    }
};
