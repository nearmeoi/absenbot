const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const apiService = require('./src/services/apiService');
const aiService = require('./src/services/aiService');
const chalk = require('chalk');

const email = "akmaljie12355@gmail.com";
const password = "Akmaljhi123@";

async function run() {
    console.log(chalk.cyan(`[TEST] Fetching history for ${email}...`));
    
    // 1. Get History
    let historyRes = await apiService.getAttendanceHistory(email, 7);
    
    if (!historyRes.success && historyRes.needsLogin) {
        console.log(chalk.yellow(`[TEST] Session expired, attempting direct login...`));
        const loginRes = await apiService.directLogin(email, password);
        if (loginRes.success) {
            historyRes = await apiService.getAttendanceHistory(email, 7);
        }
    }

    if (!historyRes.success) {
        console.error(chalk.red(`[TEST] Failed to get history: ${historyRes.pesan}`));
        return;
    }

    const logs = historyRes.logs.slice(0, 7);
    console.log(chalk.green(`[TEST] Found ${logs.length} logs.`));
    
    // Display raw logs for reference
    console.log(chalk.white("\n--- RAW HISTORY ---"));
    logs.forEach(l => {
        console.log(`[${l.date}]`);
        console.log(`A: ${l.activity_log}`);
        console.log(`P: ${l.lesson_learned}`);
        console.log(`K: ${l.obstacles}`);
        console.log('---');
    });

    // 2. Generate Report using current AI (OpenRouter/Groq)
    console.log(chalk.cyan("\n[TEST] Generating new report based on history..."));
    const report = await aiService.generateAttendanceReport(logs);
    
    console.log(chalk.green("\n--- AI RESPONSE ---"));
    console.log(chalk.yellow("AKTIVITAS:"));
    console.log(report.aktivitas);
    console.log(chalk.yellow("\nPEMBELAJARAN:"));
    console.log(report.pembelajaran);
    console.log(chalk.yellow("\nKENDALA:"));
    console.log(report.kendala);
}

run().catch(err => console.error(err));
