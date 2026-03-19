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
    // 🏆 Pilar Utama: Groq (Tercepat & Akurat - Permintaan User)
    let res = await callOpenAICompatible('GROQ', AI_CONFIG.GROQ, systemPrompt, userPrompt, KEYS.GROQ);
    if (res.success) return res;

    // 🥇 Pilar 1: OpenRouter (Trinity - Sangat Powerfull)
    res = await callOpenAICompatible('OPENROUTER', AI_CONFIG.OPENROUTER, systemPrompt, userPrompt, KEYS.OPENROUTER);
    if (res.success) return res;

    // 🥈 Pilar 2: Scaleway (Sangat Manusiawi)
    for (let i = 0; i < 4; i++) {
        res = await callOpenAICompatible('SCALEWAY', AI_CONFIG.SCALEWAY, systemPrompt, userPrompt, KEYS.SCALEWAY);
        if (res.success) return res;

        if (res.error && (res.error.includes('429') || res.error.includes('limit'))) {
            console.log(chalk.yellow(`[AI-RETRY] Scaleway limit, mencoba rotasi model lain (${i + 1}/4)...`));
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            break;
        }
    }

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
async function runAIRefinement(content, userStory, previousLogs = [], userContext = null) {
    console.log(chalk.cyan('[AI] Running Refinement...'));

    const refinementPrompt = `TUGAS: Poles draf ini agar panjang setiap bagian ideal (min 110 karakter).

DRAF KASAR: "${content}"
CERITA USER HARI INI: "${userStory}"

ATURAN REFINEMENT (WAJIB PATUH):
1. FOKUS: Hanya bahas apa yang ada di "CERITA USER HARI INI". JANGAN masukkan aktivitas dari riwayat lama (seperti WebVR, Review Kode, dll) jika tidak disebutkan user hari ini.
2. MINIMAL KARAKTER: Bagian AKTIVITAS dan PEMBELAJARAN wajib di atas 110 karakter.
3. GAYA: Gunakan kata kerja berawalan 'Me-'. JANGAN gunakan angka/list.
4. KENDALA: Gunakan kalimat profesional yang panjang (min 110 karakter) untuk menjelaskan kelancaran pengerjaan tugas.
5. OUTPUT: Hanya format AKTIVITAS, PEMBELAJARAN, KENDALA.`;

    const systemPrompt = `Kamu adalah Supervisor Editor Laporan Magang.
    TUGAS: Poles draf ini agar menjadi laporan yang logis dan personal bagi user.
    
    ATURAN DINAMIS:
    - ANALISIS PROFIL: ${userContext || 'Gunakan gaya bahasa profesional umum.'}
    - JANGAN PERNAH membuat aktivitas teknis (Database/Coding) jika User menyatakan sedang di tahap Research atau jika Riwayat menunjukkan user baru saja memulai.
    - FOKUS: Hanya poles poin yang relevan dengan CERITA USER hari ini.
    
    WAJIB GUNAKAN LABEL: AKTIVITAS, PEMBELAJARAN, KENDALA.
    WAJIB MULAI SETIAP KALIMAT DENGAN KATA KERJA BERAWALAN 'Me-'.
    Format HANYA:
    AKTIVITAS: [isi]
    PEMBELAJARAN: [isi]
    KENDALA: [isi]`;
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
                // Regex improved to handle start of line or labels more strictly
                const regexStr = `(?:^|\\n)${label}[*: ]*([^]*?)(?=(?:\\n(?:AKTIVITAS|PEMBELAJARAN|KENDALA|KENDELA|Pekerjaan|Pelajaran|Hambatan|Kegiatan|\\d\\.))|$)`;
                const regex = new RegExp(regexStr, 'i');
                const match = text.match(regex);
                if (match && match[1] && match[1].trim().length > 10) {
                    return match[1].trim().replace(/^[:\-* \t\r\n]+/, '');
                }
            }
        } catch (e) { }
        return '';
    };

    let aktivitas = parseSection(['AKTIVITAS', 'Pekerjaan yang Dilaksanakan', 'Kegiatan', 'Pekerjaan'], content);
    let pembelajaran = parseSection(['PEMBELAJARAN', 'Pelajaran yang Diambil', 'Hal yang dipelajari', 'Pelajaran'], content);
    let kendala = parseSection(['KENDALA', 'KENDELA', 'Hambatan', 'Masalah', 'Kendala'], content);

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
            } else if (upperLine.includes('KENDALA') || upperLine.includes('KENDELA')) {
                currentMode = 'K';
                kendala += ' ' + cleanLine.replace(/.*KENDEL?A[*: ]*/i, '');
            } else if (currentMode === 'A') aktivitas += ' ' + cleanLine;
            else if (currentMode === 'P') pembelajaran += ' ' + cleanLine;
            else if (currentMode === 'K') kendala += ' ' + cleanLine;
        });
    }

    const MAX_CHARS = AI_CONFIG.REPORT.MAX_CHARS || 1000;
    const finalize = (text) => {
        let res = (text || '').trim().replace(/[*#]/g, '').replace(/\s+/g, ' ');
        // Clean up redundant "Me-me" or "Me-melakukan" -> "Melakukan"
        res = res.replace(/Me-([me]{2,})/gi, (match, p1) => {
            return p1.charAt(0).toUpperCase() + p1.slice(1);
        });
        const sentences = res.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
        const uniqueSentences = [...new Set(sentences)];
        if (uniqueSentences.length > 0) res = uniqueSentences.join('. ') + '.';
        if (res.length > MAX_CHARS) {
            res = res.substring(0, MAX_CHARS).trim();
            const lastDot = res.lastIndexOf('.');
            if (lastDot > (MAX_CHARS * 0.7)) res = res.substring(0, lastDot + 1);
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
async function generateAttendanceReport(previousLogs = [], userContext = null) {
    let context = 'RIWAYAT TERAKHIR (Gunakan ini sebagai referensi gaya saja):\n';
    previousLogs.slice(0, 5).forEach(log => { context += `- ${log.activity_log.substring(0, 100)}\n`; });

    const systemPrompt = `Kamu adalah Asisten Penulis Laporan Magang Profesional.
    TUGAS UTAMA: Buatkan laporan yang merupakan KELANJUTAN LOGIS dari riwayat dan profil user.
    
    ANALISIS INPUT:
    1. PROFIL USER: ${userContext || 'Tidak ada profil khusus.'} (Gunakan ini untuk memahami peran & fase proyek).
    2. RIWAYAT: (Lihat riwayat di bawah).
    
    PRINSIP PENULISAN:
    - Jika riwayat/profil menunjukkan user baru memulai sesuatu, fokuslah pada aktivitas persiapan/riset.
    - Jika riwayat/profil menunjukkan user sudah di tahap teknis, lanjutkan ke aktivitas teknis yang relevan.
    - JANGAN PERNAH membuat aktivitas yang melompat terlalu jauh dari status terakhir yang ada di riwayat atau profil.
    - Pastikan tone bahasa profesional dan deskriptif (minimal 110 karakter per bagian).
    
    WAJIB GUNAKAN LABEL: AKTIVITAS, PEMBELAJARAN, KENDALA.
    WAJIB MULAI SETIAP KALIMAT DENGAN KATA KERJA BERAWALAN 'Me-'.
    JANGAN pakai angka/list/bullet point.
    Format HANYA:
    AKTIVITAS: [isi]
    PEMBELAJARAN: [isi]
    KENDALA: [isi]`;

    // Perbaikan: Konteks riwayat harus dimasukkan ke prompt user agar AI tidak bingung.
    const userPrompt = `${context}\n\nBerdasarkan riwayat di atas, buatkan laporan untuk langkah selanjutnya yang LOGIS dan BERTAHAP. 
    ATURAN PENTING:
    1. JANGAN melompat terlalu jauh dari progress terakhir (misal: jika baru bergabung, jangan langsung bahas fitur kompleks atau optimasi).
    2. Fokus pada aktivitas persiapan, instalasi, pemahaman struktur, atau koordinasi jika proyek baru saja dimulai.
    3. JANGAN COPAS, buat aktivitas baru yang merupakan kelanjutan alami dari riwayat.`;

    const res = await runMasterGeneration(systemPrompt, userPrompt);
    if (!res.success) return res;
    return parseAndClamp(res.content);
}

/**
 * Process story to report
 */
async function processFreeTextToReport(userText, previousLogs = [], userContext = null) {
    const systemPrompt = `Kamu adalah Draft Writer. 
    ${userContext ? `PROFIL USER: ${userContext}` : ''}
    WAJIB GUNAKAN LABEL: AKTIVITAS, PEMBELAJARAN, KENDALA.
    WAJIB MULAI SETIAP KALIMAT DENGAN KATA KERJA BERAWALAN 'Me-'.
    JANGAN pakai angka/list/bullet point.
    TUGAS: Fokus HANYA pada: "${userText}".
    Format HANYA:
    AKTIVITAS: [isi]
    PEMBELAJARAN: [isi]
    KENDALA: [isi]`;

    const fullPrompt = `Cerita User Hari Ini: "${userText}"\n\nBuatkan draf laporan singkat.`;

    const res = await runMasterGeneration(systemPrompt, fullPrompt);
    if (!res.success) return res;

    console.log(chalk.cyan(`[AI] Memulai Refinement...`));
    const refinedContent = await runAIRefinement(res.content, userText, [], userContext);

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
