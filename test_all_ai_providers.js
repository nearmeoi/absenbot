const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();
const { getMessage } = require('./src/services/messageService');

// Mock History
const previousLogs = [
    {
        "date": "2026-03-05",
        "activity_log": "Melakukan proses debugging pada bagian API WebVR terkait data hotspots, demi memastikan fungsionalitasnya berjalan optimal dan akurat.",
        "lesson_learned": "Saya memahami pentingnya debugging yang mendalam untuk mengidentifikasi dan memperbaiki masalah pada API, sehingga dapat meningkatkan keandalan dan performa fitur hotspots.",
        "obstacles": "Tetap ada isu minor yang ditemukan saat debugging API data hotspots, namun target perbaikan telah tercatat untuk langkah selanjutnya."
    },
    {
        "date": "2026-03-04",
        "activity_log": "Melakukan review kode dengan lebih teliti dan mendalam, sehingga saya dapat memperbaiki dan meningkatkan kualitas kode dengan lebih baik dan efektif.",
        "lesson_learned": "Saya memahami pentingnya review kode dalam memperoleh pengalaman berharga dan memperoleh kesempatan untuk memperbaiki dan meningkatkan kualitas kode, serta memperoleh pengalaman dalam menganalisis kode dengan lebih teliti.",
        "obstacles": "Tidak ada kendala signifikan pada hari ini, sehingga saya dapat fokus pada review kode dengan lebih baik dan produktif."
    },
    {
        "date": "2026-03-03",
        "activity_log": "Melakukan review kode dengan lebih teliti dan mendalam, karena pekerjaan yang sedikit, sehingga saya dapat memperbaiki dan meningkatkan kualitas kode dengan lebih baik dan efektif.",
        "lesson_learned": "Saya memahami pentingnya review kode dalam memperoleh pengalaman berharga.",
        "obstacles": "Tidak ada kendala signifikan pada hari ini."
    },
    {
        "date": "2026-02-27",
        "activity_log": "Melakukan presentasi progress kepada co mentor dan menerima arahan untuk langkah selanjutnya.",
        "lesson_learned": "Saya memahami pentingnya presentasi progress dalam memperoleh umpan balik.",
        "obstacles": "Tidak ada kendala signifikan pada hari ini."
    },
    {
        "date": "2026-02-26",
        "activity_log": "hari ini saya masih memperbaiki sedikit bug pada webvr, dikarenakan lumayan mengganggu, hari ini tidak terburu buru.",
        "lesson_learned": "saya belajar mengatasi masalah bug pada webvr dengan menganalisis kode",
        "obstacles": "kendala yang saya hadapi adalah tidak adanya sumber daya yang cukup"
    },
    {
        "date": "2026-02-25",
        "activity_log": "Melanjutkan proses perbaikan bug yang ditemukan sebelumnya, khususnya pada masalah hotspot yang tidak tampil di mode VR.",
        "lesson_learned": "Saya memahami pentingnya proses perbaikan bug dalam meningkatkan kualitas pengalaman pengguna.",
        "obstacles": "Tidak ada kendala signifikan pada hari ini."
    },
    {
        "date": "2026-02-24",
        "activity_log": "Melanjutkan proses pengecekan kode program yang telah dibuat sebelumnya.",
        "lesson_learned": "Saya memahami pentingnya pengecekan kembali dalam memastikan kualitas pekerjaan.",
        "obstacles": "Tidak ada kendala signifikan pada hari ini."
    }
];

async function runTest() {
    console.log(chalk.cyan('🚀 Memulai Uji Coba Lintas Provider AI (The Ultimate 6 Pillars - Data Akmal)...'));

    let context = 'Berikut adalah riwayat laporan sebelumnya:\n\n';
    previousLogs.forEach((log) => {
        context += `--- ${log.date} ---\nAktivitas: ${log.activity_log}\nPembelajaran: ${log.lesson_learned}\nKendala: ${log.obstacles}\n\n`;
    });

    const systemPrompt = getMessage('AI_SYSTEM_PROMPT');
    const userPrompt = getMessage('AI_USER_PROMPT').replace('{context}', context);

    const providers = [
        {
            name: '🥇 Scaleway (Unlimited Concept + Round Robin)',
            url: 'https://api.scaleway.ai/v1/chat/completions',
            key: 'REDACTED_SCALEWAY_KEY',
            model: ['llama-3.3-70b-instruct', 'deepseek-r1-distill-llama-70b', 'llama-3.1-8b-instruct', 'mistral-nemo-instruct-2407', 'gemma-3-27b-it', 'mistral-small-3.2-24b-instruct-2506', 'pixtral-12b-2409'][Math.floor(Math.random() * 7)]
        },
        {
            name: '🥈 Groq (Fastest + Round Robin)',
            url: 'https://api.groq.com/openai/v1/chat/completions',
            key: 'REDACTED_GROQ_KEY',
            model: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b', 'gemma2-9b-it'][Math.floor(Math.random() * 4)]
        },
        {
            name: '🥉 Cerebras (Hyper-Speed)',
            url: 'https://api.cerebras.ai/v1/chat/completions',
            key: 'REDACTED_CEREBRAS_KEY',
            model: 'llama3.1-8b'
        },
        {
            name: '🛡️ SambaNova (Round-Robin Ready)',
            url: 'https://api.sambanova.ai/v1/chat/completions',
            key: 'REDACTED_SAMBANOVA_KEY',
            model: ['Meta-Llama-3.1-8B-Instruct', 'Meta-Llama-3.3-70B-Instruct', 'DeepSeek-R1-Distill-Llama-70B'][Math.floor(Math.random() * 3)]
        },
        {
            name: '💎 Gemini (Official OpenAI Format + Round Robin)',
            url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            key: 'REDACTED_GEMINI_KEY',
            model: ['gemini-1.5-flash', 'gemini-1.5-flash-8b'][Math.floor(Math.random() * 2)]
        },
        {
            name: '🚑 GitHub Models (Emergency + Round Robin)',
            url: 'https://models.inference.ai.azure.com/chat/completions',
            key: process.env.GITHUB_TOKEN,
            model: ['gpt-4o-mini', 'Cohere-command-r', 'AI21-Jamba-1.5-Mini', 'Llama-3.2-11B-Vision-Instruct'][Math.floor(Math.random() * 4)]
        },
        {
            name: '🧪 OpenRouter (Existing)',
            url: 'https://openrouter.ai/api/v1/chat/completions',
            key: process.env.OPENROUTER_API_KEY,
            model: 'openrouter/auto'
        }
    ];

    for (const p of providers) {
        if (!p.key) {
            console.log(chalk.red(`\n[${p.name}] ❌ API Key Missing`));
            continue;
        }

        console.log(chalk.yellow(`\n[${p.name}] ⏳ Generating...`));
        try {
            const startTime = Date.now();
            const res = await axios.post(p.url, {
                model: p.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${p.key}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://monev-absenbot.my.id',
                    'X-Title': 'AbsenBot Test'
                },
                timeout: 30000
            });
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            const content = res.data.choices[0]?.message?.content;
            console.log(chalk.green(`✅ Done in ${duration}s`));
            console.log(chalk.white('-----------------------------------'));
            console.log(content);
            console.log(chalk.white('-----------------------------------'));
        } catch (err) {
            console.log(chalk.red(`❌ Failed: ${err.message}`));
            if (err.response) {
                console.log(chalk.red(`Status: ${err.response.status}`));
                console.log(chalk.red(`Detail: ${JSON.stringify(err.response.data).substring(0, 200)}...`));
            }
        }
    }
}

runTest();
