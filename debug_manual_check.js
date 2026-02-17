const { getDashboardStats, getRiwayat } = require('./src/services/magang');
const { isHoliday } = require('./src/config/holidays');
const fs = require('fs');
const path = require('path');

async function run() {
    console.log("Starting manual check for 'mazid'...");

    // 1. Load User
    const usersPath = path.join(__dirname, 'users.json');
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const user = users.find(u => u.email.includes('mazid'));

    if (!user) {
        console.error("User 'mazid' not found in users.json");
        return;
    }

    console.log(`User found: ${user.name} (${user.email})`);

    // 2. Fetch Data
    console.log("Fetching data (Dashboard & Riwayat)...");
    const [statsResult, historyResult] = await Promise.all([
        getDashboardStats(user.email, user.password, true), // useCache = true
        getRiwayat(user.email, user.password, 40)
    ]);

    if (!statsResult.success) {
        console.error(`Failed to get dashboard stats: ${statsResult.pesan}`);
        return;
    }

    const stats = statsResult.data;
    const cal = stats.calendar || { approved: [], rejected: [], revision: [], pending: [], alpha: [] };
    const logs = historyResult.success ? historyResult.logs : [];

    const today = new Date();
    // Use end of today for comparison to include today
    const compareToday = new Date(today);
    compareToday.setHours(23, 59, 59, 999);

    // 3. Filter Calendar Data (Current Month)
    // We want to count pending items that are:
    // a) Not holidays
    // b) Not in the future
    const currentMonthPendingDates = [];
    if (cal.pending) {
        cal.pending.forEach(day => {
            const d = new Date(today.getFullYear(), today.getMonth(), parseInt(day));
            const dStr = d.toISOString().split('T')[0];
            
            // Check if date is in the future
            const isFuture = d > compareToday;

            if (!isHoliday(dStr) && !isFuture) {
                currentMonthPendingDates.push(day);
            }
        });
    }

    // 4. Determine "Supplement" Range (Previous Month part of the cycle)
    const startPeriod = new Date(today);
    if (today.getDate() > 24) {
        startPeriod.setDate(24);
    } else {
        startPeriod.setMonth(today.getMonth() - 1);
        startPeriod.setDate(24);
    }
    startPeriod.setHours(0, 0, 0, 0);

    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const supplementLogs = logs.filter(log => {
        const d = new Date(log.date);
        d.setHours(0, 0, 0, 0);
        return d >= startPeriod && d < currentMonthStart;
    });

    // 5. Merge Data
    let totalApprove = stats.hadir;
    let totalRejected = stats.ditolak;
    let totalRevisi = stats.revisi;
    
    // Initial counts from current month filtered
    let totalPending = currentMonthPendingDates.length;
    let totalAlpha = stats.tidakHadirTanpaKet;

    const rejectedDates = [...(cal.rejected || [])];
    const finalPendingDates = [...currentMonthPendingDates]; // Start with current month filtered
    const revisionDates = [...(cal.revision || [])];
    const alphaDates = [...(cal.alpha || [])];

    // Supplement Map
    const supplementMap = new Map();
    supplementLogs.forEach(l => supplementMap.set(l.date, l));

    let tempDate = new Date(startPeriod);
    while (tempDate < currentMonthStart) {
        const dStr = tempDate.toISOString().split('T')[0];
        const log = supplementMap.get(dStr);
        const isWorkDay = !isHoliday(dStr);

        if (log) {
            const dateObj = new Date(log.date);
            const dayLabel = `${dateObj.getDate()} ${dateObj.toLocaleString('id-ID', { month: 'short' })}`;
            const state = (log.state || '').toUpperCase();
            
            if (state === 'APPROVED') {
                totalApprove++;
            } else if (state === 'REJECTED' || state === 'DITOLAK') {
                totalRejected++;
                rejectedDates.push(dayLabel);
            } else if (state === 'COMPLETED' || state === 'PENDING' || state === 'SUBMITTED') {
                totalPending++;
                finalPendingDates.push(dayLabel);
            } else if (state.includes('REVISI')) {
                totalRevisi++;
                revisionDates.push(dayLabel);
            }
        } else if (isWorkDay) {
            // MISSING on a working day = ALPA
            totalAlpha++;
            const dayLabel = `${tempDate.getDate()} ${tempDate.toLocaleString('id-ID', { month: 'short' })}`;
            alphaDates.push(dayLabel);
        }
        tempDate.setDate(tempDate.getDate() + 1);
    }

    const formatLine = (count, datesArr) => {
        if (count > 0 && datesArr && datesArr.length > 0) {
            return `${count} [tanggal: ${datesArr.join(', ')}]`;
        }
        if (count > 0) {
            return `${count} [tanggal: -]`;
        }
        return `${count}`;
    };

    console.log("\n=== LAPORAN DASHBOARD ===");
    console.log(`Periode: ${stats.periode || 'Bulan Ini'}`);
    console.log(`Nama: ${user.name}`);
    console.log("\nRingkasan:");
    console.log(`Approve: ${totalApprove}`);
    console.log(`Belum di Approve: ${formatLine(totalPending, finalPendingDates)}`);
    console.log(`Revisi: ${formatLine(totalRevisi, revisionDates)}`);
    console.log(`Ditolak: ${formatLine(totalRejected, rejectedDates)}`);
    console.log(`Alpa: ${formatLine(totalAlpha, alphaDates)}`);
}

run().catch(console.error);