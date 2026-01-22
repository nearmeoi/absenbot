const { getAllUsers } = require('../src/services/database');
const { cekStatusHarian } = require('../src/services/magang');
const chalk = require('chalk');

async function safeRefresh() {
    console.log(chalk.magenta(`[SAFE REFRESH] Starting safe token refresh...`));
    const allUsers = getAllUsers();
    
    // Shuffle users to avoid always hitting the same ones first if interrupted
    const shuffled = allUsers.sort(() => 0.5 - Math.random());
    
    let successCount = 0;
    let failCount = 0;

    for (const user of shuffled) {
        try {
            console.log(chalk.cyan(`[REFRESH] Checking ${user.email}...`));
            
            // This function automatically attempts login if session is invalid/expired
            // It prioritizes Direct API (Lightweight) first.
            const status = await cekStatusHarian(user.email, user.password);
            
            if (status.success) {
                console.log(chalk.green(`[REFRESH] ✅ Valid: ${user.email}`));
                successCount++;
            } else {
                console.log(chalk.red(`[REFRESH] ⚠️ Failed: ${user.email} (${status.pesan})`));
                failCount++;
            }
            
            // Wait 5 seconds between users to be extremely safe on "VPS Kentang"
            await new Promise(r => setTimeout(r, 5000));
            
        } catch (e) {
            console.error(chalk.red(`[REFRESH] Error for ${user.email}:`), e.message);
            failCount++;
        }
    }
    
    console.log(chalk.magenta(`[SAFE REFRESH] Complete. Success: ${successCount}, Failed: ${failCount}`));
}

// Check if run directly
if (require.main === module) {
    safeRefresh().then(() => process.exit(0));
}

module.exports = { safeRefresh };
