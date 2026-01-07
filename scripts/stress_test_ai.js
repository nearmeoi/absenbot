require('dotenv').config();
const { processFreeTextToReport } = require('../src/services/aiService');
const chalk = require('chalk');

async function runStressTest() {
    console.log(chalk.bold.cyan("\n🚀 STARTING AI STRESS TEST (10 REQUESTS)\n"));

    const sampleTexts = [
        "belajar coding react hari ini",
        "maintenance server dan update kernel",
        "dokumentasi API untuk fitur login",
        "diskusi dengan tim desain",
        "fix bug di modul pembayaran",
        "belajar database indexing",
        "review code pull request teman",
        "setup env baru di vps",
        "optimasi query mysql",
        "bikin flowchart fitur baru"
    ];

    for (let i = 0; i < sampleTexts.length; i++) {
        const startTime = Date.now();
        console.log(chalk.blue(`[TEST ${i + 1}/10] Processing: "${sampleTexts[i]}"...`));

        try {
            const result = await processFreeTextToReport(sampleTexts[i]);
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            if (result.success) {
                console.log(chalk.green(`[SUCCESS] (${duration}s) -> AKTIVITAS: ${result.aktivitas.substring(0, 30)}...`));
            } else {
                console.log(chalk.red(`[FAIL] (${duration}s) -> Error: ${result.error}`));
            }
        } catch (err) {
            console.error(chalk.bgRed(" CRASH "), err.message);
        }

        // Small delay to be polite to the APIs, but fast enough to test rate limits
        if (i < sampleTexts.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    console.log(chalk.bold.cyan("\n🏁 STRESS TEST FINISHED\n"));
}

runStressTest();
