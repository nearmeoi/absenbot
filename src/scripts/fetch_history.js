const { getRiwayat } = require('../services/magang'); // Use production service
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// User Credentials from users.json
const USER_EMAIL = "akmaljie12355@gmail.com";
const USER_PASS = "Akmaljhi123@";

(async () => {
    console.log(chalk.blue(`\n🔄 FETCHING REAL HISTORY FOR: ${USER_EMAIL}`));

    try {
        // match signature: getRiwayat(email, password, days)
        const result = await getRiwayat(USER_EMAIL, USER_PASS, 30);

        console.log("DEBUG RAW RESULT:", JSON.stringify(result, null, 2));

        const logs = result.data || result.logs || [];

        if (logs.length > 0) {
            console.log(chalk.green(`\n✅ SUCCESS! Retrieved ${logs.length} logs.`));

            // Format log for compare_ai.js
            const formattedLogs = logs.slice(0, 10).map(log => ({
                date: log.date || "N/A",
                A: log.activity_log || "",
                P: log.lesson_learned || "",
                K: log.obstacles || ""
            }));

            const outputPath = path.join(__dirname, 'real_history.json');
            fs.writeFileSync(outputPath, JSON.stringify(formattedLogs, null, 2));
            console.log(chalk.yellow(`Saved to: ${outputPath}`));

            // Preview first log
            console.log("\nSample Log 1:");
            console.log(JSON.stringify(formattedLogs[0], null, 2));
        } else {
            console.error(chalk.red(`\n❌ FAILED to fetch/extract history: ${result.pesan || result.message || 'Unknown error'}`));
        }

    } catch (e) {
        console.error(chalk.red(`\n❌ SCRIPT ERROR: ${e.message}`));
        console.error(e.stack);
    }

    process.exit(0);
})();
