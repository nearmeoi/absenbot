const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const magangService = require('./src/services/magang');
const { USERS_FILE } = require('./src/config/constants');

async function draftSubmitFitry() {
    console.log(chalk.bold.yellow('\n🚧 MEMULAI DRAF SIMULASI ABSENSI (TIDAK SUBMIT BENERAN)...\n'));

    if (!fs.existsSync(USERS_FILE)) {
        console.error(chalk.red('❌ File users.json tidak ditemukan!'));
        return;
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.email === 'fitryoya@gmail.com');

    if (!user) {
        console.error(chalk.red('❌ User Fitri Aurora tidak ditemukan!'));
        return;
    }

    const draftData = {
        email: user.email,
        password: user.password,
        aktivitas: "Melakukan pengerjaan tugas harian dan koordinasi dengan tim mengenai progres pekerjaan.",
        pembelajaran: "Mempelajari alur sistem koordinasi tim yang efektif.",
        kendala: "Tidak ada kendala yang berarti hari ini.",
        simulation: true 
    };

    console.log(chalk.cyan('📝 DRAF LAPORAN YANG DISIAPKAN:'));
    console.log(chalk.gray(`   Aktivitas: ${draftData.aktivitas}`));
    console.log(chalk.gray(`   Pembelajaran: ${draftData.pembelajaran}`));
    console.log(chalk.gray(`   Kendala: ${draftData.kendala}`));
    console.log(chalk.bold.magenta('\n[MODE] SIMULASI AKTIF - Sistem tidak akan mengirim ke server.\n'));

    try {
        console.log(chalk.yellow(`[PROCESS] Menjalankan alur login & persiapan...\n`));
        
        const result = await magangService.prosesLoginDanAbsen(draftData);

        if (result.success) {
            console.log(chalk.green(`\n✅ ALUR SIMULASI SUKSES!`));
            console.log(chalk.green(`   Pesan Bot: ${result.pesan_tambahan || 'Berhasil (Simulasi)'}`));
            console.log(chalk.white('\nJika ini bukan simulasi, laporan Fitri sudah resmi terkirim sekarang.'));
        } else {
            console.log(chalk.red(`\n❌ SIMULASI GAGAL`));
            console.log(chalk.red(`   Error: ${result.pesan}`));
        }

    } catch (error) {
        console.error(chalk.bold.red(`\n💥 CRASH SAAT SIMULASI:`), error);
    }

    console.log('\n' + chalk.bold.yellow('--- DRAF SIMULASI SELESAI ---\n'));
}

draftSubmitFitry();
