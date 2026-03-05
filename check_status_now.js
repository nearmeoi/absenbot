const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const apiService = require('./src/services/apiService');
const { USERS_FILE } = require('./src/config/constants');

async function checkAllUsers() {
    console.log(chalk.bold.blue('\n🔍 MEMULAI PENGECEKAN ABSENSI SEMUA USER...\n'));

    if (!fs.existsSync(USERS_FILE)) {
        console.error(chalk.red('❌ File users.json tidak ditemukan!'));
        return;
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const results = {
        sudah: [],
        belum: [],
        expired: [],
        error: []
    };

    console.log(chalk.cyan(`Total user yang akan dicek: ${users.length}\n`));

    for (const user of users) {
        const name = user.name || user.email;
        try {
            process.stdout.write(chalk.gray(`Checking ${name}... `));
            const status = await apiService.checkAttendanceStatus(user.email);

            if (status.success) {
                if (status.sudahAbsen) {
                    console.log(chalk.green('✅ SUDAH ABSEN'));
                    results.sudah.push({ name, email: user.email });
                } else {
                    console.log(chalk.red('❌ BELUM ABSEN'));
                    results.belum.push({ name, email: user.email });
                }
            } else if (status.needsLogin) {
                console.log(chalk.yellow('⚠️ SESSION EXPIRED'));
                results.expired.push({ name, email: user.email, pesan: status.pesan });
            } else {
                console.log(chalk.magenta('❓ ERROR: ' + status.pesan));
                results.error.push({ name, email: user.email, pesan: status.pesan });
            }
        } catch (error) {
            console.log(chalk.red('💥 CRASH: ' + error.message));
            results.error.push({ name, email: user.email, pesan: error.message });
        }
        
        // Small delay to be polite
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // --- SUMMARY ---
    console.log('\n' + chalk.bold.white('='.repeat(40)));
    console.log(chalk.bold.white('📊 RINGKASAN PENGECEKAN HARI INI'));
    console.log(chalk.bold.white('='.repeat(40)));

    if (results.belum.length > 0) {
        console.log(chalk.bold.red('\n❌ BELUM ABSEN:'));
        results.belum.forEach((u, i) => console.log(`${i + 1}. ${u.name} (${u.email})`));
    } else {
        console.log(chalk.green('\n✨ SEMUA USER SUDAH ABSEN! (Atau session expired)'));
    }

    if (results.expired.length > 0) {
        console.log(chalk.bold.yellow('\n⚠️ SESSION EXPIRED (Status tidak bisa dipastikan):'));
        results.expired.forEach((u, i) => console.log(`${i + 1}. ${u.name} (${u.email})`));
    }

    if (results.error.length > 0) {
        console.log(chalk.bold.magenta('\n❓ ERROR SAAT PENGECEKAN:'));
        results.error.forEach((u, i) => console.log(`${i + 1}. ${u.name} (${u.email}) - ${u.pesan}`));
    }

    console.log('\n' + chalk.bold.white('-'.repeat(40)));
    console.log(chalk.green(`✅ Sudah Absen : ${results.sudah.length}`));
    console.log(chalk.red(`❌ Belum Absen : ${results.belum.length}`));
    console.log(chalk.yellow(`⚠️ Expired     : ${results.expired.length}`));
    console.log(chalk.magenta(`❓ Error       : ${results.error.length}`));
    console.log(chalk.bold.white('-'.repeat(40)) + '\n');
}

checkAllUsers().catch(err => {
    console.error(chalk.red('\nFATAL ERROR:'), err);
});
