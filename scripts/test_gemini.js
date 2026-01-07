require('dotenv').config();
const axios = require('axios');
const chalk = require('chalk');

async function testGemini() {
    const key = process.env.GEMINI_API_KEY;
    console.log(chalk.cyan(`[TEST] Testing Gemini API with key: ${key ? key.substring(0, 5) + '...' : 'MISSING'}`));

    if (!key) {
        console.error(chalk.red('[ERROR] GEMINI_API_KEY is not defined in .env!'));
        return;
    }

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
            { contents: [{ parts: [{ text: "Say 'KONEKSI GEMINI BERHASIL' if you can read this." }] }] },
            { timeout: 10000 }
        );

        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
            console.log(chalk.green(`[SUCCESS] Response: ${text.trim()}`));
        } else {
            console.log(chalk.yellow('[WARNING] No content in response. Check API console.'));
        }
    } catch (err) {
        console.error(chalk.red('[FAIL] Gemini API Error:'));
        if (err.response) {
            console.error(JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(err.message);
        }
        console.log(chalk.yellow('\nTIP: Make sure you have RESTARTED your terminal or PM2 after editing .env.'));
    }
}

testGemini();
