const { getDashboardStats } = require('./src/services/magang');
const chalk = require('chalk');
const fs = require('fs');

async function run() {
    // Load user credentials
    const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
    const targetEmail = 'akmaljie12355@gmail.com';
    const user = users.find(u => u.email === targetEmail);

    if (!user) {
        console.log("User not found in users.json");
        return;
    }

    console.log(chalk.blue(`🛠️  STARTING DEBUG SCRAPE FOR: ${user.email}`));
    console.log(chalk.blue(`🔑 Password found: ${user.password ? 'YES' : 'NO'}`));

    try {
        const startTime = Date.now();
        const result = await getDashboardStats(user.email, user.password);
        const duration = (Date.now() - startTime) / 1000;

        console.log(chalk.blue('---------------------------------------------------'));
        console.log(chalk.blue(`⏱️  Duration: ${duration}s`));
        
        if (result.success) {
            console.log(chalk.green('✅ SCRAPE SUCCESS'));
            console.log(chalk.white('📦 Data Extracted:'));
            console.log(JSON.stringify(result.data, null, 2));
        } else {
            console.log(chalk.red('❌ SCRAPE FAILED'));
            console.log(chalk.red(`Reason: ${result.pesan}`));
        }

    } catch (e) {
        console.error(chalk.red("🔥 CRITICAL ERROR:"), e);
    }
}

run();
