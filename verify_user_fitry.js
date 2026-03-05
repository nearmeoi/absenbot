const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const apiService = require('./src/services/apiService');
const { USERS_FILE } = require('./src/config/constants');

async function verifyFitryAccount() {
    console.log(chalk.bold.cyan('\n🔍 MEMULAI VERIFIKASI MENYELURUH UNTUK FITRI AURORA...\n'));

    if (!fs.existsSync(USERS_FILE)) {
        console.error(chalk.red('❌ File users.json tidak ditemukan!'));
        return;
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.email === 'fitryoya@gmail.com');

    if (!user) {
        console.error(chalk.red('❌ User Fitri Aurora (fitryoya@gmail.com) tidak ditemukan di database!'));
        return;
    }

    try {
        console.log(chalk.yellow(`[STEP 1] Mencoba Login & Crack SSO API...`));
        const loginResult = await apiService.directLogin(user.email, user.password);
        
        if (loginResult.success) {
            console.log(chalk.green(`✅ Login Akun: BERHASIL`));
            if (loginResult.sso_completed) {
                console.log(chalk.green(`✅ Crack SSO API: BERHASIL (Akses Cepat Aktif)`));
            } else {
                console.log(chalk.yellow(`⚠️ Crack SSO API: GAGAL (Butuh Browser/Puppeteer untuk sinkronisasi)`));
                console.log(chalk.gray(`   Pesan: ${loginResult.pesan}`));
            }
        } else {
            console.log(chalk.red(`❌ Login Akun: GAGAL TOTAL`));
            console.log(chalk.red(`   Error: ${loginResult.pesan}`));
            return;
        }

        console.log(chalk.yellow(`\n[STEP 2] Mencoba Menarik Data Profil via API...`));
        const profile = await apiService.getUserProfile(user.email);
        if (profile.success) {
            console.log(chalk.green(`✅ Akses Data: BERHASIL`));
            console.log(chalk.cyan(`   Nama di Sistem: ${profile.data?.name || 'Tidak diketahui'}`));
        } else {
            console.log(chalk.red(`❌ Akses Data: GAGAL`));
            console.log(chalk.red(`   Error: ${profile.pesan}`));
        }

        console.log(chalk.yellow(`\n[STEP 3] Memverifikasi Status Absen Hari Ini...`));
        const status = await apiService.checkAttendanceStatus(user.email);
        if (status.success) {
            if (status.sudahAbsen) {
                console.log(chalk.green(`✅ Status: SUDAH ABSEN`));
            } else {
                console.log(chalk.bold.red(`❌ Status: BELUM ABSEN`));
                console.log(chalk.gray(`   Sistem siap untuk melakukan absensi.`));
            }
        } else {
            console.log(chalk.red(`❌ Cek Status: GAGAL`));
            console.log(chalk.red(`   Error: ${status.pesan}`));
        }

    } catch (error) {
        console.error(chalk.bold.red(`\n💥 CRASH SAAT VERIFIKASI:`), error);
    }

    console.log('\n' + chalk.bold.cyan('--- VERIFIKASI SELESAI ---\n'));
}

verifyFitryAccount();
