const apiService = require('./src/services/apiService');
const fs = require('fs');
const path = require('path');

async function check() {
    // Absolute path to users.json in the project root
    const USERS_FILE = '/home/ubuntu/absenbot/users.json';
    
    if (!fs.existsSync(USERS_FILE)) {
        console.log(`Error: ${USERS_FILE} not found`);
        return;
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.email === 'fitryoya@gmail.com');
    if (!user) {
        console.log('User Fitri Aurora (fitryoya@gmail.com) not found in users.json');
        return;
    }

    console.log(`Checking history for ${user.name} (${user.email})...`);
    try {
        const result = await apiService.getAttendanceHistory(user.email, 5);
        if (result.success) {
            console.log('Recent logs:');
            result.logs.forEach(log => {
                const activity = log.aktivitas || log.activity_log || 'N/A';
                console.log(`- Date: ${log.date}, Status: ${log.status_pengerjaan || log.status}, Activity: ${activity.substring(0, 50)}...`);
            });
            
            const datesToCheck = ['2026-03-03', '2026-03-04'];
            
            datesToCheck.forEach(date => {
                const log = result.logs.find(l => l.date === date);
                if (log) {
                    console.log(`\n✅ BERHASIL: Aurora sudah absen pada ${date} dengan status: ${log.status_pengerjaan || log.status}`);
                } else {
                    console.log(`\n❌ BELUM ABSEN: Tidak ditemukan data absen Aurora untuk ${date}`);
                }
            });

        } else {
            console.log('Failed to fetch history:', result.pesan);
        }
    } catch (e) {
        console.error('Error during API call:', e.message);
        console.error(e.stack);
    }
}

check();
