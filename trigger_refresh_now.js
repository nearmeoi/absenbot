const { runDashboardRefresh } = require('./src/services/scheduler');
const chalk = require('chalk');

console.log(chalk.green("🚀 Triggering IMMEDIATE Dashboard Refresh..."));
console.log(chalk.gray("This process runs in the background and processes users sequentially."));

runDashboardRefresh().then(() => {
    console.log(chalk.green("✅ Refresh Triggered. Check logs for progress."));
}).catch(err => {
    console.error(chalk.red("❌ Error:"), err);
});
