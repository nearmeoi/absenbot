const { getRiwayat } = require('./src/services/magang');
const chalk = require('chalk');

async function main() {
    const email = "akmaljie12355@gmail.com";
    const password = "Akmaljhi123@";
    
    console.log(chalk.cyan(`🔍 Mengambil riwayat asli untuk: ${email}`));
    
    const result = await getRiwayat(email, password, 5);
    
    if (result.success) {
        console.log(chalk.green('✅ Berhasil mengambil riwayat:'));
        console.log(JSON.stringify(result.logs, null, 2));
    } else {
        console.log(chalk.red('❌ Gagal:'), result.pesan);
    }
}

main();
