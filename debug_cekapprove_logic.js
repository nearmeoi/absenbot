const { getRiwayat } = require('./src/services/magang');
const { isHoliday } = require('./src/config/holidays');
const chalk = require('chalk');

async function run() {
    // Mock user
    const email = 'amrinarosyadah2704@gmail.com';
    const password = '...'; // Not needed for cached session usually

    console.log("Mocking Date: Jan 24, 2026");
    const today = new Date('2026-01-24T12:00:00.000Z'); // Fixed date for test
    
    let startDate = new Date(today);
    let endDate = new Date(today);

    if (today.getDate() > 24) {
        startDate.setDate(24);
        endDate.setMonth(today.getMonth() + 1);
        endDate.setDate(24);
    } else {
        startDate.setMonth(today.getMonth() - 1);
        startDate.setDate(24);
        endDate.setDate(24);
    }

    const formatDate = (d) => d.toISOString().split('T')[0];
    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    console.log(`Range: ${startStr} to ${endStr}`);

    // Fetch
    console.log("Fetching logs...");
    const historyResult = await getRiwayat(email, 'dummy', 40);
    const logs = historyResult.logs || [];
    console.log(`Fetched ${logs.length} logs.`);

    const logMap = new Map();
    logs.forEach(log => {
        if (log.date) logMap.set(log.date, log);
    });

    console.log("Log for 2026-01-23 found?", logMap.has('2026-01-23'));
    if (logMap.has('2026-01-23')) {
        console.log("Log State:", logMap.get('2026-01-23').state);
    }

    let absentCount = 0;
    let approvedCount = 0;

    let currentDay = new Date(startDate);
    const endDayObj = new Date(endDate);

    while (currentDay <= endDayObj) {
        const currentStr = formatDate(currentDay);
        
        // Skip future logic for this test (or keep it if today is fixed)
        // Since we fixed today to Jan 24, future check needs to use that fixed today
        const isFuture = currentDay > today; 
        if (isFuture) {
             // console.log(`Skipping future: ${currentStr}`);
             currentDay.setDate(currentDay.getDate() + 1);
             continue;
        }

        const log = logMap.get(currentStr);
        const isHolidayOrWeekend = isHoliday(currentStr);

        if (log && !log.missing) {
            const state = (log.state || '').toUpperCase();
            if (state === 'COMPLETED' || state === 'APPROVED') {
                approvedCount++;
                console.log(`${currentStr}: APPROVED`);
            } else {
                console.log(`${currentStr}: ${state}`);
            }
        } else {
            if (isHolidayOrWeekend) {
                console.log(`${currentStr}: LIBUR`);
            } else {
                console.log(`${currentStr}: ABSENT`);
                absentCount++;
            }
        }
        currentDay.setDate(currentDay.getDate() + 1);
    }

    console.log(`Approved: ${approvedCount}`);
    console.log(`Absent: ${absentCount}`);
}

run();
