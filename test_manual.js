/**
 * Manual Test Script untuk Login MagangHub
 * 
 * Usage: node test_manual.js <email> <password>
 * 
 * Contoh: node test_manual.js user@email.com password123
 */

const chalk = require("chalk");

// Import services
const magang = require("./src/services/magang");
const apiService = require("./src/services/apiService");

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log(chalk.yellow(`
========================================
  MANUAL TEST SCRIPT - MagangHub Bot
========================================

Usage: node test_manual.js <email> <password>

Contoh: 
  node test_manual.js akmaljie12355@gmail.com Akmaljhi123@

Test yang dilakukan:
  1. Clear session lama
  2. Login via Puppeteer
  3. Check session tersimpan
  4. Test API dengan session baru
  5. Cek status absen hari ini
========================================
`));
    process.exit(1);
}

const [email, password] = args;

async function runTest() {
    console.log(chalk.cyan("\n========================================"));
    console.log(chalk.cyan("  MEMULAI TEST MANUAL"));
    console.log(chalk.cyan("========================================\n"));
    console.log(chalk.white(`Email: ${email}`));
    console.log(chalk.white(`Password: ${'*'.repeat(password.length)}\n`));

    try {
        // Step 1: Clear old session
        console.log(chalk.yellow("\n[STEP 1] Menghapus session lama..."));
        apiService.clearSession(email);
        console.log(chalk.green("✓ Session lama dihapus\n"));

        // Step 2: Login via Puppeteer
        console.log(chalk.yellow("[STEP 2] Login via Puppeteer (akan membuka browser)..."));
        console.log(chalk.gray("Mohon tunggu, proses ini bisa memakan waktu 30-60 detik...\n"));

        const startTime = Date.now();
        const loginResult = await magang.cekKredensial(email, password);
        const loginDuration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (loginResult.success) {
            console.log(chalk.green(`✓ Login berhasil! (${loginDuration} detik)`));
            if (loginResult.foto) {
                console.log(chalk.gray(`  Screenshot: ${loginResult.foto}`));
            }
        } else {
            console.log(chalk.red(`✗ Login GAGAL: ${loginResult.pesan}`));
            process.exit(1);
        }

        // Step 3: Check session file
        console.log(chalk.yellow("\n[STEP 3] Mengecek session yang tersimpan..."));
        const session = apiService.loadSession(email);

        if (session) {
            console.log(chalk.green(`✓ Session ditemukan!`));
            console.log(chalk.gray(`  Jumlah cookies: ${session.cookies?.length || 0}`));
            console.log(chalk.gray(`  CSRF Token: ${session.csrfToken ? 'Ada' : 'Tidak ada'}`));
            console.log(chalk.gray(`  Timestamp: ${new Date(session.timestamp).toLocaleString()}`));

            // List cookie names
            if (session.cookies && session.cookies.length > 0) {
                console.log(chalk.gray(`  Cookies: ${session.cookies.map(c => c.name).join(', ')}`));
            }
        } else {
            console.log(chalk.red(`✗ Session tidak ditemukan atau tidak valid!`));
        }

        // Step 4: Wait a moment then test API
        console.log(chalk.yellow("\n[STEP 4] Menunggu 2 detik lalu test API..."));
        await new Promise(r => setTimeout(r, 2000));

        // Step 5: Check attendance status via API
        console.log(chalk.yellow("\n[STEP 5] Test API - Cek status absen hari ini..."));
        const statusResult = await magang.cekStatusHarian(email, password);

        if (statusResult.success) {
            if (statusResult.sudahAbsen) {
                console.log(chalk.green(`✓ API BERHASIL! Status: SUDAH ABSEN hari ini`));
                if (statusResult.data) {
                    console.log(chalk.gray(`  Data: ${JSON.stringify(statusResult.data, null, 2)}`));
                }
            } else {
                console.log(chalk.green(`✓ API BERHASIL! Status: BELUM ABSEN hari ini`));
            }
        } else {
            console.log(chalk.red(`✗ API GAGAL: ${statusResult.pesan}`));
        }

        // Summary
        console.log(chalk.cyan("\n========================================"));
        console.log(chalk.cyan("  HASIL TEST"));
        console.log(chalk.cyan("========================================"));
        console.log(chalk.white(`Login:        ${loginResult.success ? chalk.green('SUKSES') : chalk.red('GAGAL')}`));
        console.log(chalk.white(`Session:      ${session ? chalk.green('TERSIMPAN') : chalk.red('TIDAK ADA')}`));
        console.log(chalk.white(`API Check:    ${statusResult.success ? chalk.green('SUKSES') : chalk.red('GAGAL')}`));
        console.log(chalk.white(`Status Absen: ${statusResult.sudahAbsen ? chalk.green('SUDAH') : chalk.yellow('BELUM')}`));
        console.log(chalk.cyan("========================================\n"));

    } catch (error) {
        console.error(chalk.red("\n✗ ERROR FATAL:"), error.message);
        console.error(chalk.gray(error.stack));
        process.exit(1);
    }
}

// Run the test
runTest().then(() => {
    console.log(chalk.green("Test selesai!"));
    process.exit(0);
}).catch(err => {
    console.error(chalk.red("Test gagal:"), err);
    process.exit(1);
});
