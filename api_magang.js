// PERINTAH INSTALL (Wajib dijalankan di terminal):
// npm install axios axios-cookiejar-support tough-cookie cheerio

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');

// --- SETUP CLIENT CANGGIH ---
const createClient = (jar) => {
    return wrapper(axios.create({ 
        jar,
        withCredentials: true,
        maxRedirects: 20, 
        timeout: 30000,
        headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        }
    }));
};

// --- HELPER TANGGAL ---
function getTodayStr() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- HELPER LOGIN SSO (DIPAKAI BERSAMA) ---
async function executeSSOLogin(client, email, password) {
    console.log(`[API] 🚀 Login SSO: ${email}`);

    // 1. TEMBAK LANGSUNG URL SSO (JANGAN TUNGGU REDIRECT)
    // URL ini memaksa Kemnaker mengembalikan kita ke Monev setelah login sukses
    const targetUrl = 'https://account.kemnaker.go.id/auth/login?continue=https://monev.maganghub.kemnaker.go.id';
    
    console.log('[API] 1. Membuka Halaman Login...');
    const pageLogin = await client.get(targetUrl);
    
    // Ambil CSRF Token
    const $ = cheerio.load(pageLogin.data);
    const csrfToken = $('meta[name="csrf-token"]').attr('content');

    if (!csrfToken) {
        // Coba cek apakah kita sudah login duluan?
        if (pageLogin.request.res.responseUrl.includes('monev.maganghub')) {
            console.log('[API] ✅ Ternyata sudah login sebelumnya.');
            return true;
        }
        throw new Error("Gagal ambil CSRF Token Login.");
    }

    // 2. KIRIM PASSWORD
    console.log('[API] 2. Mengirim Kredensial...');
    const loginReq = await client.post('https://account.kemnaker.go.id/auth/login', { 
        username: email, password: password
    }, {
        headers: {
            'X-CSRF-TOKEN': csrfToken,
            'Referer': targetUrl,
            'Content-Type': 'application/json',
            'Origin': 'https://account.kemnaker.go.id'
        }
    });

    // 3. CEK HASIL
    // Axios akan mengikuti redirect otomatis. Kita cek mendarat dimana.
    const finalUrl = loginReq.request.res.responseUrl || loginReq.config.url;
    console.log(`[DEBUG] Mendarat di: ${finalUrl}`);
    
    if (finalUrl.includes('auth/login')) {
        throw new Error("Password Salah atau Gagal Login.");
    }
    
    // Jika mendarat di monev atau dashboard, berarti sukses
    if (finalUrl.includes('monev.maganghub') || finalUrl.includes('dashboard')) {
        console.log('[API] ✅ Login Sukses & Redirect Valid.');
        return true;
    }

    throw new Error("Login berhasil tapi tidak redirect ke Monev.");
}

// --- FUNGSI 1: CEK LOGIN SAJA (DAFTAR) ---
async function cekKredensial(email, password) {
    const jar = new CookieJar();
    const client = createClient(jar);
    try {
        await executeSSOLogin(client, email, password);
        return { success: true };
    } catch (error) {
        return { success: false, pesan: error.message };
    }
}

// --- FUNGSI 2: ABSEN ---
async function prosesLoginDanAbsen(dataUser) {
    const { email, password, aktivitas, pembelajaran, kendala } = dataUser;
    const jar = new CookieJar();
    const client = createClient(jar);

    try {
        // 1. Login
        await executeSSOLogin(client, email, password);

        // 2. Kirim Absen
        console.log('[API] 📝 Mengirim Laporan Harian...');
        const todayStr = getTodayStr();

        const payload = {
            date: todayStr,
            status: "PRESENT",
            activity_log: aktivitas,
            lesson_learned: pembelajaran,
            obstacles: kendala
        };

        const responseAbsen = await client.post('https://monev.maganghub.kemnaker.go.id/api/attendances/with-daily-log', payload, {
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://monev.maganghub.kemnaker.go.id',
                'Referer': 'https://monev.maganghub.kemnaker.go.id/dashboard',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        console.log(`[API RESPONSE] ${responseAbsen.status} ${responseAbsen.statusText}`);

        if (responseAbsen.status === 200 || responseAbsen.status === 201) {
            // Verifikasi
            try {
                const verifyUrl = `https://monev.maganghub.kemnaker.go.id/api/daily-logs?date=${todayStr}`;
                const resVerify = await client.get(verifyUrl);
                if (resVerify.data && resVerify.data.id) {
                    return { success: true, nama: email, pesan_tambahan: "✅ (Data Terverifikasi Masuk)" };
                }
            } catch (e) {}
            return { success: true, nama: email, pesan_tambahan: "⚠️ (Terkirim, cek web untuk memastikan)" };
        } else {
            return { success: false, pesan: `Gagal kirim: Server merespon ${responseAbsen.status}` };
        }

    } catch (error) {
        if (error.response) {
            console.error('[API FAIL]', error.response.status, JSON.stringify(error.response.data));
            if (error.response.status === 401) return { success: false, pesan: "Sesi Kedaluwarsa (401)." };
            if (error.response.status === 422) return { success: false, pesan: "Data Ditolak (422). Format tanggal salah atau duplikat." };
        }
        return { success: false, pesan: error.message };
    }
}

// --- FUNGSI 3: CEK STATUS (Untuk !cekabsen) ---
async function cekStatusHarian(email, password) {
    const jar = new CookieJar();
    const client = createClient(jar);

    try {
        console.log(`[API CHECK] Cek status harian: ${email}`);
        
        // 1. Login
        await executeSSOLogin(client, email, password);

        // 2. Ambil Data Log Hari Ini
        const todayStr = getTodayStr();
        console.log(`[API] Mengambil data tanggal: ${todayStr}`);

        const response = await client.get(`https://monev.maganghub.kemnaker.go.id/api/daily-logs?date=${todayStr}`, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://monev.maganghub.kemnaker.go.id/dashboard'
            }
        });

        // 3. Analisa Data
        if (response.data && response.data.id) {
            // Sudah Absen
            return { 
                success: true, 
                sudahAbsen: true, 
                data: response.data 
            };
        } else {
            // Belum Absen
            return { 
                success: true, 
                sudahAbsen: false 
            };
        }

    } catch (error) {
        console.error('[API CHECK FAIL]', error.message);
        return { success: false, pesan: error.message };
    }
}

module.exports = { prosesLoginDanAbsen, cekKredensial, cekStatusHarian };