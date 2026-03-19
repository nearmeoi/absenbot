const { getUserByPhone } = require('./src/services/database');
const { getDashboardStats, getRiwayat } = require('./src/services/magang');
const { isHoliday } = require('./src/config/holidays');

async function simulate() {
    const user = {
        name: 'Muh Kaisyar Anis',
        email: 'muhkaisyaranis2@gmail.com',
        password: '100Ical100!',
        phone: '22518547091644@lid',
        cycle_day: 16
    };
    
    const today = new Date(); // Wed Mar 11 2026
    
    console.log(`Simulating cekapprove for ${user.name}...`);
    
    const [statsResult, historyResult] = await Promise.all([
        getDashboardStats(user.email, user.password, today),
        getRiwayat(user.email, user.password, 45)
    ]);

    if (!statsResult.success) {
        console.log('Error:', statsResult.pesan);
        return;
    }

    const stats = statsResult.data;
    const fullLogs = stats.full_attendances || [];
    const historyLogs = historyResult.success ? historyResult.logs : [];

    // Cycle Range Logic (Simplified for simulation)
    // For cycle_day 16, start is Feb 16, end is Mar 16.
    const startPeriod = new Date(2026, 1, 16); // Feb 16
    const iterationEnd = new Date(2026, 2, 11); // Mar 11
    
    const logsMap = new Map();
    fullLogs.forEach(l => logsMap.set(l.date, l));
    historyLogs.forEach(l => { if (!logsMap.has(l.date)) logsMap.set(l.date, l); });

    let totalPending = 0;
    let pendingDates = [];

    let tempDate = new Date(startPeriod);
    while (tempDate <= iterationEnd) {
        const dStr = tempDate.toISOString().split('T')[0];
        const log = logsMap.get(dStr);
        if (log) {
            const approvalStatus = (log.approval_status || log.state || '').toUpperCase();
            if (approvalStatus !== 'APPROVED' && approvalStatus !== 'REJECTED' && !approvalStatus.includes('REVISI')) {
                totalPending++;
                pendingDates.push(dStr);
            }
        }
        tempDate.setDate(tempDate.getDate() + 1);
    }

    console.log(`Total Pending: ${totalPending}`);
    console.log(`Pending Dates: ${pendingDates.join(', ')}`);
}

simulate();
