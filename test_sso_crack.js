const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const apiService = require('./src/services/apiService');
const { USERS_FILE } = require('./src/config/constants');

async function testCrackSSO() {
    console.log(chalk.bold.magenta('\n🚀 MEMULAI TEST CRACK SSO (DIRECT API LOGIN)...\n'));

    if (!fs.existsSync(USERS_FILE)) {
        console.error(chalk.red('❌ File users.json tidak ditemukan!'));
        return;
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (users.length === 0) {
        console.error(chalk.red('❌ Tidak ada user di users.json!'));
        return;
    }

    const testUser = users[0];
    console.log(chalk.cyan(`Target Test: ${testUser.name} (${testUser.email})\n`));

    try {
        console.log(chalk.yellow(`[STEP 1] Memulai Direct Login...`));
        const start = Date.now();
        
        const result = await apiService.directLogin(testUser.email, testUser.password);
        
        const duration = ((Date.now() - start) / 1000).toFixed(2);

        if (result.success) {
            console.log(chalk.green(`\n✅ LOGIN AKUN BERHASIL!`));
            
            if (result.sso_completed) {
                console.log(chalk.bold.green(`🔥 CRACK SSO SUKSES! Handshake Monev berhasil dilakukan via API.`));
                console.log(chalk.gray(`Waktu eksekusi: ${duration} detik`));
            } else {
                console.log(chalk.bold.yellow(`⚠️ LOGIN AKUN SUKSES, TAPI CRACK SSO GAGAL.`));
                console.log(chalk.yellow(`Pesan: ${result.pesan}`));
                console.log(chalk.gray(`Bot akan melakukan fallback ke Puppeteer jika ini terjadi di sistem utama.`));
            }
            
            console.log(chalk.yellow(`\n[STEP 2] Verifikasi Session dengan cek status...`));
            const status = await apiService.checkAttendanceStatus(testUser.email);
            
            if (status.success) {
                console.log(chalk.green(`✅ VERIFIKASI SUKSES: Session valid dan bisa menarik data.`));
                console.log(chalk.cyan(`Status Absen Hari Ini: ${status.sudahAbsen ? 'SUDAH' : 'BELUM'}`));
            } else {
                console.log(chalk.red(`❌ VERIFIKASI GAGAL: Session tidak bisa digunakan untuk API.`));
                console.log(chalk.red(`Error: ${status.pesan}`));
            }

        } else {
            console.log(chalk.red(`\n❌ DIRECT LOGIN GAGAL TOTAL!`));
            console.log(chalk.red(`Pesan: ${result.pesan}`));
        }
    } catch (error) {
        console.error(chalk.bold.red(`\n💥 CRASH SAAT TESTING:`), error);
    }

    console.log('\n' + chalk.bold.magenta('--- TEST SELESAI ---\n'));
}

testCrackSSO();
