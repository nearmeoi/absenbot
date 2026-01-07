const axios = require('axios');
require('dotenv').config();
const chalk = require('chalk');

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    console.log(chalk.cyan(`[DIAGNOSTIC] Listing available models for key: ${key ? key.substring(0, 5) + '...' : 'MISSING'}`));

    try {
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
        );

        console.log(chalk.green("\nModels with '1.5' in Display Name:"));
        response.data.models
            .filter(m => m.displayName.includes('1.5'))
            .forEach(m => {
                console.log(`- ${m.name} [${m.displayName}]`);
            });
    } catch (err) {
        console.error(chalk.red('[FAIL] Failed to list models:'));
        if (err.response) {
            console.error(JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(err.message);
        }
    }
}

listModels();
