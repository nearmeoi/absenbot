const apiService = require('./src/services/apiService');
const fs = require('fs');
const { USERS_FILE } = require('./src/config/constants');

async function check() {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.email === 'fitryoya@gmail.com');
    if (!user) {
        console.log('User not found');
        return;
    }

    console.log(`Checking history for ${user.email}...`);
    try {
        const result = await apiService.getRiwayat(user.email, user.password, 5);
        if (result.success) {
            console.log('Recent logs:');
            result.logs.forEach(log => {
                console.log(`- Date: ${log.date}, Status: ${log.status_pengerjaan}, Activity: ${log.aktivitas.substring(0, 50)}...`);
            });
            
            const yesterday = '2026-03-03';
            const yesterdayLog = result.logs.find(l => l.date === yesterday);
            if (yesterdayLog) {
                console.log(`
✅ BERHASIL: Aurora sudah absen kemarin (${yesterday}) dengan status: ${yesterdayLog.status_pengerjaan}`);
            } else {
                console.log(`
❌ GAGAL: Tidak ditemukan data absen Aurora untuk kemarin (${yesterday})`);
            }
        } else {
            console.log('Failed to fetch history:', result.pesan);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

check();
