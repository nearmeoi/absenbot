const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const aiService = require('./src/services/aiService');
const chalk = require('chalk');

async function test() {
    console.log(chalk.cyan("[TEST] Testing GitHub Models (Temporarily Prioritized)..."));
    
    const prompt = "Halo, siapa namamu dan apa model AI yang kamu gunakan?";
    const systemPrompt = "Kamu adalah asisten ramah.";
    
    console.log(chalk.yellow("Executing smartChat..."));
    const res = await aiService.smartChat(prompt, systemPrompt);
    
    if (res.success) {
        console.log(chalk.green(`\n✅ Response Successful from: ${res.model}`));
        console.log(chalk.white(`Content: ${res.content}`));
    } else {
        console.log(chalk.red("\n❌ AI Call Failed. Check your keys and logs."));
    }
}

test();
