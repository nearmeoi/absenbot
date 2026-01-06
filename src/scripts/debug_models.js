const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();

const GEMINI_API_KEY = 'AIzaSyDRLqq5E8GBcNSXHtx-RGuyvjiL5pwT0NU';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

(async () => {
    console.log("--- DEBUGGING AI MODELS ---");

    // TEST GROQ
    const groqModels = ['qwen-2.5-32b', 'qwen/qwen3-32b', 'llama-3.3-70b-versatile'];
    for (const model of groqModels) {
        process.stdout.write(`Testing Groq model: ${model}... `);
        try {
            await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: model,
                messages: [{ role: 'user', content: 'hi' }]
            }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` } });
            console.log(chalk.green("OK ✅"));
        } catch (e) {
            console.log(chalk.red(`FAIL ❌ (${e.response?.status}: ${JSON.stringify(e.response?.data)})`));
        }
    }

    // TEST GEMINI
    const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];
    for (const model of geminiModels) {
        process.stdout.write(`Testing Gemini model: ${model}... `);
        try {
            await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                contents: [{ parts: [{ text: 'hi' }] }]
            });
            console.log(chalk.green("OK ✅"));
        } catch (e) {
            console.log(chalk.red(`FAIL ❌ (${e.response?.status}: ${e.response?.data?.error?.message})`));
        }
    }
})();
