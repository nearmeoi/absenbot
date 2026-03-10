const axios = require('axios');
const chalk = require('chalk');
const { getMessage } = require('./messageService');
const { AI_CONFIG } = require('../config/constants');
const FormData = require('form-data');
const fs = require('fs');

// API Keys from Environment
const KEYS = {
    SCALEWAY: process.env.SCALEWAY_API_KEY,
    GROQ: process.env.GROQ_API_KEY,
    CEREBRAS: process.env.CEREBRAS_API_KEY,
    SAMBANOVA: process.env.SAMBANOVA_API_KEY,
    GEMINI: process.env.GEMINI_API_KEY,
    GITHUB: process.env.GITHUB_TOKEN,
    OPENROUTER: process.env.OPENROUTER_API_KEY
};

/**
 * Generic OpenAI-Compatible Chat Completion Caller
 */
async function callOpenAICompatible(providerName, config, systemPrompt, userPrompt, apiKey) {
    if (!apiKey) return { success: false, error: 'API Key missing' };

    // Get Model with Rotation (Round-Robin or Random)
    let model = config.MODEL;
    if (config.MODELS && Array.isArray(config.MODELS)) {
        model = config.MODELS[Math.floor(Math.random() * config.MODELS.length)];
    }

    try {
        const response = await axios.post(config.API_URL, {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 1500
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://monev-absenbot.my.id',
                'X-Title': 'AbsenBot Production'
            },
            timeout: config.TIMEOUT || 20000
        });

        const content = response.data.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response content');

        const modelName = `${providerName} (${model})`;
        console.log(chalk.blue(`[AI-RESPONSE] Successfully generated via ${modelName}`));

        return { success: true, content, model: modelName };
    } catch (err) {
        const errMsg = err.response?.data?.error?.message || err.message;
        console.warn(chalk.yellow(`[AI-${providerName}] engine failed (${model}): ${errMsg}`));
        return { success: false, error: errMsg };
    }
}

/**
 * Audio Transcription using Groq (Whisper)
 */
async function transcribeAudio(filePath) {
    if (!KEYS.GROQ) return { success: false, error: 'Groq key missing' };
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        formData.append('model', 'whisper-large-v3-turbo');

        const response = await axios.post(AI_CONFIG.GROQ.AUDIO_URL, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${KEYS.GROQ}`,
            }
        });

        return { success: true, text: response.data.text };
    } catch (error) {
        console.error(chalk.red('[GROQ-VOICE] Error:'), error.message);
        return { success: false, error: 'Gagal mendengarkan VN Anda.' };
    }
}

/**
 * The Master Waterfall Fallback Engine
 */
async function runMasterGeneration(systemPrompt, userPrompt) {
    // 🥇 Pilar 1: Scaleway (Kapten Utama - Sangat Manusiawi)
    for (let i = 0; i < 4; i++) {
        let res = await callOpenAICompatible('SCALEWAY', AI_CONFIG.SCALEWAY, systemPrompt, userPrompt, KEYS.SCALEWAY);
        if (res.success) return res;

        if (res.error && (res.error.includes('429') || res.error.includes('limit'))) {
            console.log(chalk.yellow(`[AI-RETRY] Scaleway limit, mencoba rotasi model lain (${i + 1}/4)...`));
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            break;
        }
    }

    // 🥈 Pilar 2: Groq (Tercepat di dunia)
    let res = await callOpenAICompatible('GROQ', AI_CONFIG.GROQ, systemPrompt, userPrompt, KEYS.GROQ);
    if (res.success) return res;

    // 🥉 Pilar 3: SambaNova (Rotasi Sehat & Cerdas)
    res = await callOpenAICompatible('SAMBANOVA', AI_CONFIG.SAMBANOVA, systemPrompt, userPrompt, KEYS.SAMBANOVA);
    if (res.success) return res;

    // 🛡️ Pilar 4: GitHub Models (OpenAI Grade AI)
    res = await callOpenAICompatible('GITHUB', AI_CONFIG.GITHUB, systemPrompt, userPrompt, KEYS.GITHUB);
    if (res.success) return res;

    // 💎 Pilar 5: Google Gemini (Kaku tapi Stabil)
    res = await callOpenAICompatible('GEMINI', AI_CONFIG.GEMINI, systemPrompt, userPrompt, KEYS.GEMINI);
    if (res.success) return res;

    // 🚑 Pilar 6: Cerebras (Obat Darurat)
    res = await callOpenAICompatible('CEREBRAS', AI_CONFIG.CEREBRAS, systemPrompt, userPrompt, KEYS.CEREBRAS);
    if (res.success) return res;

    return { success: false, error: 'Semua layanan AI (6 Pilar) sedang mati atau over-limit.' };
}

/**
 * AI Refinement
 */
async function runAIRefinement(content, userStory, previousLogs = []) {
    console.log(chalk.cyan('[AI] Running Refinement...'));

    const refinementPrompt = `TUGAS: Poles draf ini agar panjang setiap bagian ideal (110-140 karakter).

DRAF KASAR: "${content}"
CERITA USER HARI INI: "${userStory}"

ATURAN REFINEMENT (WAJIB PATUH):
1. FOKUS: Hanya bahas apa yang ada di "CERITA USER HARI INI". JANGAN masukkan aktivitas dari riwayat lama (seperti WebVR, Review Kode, dll) jika tidak disebutkan user hari ini.
2. MINIMAL KARAKTER: Bagian AKTIVITAS dan PEMBELAJARAN wajib di atas 110 karakter.
3. GAYA: Gunakan kata kerja berawalan 'Me-'. JANGAN gunakan angka/list.
4. KENDALA: Gunakan kalimat profesional yang panjang (min 110 karakter) untuk menjelaskan kelancaran pengerjaan tugas.
5. OUTPUT: Hanya format AKTIVITAS, PEMBELAJARAN, KENDALA.`;

    const systemPrompt = "Kamu adalah Supervisor Editor Laporan Magang. Tugasmu mengubah draf kasar menjadi laporan detail dan manusiawi.";

    const res = await runMasterGeneration(systemPrompt, refinementPrompt);
    return res.success ? res.content : content;
}

/**
 * Parse AI text output into structured report object
 */
const parseAndClamp = (content) => {
    if (!content) return { success: false, error: 'Empty content from AI' };
    console.log(chalk.yellow('\n[DEBUG-RAW-AI-OUTPUT]:\n' + content + '\n'));

    const parseSection = (labels, text) => {
        try {
            for (const label of labels) {
                const regexStr = `${label}[*: ]*([^]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA|Pekerjaan|Pelajaran|Hambatan|Kegiatan|\\d\\.)|$)`;
                const regex = new RegExp(regexStr, 'i');
                const match = text.match(regex);
                if (match && match[1] && match[1].trim().length > 10) {
                    return match[1].trim().replace(/^[:\-* \t\n\r]+/, '');
                }
            }
        } catch (e) { }
        return '';
    };

    let aktivitas = parseSection(['AKTIVITAS', 'Pekerjaan yang Dilaksanakan', 'Kegiatan', 'Pekerjaan'], content);
    let pembelajaran = parseSection(['PEMBELAJARAN', 'Pelajaran yang Diambil', 'Hal yang dipelajari', 'Pelajaran'], content);
    let kendala = parseSection(['KENDALA', 'Hambatan', 'Masalah', 'Kendala'], content);

    if (!aktivitas || !pembelajaran || !kendala) {
        const lines = content.split('\n');
        let currentMode = null;
        lines.forEach(line => {
            const cleanLine = line.trim();
            const upperLine = cleanLine.toUpperCase();
            if (upperLine.includes('AKTIVITAS')) {
                currentMode = 'A';
                aktivitas += ' ' + cleanLine.replace(/.*AKTIVITAS[*: ]*/i, '');
            } else if (upperLine.includes('PEMBELAJARAN')) {
                currentMode = 'P';
                pembelajaran += ' ' + cleanLine.replace(/.*PEMBELAJARAN[*: ]*/i, '');
            } else if (upperLine.includes('KENDALA')) {
                currentMode = 'K';
                kendala += ' ' + cleanLine.replace(/.*KENDALA[*: ]*/i, '');
            } else if (currentMode === 'A') aktivitas += ' ' + cleanLine;
            else if (currentMode === 'P') pembelajaran += ' ' + cleanLine;
            else if (currentMode === 'K') kendala += ' ' + cleanLine;
        });
    }

    const MAX_CHARS = AI_CONFIG.REPORT.MAX_CHARS || 300;
    const finalize = (text) => {
        let res = (text || '').trim().replace(/[*#]/g, '').replace(/\s+/g, ' ');
        const sentences = res.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
        const uniqueSentences = [...new Set(sentences)];
        if (uniqueSentences.length > 0) res = uniqueSentences.join('. ') + '.';
        if (res.length > MAX_CHARS) {
            res = res.substring(0, MAX_CHARS).trim();
            const lastDot = res.lastIndexOf('.');
            if (lastDot > 200) res = res.substring(0, lastDot + 1);
        }
        return res;
    };

    const finalAktivitas = finalize(aktivitas);
    const finalPembelajaran = finalize(pembelajaran);
    let finalKendala = finalize(kendala);

    const isNoObstacle = (text) => {
        const lower = text.toLowerCase();
        return lower.includes('tidak ada') || lower.includes('lancar') || lower.includes('signifikan') || text.length < 80;
    };

    if (isNoObstacle(finalKendala)) {
        finalKendala = "Seluruh proses pengerjaan tugas pada hari ini berjalan dengan sangat lancar dan saya tidak menemukan adanya hambatan teknis maupun kendala komunikasi yang berarti selama pelaksanaan kegiatan magang.";
    }

    if (finalAktivitas.length < 15 || finalPembelajaran.length < 15) {
        return { success: false, error: 'AI tidak memberikan format yang benar.' };
    }

    return { success: true, aktivitas: finalAktivitas, pembelajaran: finalPembelajaran, kendala: finalKendala };
};

/**
 * Generate report from history
 */
async function generateAttendanceReport(previousLogs = []) {
    let context = 'RIWAYAT TERAKHIR (Gunakan ini sebagai referensi gaya saja):\n';
    previousLogs.slice(0, 5).forEach(log => { context += `- ${log.activity_log.substring(0, 100)}\n`; });

    const systemPrompt = `Kamu adalah Asisten Penulis Laporan Magang Profesional. 
    ATURAN: JANGAN pakai angka/list. Gunakan 'Me-'. Format HANYA: AKTIVITAS, PEMBELAJARAN, KENDALA. JANGAN tuliskan intro/penutup apapun.`;

    // Perbaikan: Konteks riwayat harus dimasukkan ke prompt user agar AI tidak bingung.
    const userPrompt = `${context}\n\nBerdasarkan riwayat di atas dan pahami polanya, buatkan satu set laporan riwayat baru untuk kegiatan hari ini (karangan relevan). JANGAN COPAS, buat aktivitas baru yang mirip dengan riwayat.`;

    const res = await runMasterGeneration(systemPrompt, userPrompt);
    if (!res.success) return res;
    return parseAndClamp(res.content);
}

/**
 * Process story to report
 */
async function processFreeTextToReport(userText, previousLogs = []) {
    const systemPrompt = `Kamu adalah Draft Writer. 
    TUGAS: Fokus HANYA pada: "${userText}". 
    JANGAN masukkan riwayat lama. FORMAT: AKTIVITAS, PEMBELAJARAN, KENDALA.`;

    const fullPrompt = `Cerita User Hari Ini: "${userText}"\n\nBuatkan draf laporan singkat.`;

    const res = await runMasterGeneration(systemPrompt, fullPrompt);
    if (!res.success) return res;

    console.log(chalk.cyan(`[AI] Memulai Refinement...`));
    const refinedContent = await runAIRefinement(res.content, userText, []);

    return parseAndClamp(refinedContent);
}

/**
 * Summarize content
 */
async function summarizeIslamicContent(text) {
    if (!text || text.length < 300) return text;
    const prompt = `Ringkas teks berikut menjadi 1 kalimat hikmah pendek:\n\n"${text}"`;
    const res = await runMasterGeneration("Kamu adalah asisten bijak.", prompt);
    return res.success ? res.content.trim() : text;
}

/**
 * Generate Chat Response (Chatbot Mode)
 */
async function generateChatResponse(userPrompt, systemPrompt = '') {
    const res = await runMasterGeneration(systemPrompt, userPrompt);
    return res.success ? res.content : null;
}

module.exports = {
    generateAttendanceReport,
    processFreeTextToReport,
    summarizeIslamicContent,
    transcribeAudio,
    generateChatResponse,
    smartChat: async (prompt, systemPrompt = '') => {
        return await runMasterGeneration(systemPrompt, prompt);
    }
};
