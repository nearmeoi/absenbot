const { cekStatusHarian, getRiwayat } = require('./src/services/magang');
const { getUserByPhone } = require('./src/services/database');

async function check() {
    const email = 'muhkaisyaranis2@gmail.com';
    const password = '100Ical100!';
    
    console.log(`Checking status for ${email}...`);
    
    const status = await cekStatusHarian(email, password);
    console.log('Status Hari Ini:', JSON.stringify(status, null, 2));
    
    const riwayat = await getRiwayat(email, password, 10);
    console.log('Riwayat 10 Hari Terakhir:', JSON.stringify(riwayat, null, 2));
}

check();
