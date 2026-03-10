const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const apiService = require('./src/services/apiService');
const aiService = require('./src/services/aiService');
const chalk = require('chalk');

async function testQuality() {
    const email = "akmaljie12355@gmail.com";
    console.log(chalk.cyan(`[TEST-QUALITY] Fetching history for ${email}...`));
    
    // 1. Get History (using existing session)
    let historyRes = await apiService.getAttendanceHistory(email, 7);
    if (!historyRes.success) {
        console.error(chalk.red("Failed to fetch history. Skipping..."));
        return;
    }
    const logs = historyRes.logs.slice(0, 7);

    // 2. Setup prompts manually like aiService does
    const { getMessage } = require('./src/services/messageService');
    let context = 'Berikut adalah riwayat laporan sebelumnya:\n\n';
    logs.forEach((log) => {
        if (log && log.activity_log) {
            context += `--- ${log.date} ---\nAktivitas: ${log.activity_log}\nPembelajaran: ${log.lesson_learned}\nKendala: ${log.obstacles}\n\n`;
        }
    });

    const systemPrompt = getMessage('AI_SYSTEM_PROMPT');
    const userPrompt = getMessage('AI_USER_PROMPT').replace('{context}', context);

    // 3. FORCE GITHUB ENGINE specifically
    console.log(chalk.yellow("\n[TEST-QUALITY] Forcing generation using GitHub Models (gpt-4o-mini)..."));
    
    // Using internal function to test specifically
    const axios = require('axios');
    const { AI_CONFIG } = require('./src/config/constants');
    
    async function runGitHubDirect(sys, usr) {
        const response = await axios.post(AI_CONFIG.GITHUB.API_URL, {
            model: AI_CONFIG.GITHUB.MODEL,
            messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
            temperature: 0.6,
            max_tokens: 1000
        }, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            timeout: 30000
        });
        return response.data.choices[0]?.message?.content;
    }

    const rawContent = await runGitHubDirect(systemPrompt, userPrompt);
    
    // 4. Refine (also forcing GitHub fallback)
    console.log(chalk.yellow("[TEST-QUALITY] Refining results..."));
    
    // Manual refinement prompt construction to match aiService logic
    const refinementPrompt = getMessage('AI_REFINEMENT_WITH_CONTEXT_PROMPT')
        .replace('{content}', rawContent)
        .replace('{user_story}', "(Manual History Context)")
        .replace('{history_summary}', logs.map(l => `[${l.date}] ${l.activity_log.substring(0, 30)}...`).join('; '));

    const finalContent = await runGitHubDirect("Kamu adalah Supervisor Editor. Pastikan konten akurat, logis, dan TIDAK HALUSINASI.", refinementPrompt);

    // Parse and show
    const parse = (content) => {
        const parseSection = (label, text) => {
            const regex = new RegExp(`(?:^|[\\n\\r])[ \t]*[*#\\-.0-9]*[ \t]*${label}[*: ]*[ \t]*([^]*?)(?=(?:^|[\\n\\r])[ \t]*[*#\\-.0-9]*[ \t]*(?:AKTIVITAS|PEMBELAJARAN|KENDALA)|$)`, 'i');
            const match = text.match(regex);
            return match ? match[1].trim() : '';
        };
        return { A: parseSection('AKTIVITAS', content), P: parseSection('PEMBELAJARAN', content), K: parseSection('KENDALA', content) };
    };

    const finalReport = parse(finalContent);

    console.log(chalk.green("\n--- FINAL RESULT FROM GITHUB MODELS ---"));
    console.log(chalk.blue("AKTIVITAS:"));
    console.log(finalReport.A);
    console.log(chalk.blue("\nPEMBELAJARAN:"));
    console.log(finalReport.P);
    console.log(chalk.blue("\nKENDALA:"));
    console.log(finalReport.K);
}

testQuality().catch(err => console.error(err));
