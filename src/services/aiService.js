/**
 * AI Service - Generate attendance reports using OpenRouter (Primary) or Groq
 */

const axios = require('axios');
const chalk = require('chalk');
const { getMessage } = require('./messageService');
const { AI_CONFIG } = require('../config/constants');

const FormData = require('form-data');
const fs = require('fs');

// OpenRouter Config
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = AI_CONFIG.OPENROUTER.API_URL;
const OPENROUTER_MODEL = AI_CONFIG.OPENROUTER.MODEL;

// Groq Config
const GROQ_API_URL = AI_CONFIG.GROQ.API_URL;
const GROQ_AUDIO_URL = AI_CONFIG.GROQ.AUDIO_URL;
const GROQ_MODEL = AI_CONFIG.GROQ.MODEL;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!OPENROUTER_API_KEY && !GROQ_API_KEY) {
    console.error(chalk.red('[AI] ❌ No AI API keys found in .env file!'));
}

async function transcribeAudio(filePath) {
    if (!GROQ_API_KEY) return { success: false, error: 'Groq key missing for transcription' };
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

// --- GENERATION ENGINES ---

async function runOpenRouterGeneration(systemPrompt, userPrompt) {
    if (!OPENROUTER_API_KEY) return { success: false };
    try {
        console.log(chalk.cyan('[AI] Trying OpenRouter...'));
        const response = await axios.post(OPENROUTER_URL, {
            model: OPENROUTER_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        }, {
            headers: { 
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://monev-absenbot.my.id',
                'X-Title': 'AbsenBot'
            },
            timeout: AI_CONFIG.OPENROUTER.TIMEOUT
        });
        return { success: true, content: response.data.choices[0]?.message?.content, model: 'OpenRouter' };
    } catch (err) {
        console.warn(chalk.yellow(`[OPENROUTER] engine failed: ${err.response?.data?.error?.message || err.message}`));
        return { success: false };
    }
}

async function runGroqGeneration(systemPrompt, userPrompt) {
    if (!GROQ_API_KEY) return { success: false };
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
        return { success: true, content: response.data.choices[0]?.message?.content, model: 'Groq' };
    } catch (err) {
        console.warn(chalk.yellow(`[GROQ] engine failed: ${err.message}`));
        return { success: false };
    }
}

async function runAIRefinement(content, userStory, previousLogs) {
    console.log(chalk.cyan('[AI] Refinement (Double Check)...'));
    let historySummary = "-";
    if (previousLogs && previousLogs.length > 0) {
        historySummary = previousLogs.map(l => `[${l.date}] ${l.activity_log.substring(0, 50)}...`).join('; ');
    }

    const refinementPrompt = getMessage('AI_REFINEMENT_WITH_CONTEXT_PROMPT')
        .replace('{content}', content)
        .replace('{user_story}', userStory)
        .replace('{history_summary}', historySummary);

    const systemPrompt = "Kamu adalah Supervisor Editor. Pastikan konten akurat, logis, dan TIDAK HALUSINASI.";

    // Try OpenRouter first for refinement
    let res = await runOpenRouterGeneration(systemPrompt, refinementPrompt);
    if (!res.success) {
        res = await runGroqGeneration(systemPrompt, refinementPrompt);
    }

    if (res.success && res.content) {
        console.log(chalk.green(`[AI] Refinement Successful (${res.model}).`));
        return res.content;
    }
    
    return content;
}

const parseAndClamp = (content) => {
    const parseSection = (label, text) => {
        try {
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

    if (!aktivitas && !pembelajaran && !kendala) {
        console.log(chalk.cyan('[AI-PARSE] Regex failed, using manual line split fallback...'));
        const lines = content.split('\n');
        let currentSection = null;
        let a_temp = '', p_temp = '', k_temp = '';

        lines.forEach(line => {
            const l = line.trim().toUpperCase();
            if (l.match(/[*#\-.0-9]*\s*AKTIVITAS[*: ]*/)) {
                currentSection = 'A';
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

async function generateAttendanceReport(previousLogs = []) {
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

    // Prefer OpenRouter
    let res = await runOpenRouterGeneration(systemPrompt, userPrompt);
    if (!res.success) {
        res = await runGroqGeneration(systemPrompt, userPrompt);
    }

    let content = res.content;
    if (!content) return { success: false, error: 'Layanan AI sedang sibuk/gagal.' };

    content = await runAIRefinement(content, "(Manual Input Context)", previousLogs);
    return parseAndClamp(content);
}

async function processFreeTextToReport(userText, previousLogs = []) {
    const contextMessages = [];
    if (previousLogs.length > 0) {
        let historyText = "RIWAYAT LAPORAN TERAKHIR USER:\n";
        previousLogs.forEach((log, i) => {
            historyText += `--- Log ${i + 1} (${log.date}) ---\nAktivitas: ${log.activity_log}\nPembelajaran: ${log.lesson_learned}\nKendala: ${log.obstacles}\n\n`;
        });
        if (historyText.length > 2000) {
            historyText = historyText.substring(0, 2000) + "\n...(Riwayat dipotong)...";
        }
        contextMessages.push(historyText);
    }

    const systemPrompt = getMessage('AI_SYSTEM_PROMPT_STORY');
    const fullPrompt = `${contextMessages.join('\n')}\n\n${systemPrompt}\n\nCerita User: \"${userText}\"\n\nBuatkan laporan dengan gaya saya!`;

    // Prefer OpenRouter
    let res = await runOpenRouterGeneration(systemPrompt, fullPrompt);
    if (!res.success) {
        res = await runGroqGeneration(systemPrompt, fullPrompt);
    }

    let content = res.content;
    if (!content) return { success: false, error: 'Gagal memproses laporan (Engine AI sibuk).' };

    const wordCount = userText.trim().split(/\s+/).length;
    const skipRefinement = wordCount < 50;

    if (!skipRefinement) {
        content = await runAIRefinement(content, userText, previousLogs);
    }

    let report = parseAndClamp(content);

    // Expansion logic if needed
    if (report.aktivitas.length < 100 || report.pembelajaran.length < 100 || report.kendala.length < 100) {
        console.log(chalk.cyan('[AI] Sections too short, running expansion...'));
        const expansionPrompt = `Laporan magang ini perlu diperpanjang.
DRAFT SAAT INI:
AKTIVITAS: ${report.aktivitas}
PEMBELAJARAN: ${report.pembelajaran}
KENDALA: ${report.kendala}

INSTRUKSI:
1. Perpanjang SETIAP bagian agar mencapai 110-150 karakter.
2. Tambahkan detail teknis yang WAJAR dan REALISTIS.
Format output:
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]`;

        const expansionSystem = "Kamu adalah Editor laporan magang. TUGASMU: perpanjang setiap bagian agar mencapai 110-150 karakter. Output HANYA format AKTIVITAS/PEMBELAJARAN/KENDALA.";

        let expRes = await runOpenRouterGeneration(expansionSystem, expansionPrompt);
        if (!expRes.success) {
            expRes = await runGroqGeneration(expansionSystem, expansionPrompt);
        }

        if (expRes.success && expRes.content) {
            console.log(chalk.green(`[AI] Expansion successful (${expRes.model}).`));
            report = parseAndClamp(expRes.content);
        }
    }

    return report;
}

async function summarizeIslamicContent(text) {
    if (!text || text.length < 250) return text;
    const prompt = `Ringkas hadits/ayat berikut menjadi 1-2 kalimat pendek yang berisi "Hikmah" utama saja.\n\nTeks Asli: "${text}"`;
    
    let res = await runOpenRouterGeneration("Kamu adalah asisten pengingat ibadah.", prompt);
    if (!res.success) {
        res = await runGroqGeneration("Kamu adalah asisten pengingat ibadah.", prompt);
    }

    if (res.success && res.content) return res.content.trim();
    return text;
}

module.exports = {
    generateAttendanceReport,
    processFreeTextToReport,
    summarizeIslamicContent,
    transcribeAudio,
    smartChat: async (prompt, systemPrompt = '') => {
        let res = await runOpenRouterGeneration(systemPrompt, prompt);
        if (!res.success) {
            res = await runGroqGeneration(systemPrompt, prompt);
        }
        return res;
    }
};
