const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { cariUserHP } = require('./src/services/database');
const { prosesLoginDanAbsen } = require('./src/services/magang');
const { getMessage } = require('./src/services/messageService');

const SCHEDULED_REPORTS_FILE = path.join(__dirname, 'data/scheduled_reports.json');

async function forceSubmit() {
    console.log(chalk.cyan('🚀 Memulai paksa pengiriman laporan web terjadwal...'));
    
    if (!fs.existsSync(SCHEDULED_REPORTS_FILE)) {
        console.error('File data tidak ditemukan.');
        return;
    }

    try {
        const scheduled = JSON.parse(fs.readFileSync(SCHEDULED_REPORTS_FILE, 'utf8'));
        const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: 'Asia/Makassar' }));
        const today = nowInTz.toISOString().split('T')[0];

        // Filter reports for today that are NOT success
        const toProcess = scheduled.filter(s => 
            s.date === today && s.status !== 'success'
        );

        if (toProcess.length === 0) {
            console.log(chalk.yellow('Tidak ada laporan untuk diproses hari ini.'));
            return;
        }

        console.log(chalk.cyan(`Menemukan ${toProcess.length} laporan untuk diproses.`));

        for (const report of toProcess) {
            const user = cariUserHP(report.phone);
            if (!user) {
                console.error(chalk.red(`[FAIL] User dengan phone/ID ${report.phone} tetap tidak ditemukan.`));
                report.status = 'failed';
                report.error = 'User not found (Final)';
                continue;
            }

            console.log(chalk.blue(`[PROCESS] Mengirim laporan untuk ${user.email} (${user.name})...`));
            
            const result = await prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas: report.aktivitas,
                pembelajaran: report.pembelajaran,
                kendala: report.kendala
            });

            if (result.success) {
                console.log(chalk.green(`[SUCCESS] Berhasil untuk ${user.email}`));
                report.status = 'success';
                report.error = null;
            } else {
                console.error(chalk.red(`[FAILED] Gagal untuk ${user.email}: ${result.pesan}`));
                report.status = 'failed';
                report.error = result.pesan;
            }
            
            // Wait to avoid rate limit/concurrency issues
            await new Promise(r => setTimeout(r, 5000));
        }

        fs.writeFileSync(SCHEDULED_REPORTS_FILE, JSON.stringify(scheduled, null, 2));
        console.log(chalk.green('\n✅ Proses selesai. Data telah diperbarui.'));

    } catch (e) {
        console.error(chalk.red('CRASH:'), e);
    }
}

forceSubmit();
