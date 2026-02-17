const { getRiwayat } = require('./src/services/magang');
const chalk = require('chalk');
const fs = require('fs');

async function run() {
    const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
    const targetEmail = 'akmaljie12355@gmail.com';
    const user = users.find(u => u.email === targetEmail);

    const historyResult = await getRiwayat(user.email, user.password, 40);
    const logs = historyResult.logs || [];
    
    // Find Jan 1
    const targetDate = '2026-01-01';
    const log = logs.find(l => l.date === targetDate);
    
    if (log) {
        console.log(chalk.red(`LOG FOR ${targetDate} (Should be Rejected):`));
        console.log(JSON.stringify(log, null, 2));
    } else {
        console.log(`Log for ${targetDate} not found.`);
    }
    
    // Find a known approved one (e.g. Jan 5)
    const approvedLog = logs.find(l => l.date === '2026-01-05');
    if (approvedLog) {
        console.log(chalk.green(`LOG FOR 2026-01-05 (Should be Approved):`));
        console.log(JSON.stringify(approvedLog, null, 2));
    }
}

run();
