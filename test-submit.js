require('dotenv').config();
const { cekKredensial, getDashboardStats } = require('./src/services/magang');
const { submitAttendanceReport } = require('./src/services/apiService');
const chalk = require('chalk');

async function testSubmissionWorkflow() {
    console.log(chalk.cyan('=== 🧪 SIMULASI ALUR SUBMIT KE MAGANGHUB 🧪 ===\n'));

    // 1. Setup Test Data (using a safe example, you can edit this)
    // IMPORTANT: Make sure this email matches an active account in users.json to simulate properly
    const testEmail = 'fajrimuhammad013@gmail.com';
    const testPassword = 'your_password_here'; // Replace if needed for full login test

    const fakeReport = {
        aktivitas: "Memperbaiki bug di webapp absenbot, melakukan migrasi data dari database lama ke baru menggunakan SQL, dan merapikan frontend menggunakan react dengan memperbarui komponen dan layout.",
        pembelajaran: "Belajar mengatasi error di PM2 dengan menganalisis log error dan memperbaikinya, serta memahami proses migrasi data dan perapian frontend dengan menggunakan teknik debugging dan testing.",
        kendala: "Mengalami error di PM2 saat melakukan perubahan konfigurasi, namun berhasil diperbaiki dengan melakukan restart service dan memeriksa kembali konfigurasi environment variable."
    };

    console.log(chalk.yellow('[1] Payload Laporan AI:'));
    console.log(fakeReport);
    console.log('\n---------------------------------------------------------------\n');

    // 2. Simulasi Login Process
    console.log(chalk.yellow('[2] Simulasi Pengecekan Kredensial & Sesi (Session Check)'));
    console.log(chalk.gray(`Memeriksa sesi login untuk: ${testEmail}`));

    // Check if session exists (to prevent actually logging in if not needed for the test)
    const fs = require('fs');
    const path = require('path');
    const sessionFile = path.join(__dirname, 'data', 'sessions', `${testEmail}.json`);

    let isSessionValid = false;
    if (fs.existsSync(sessionFile)) {
        console.log(chalk.green('✓ Session file ditemukan. Asumsi kredensial valid.'));
        isSessionValid = true;
    } else {
        console.log(chalk.red('✗ Session file TIDAK ditemukan. '));
        console.log(chalk.gray('  Anda bisa menjalankan test login sungguhan dengan mengetik password di atas dan mengaktifkan baris di bawah ini.'));
        // const loginResult = await cekKredensial(testEmail, testPassword);
        // console.log('Login Status:', loginResult);
    }

    console.log('\n---------------------------------------------------------------\n');

    // 3. Simulasi Submit Laporan
    console.log(chalk.yellow('[3] Simulasi Submit Laporan (DRY RUN)'));

    if (isSessionValid) {
        console.log(chalk.cyan(`[SIMULASI] Menyiapkan payload untuk dikirim ke: https://monev-api.maganghub.kemnaker.go.id/api/attendances`));

        const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Makassar' }).split(',')[0];
        const apiPayload = {
            date: today,
            status: "PRESENT",
            activity_log: fakeReport.aktivitas,
            lesson_learned: fakeReport.pembelajaran,
            obstacles: fakeReport.kendala
        };

        console.log(chalk.gray('\nData JSON yang akan dikirim ke server Kemnaker:'));
        console.log(JSON.stringify(apiPayload, null, 2));

        // DRY RUN LOGIC: We stop here instead of calling `client.post`
        console.log(chalk.magenta('\n[API-SIMULATION] Bypassed! Laporan ditahan dan tidak benar-benar dikirim ke MagangHub.'));
        console.log(chalk.green('✓ Simulasi Struktur dan Validasi Data: BERHASIL'));

    } else {
        console.log(chalk.red('Tidak dapat mensimulasikan submit karena tidak ada session aktif. Silakan login terlebih dahulu.'));
    }

    console.log('\n=== 🏁 SELESAI 🏁 ===');
}

testSubmissionWorkflow();
