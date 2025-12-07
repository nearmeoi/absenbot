const puppeteer = require('puppeteer-core');
const axios = require('axios');
const fs = require('fs');
const { execSync } = require('child_process');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');

const SESSION_DIR = './sessions';
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

const getChromiumPath = () => {
    return '/data/data/com.termux/files/usr/bin/chromium-browser';
};

// ============================================================
// 1. MESIN PUPPETEER: LOGIN & CURI DATA (Jalan Kaki)
// ============================================================
async function runPuppeteer(email, password, mode = 'LOGIN', dataLaporan = null) {
    console.log(`[BROWSER] 🚀 Memulai Misi: ${email} (${mode})`);
    const executablePath = getChromiumPath();
    if (!fs.existsSync(executablePath)) throw new Error("Chromium tidak ditemukan.");

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: executablePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--single-process', '--no-zygote']
        });

        const page = await browser.newPage();
        page.setDefaultTimeout(120000); 
        await page.setUserAgent(USER_AGENT);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'media', 'font'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        // A. LOGIN FLOW
        console.log('[BROWSER] Buka Login...');
        await page.goto('https://account.kemnaker.go.id/auth/login', { waitUntil: 'domcontentloaded' });

        if (page.url().includes('dashboard') || page.url().includes('siapkerja')) {
             console.log('[BROWSER] Sesi lama. Logout...');
             await page.goto('https://account.kemnaker.go.id/auth/logout', { waitUntil: 'domcontentloaded' });
             await page.goto('https://account.kemnaker.go.id/auth/login', { waitUntil: 'domcontentloaded' });
        }

        console.log('[BROWSER] Mengetik...');
        const emailSel = 'input[name="username"]';
        await page.waitForSelector(emailSel, { visible: true });
        
        await page.type(emailSel, email, { delay: 20 });
        await page.type('input[type="password"]', password, { delay: 20 });
        
        console.log('[BROWSER] Klik Masuk...');
        await page.click('button[type="submit"]');
        
        // B. TUNGGU MASUK SIAPKERJA
        try {
            await page.waitForFunction(() => !window.location.href.includes('auth/login'), { timeout: 60000 });
        } catch {
             const errorMsg = await page.evaluate(() => {
                const el = document.querySelector('.alert-danger');
                return el ? el.innerText : null;
            });
            throw new Error(`Login Gagal: ${errorMsg ? errorMsg.trim() : "Timeout/Stuck"}`);
        }

        // C. JALAN KAKI KE MONEV
        console.log('[BROWSER] 🔄 Pindah ke MagangHub...');
        await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', { waitUntil: 'networkidle2' });

        if (!page.url().includes('monev')) {
            await page.reload({ waitUntil: 'networkidle2' });
            if (!page.url().includes('monev')) throw new Error("Gagal masuk Monev setelah login.");
        }
        
        console.log('[BROWSER] 📸 CEKREK! Login Sukses.');
        const buktiPath = `bukti_login_${Date.now()}.png`;
        await page.screenshot({ path: buktiPath });

        // D. CURI DATA (TOKEN & COOKIE)
        console.log('[BROWSER] 🕵️‍♂️ Menyadap Token...');
        
        // Cari Token di HTML
        let csrfToken = await page.evaluate(() => {
            const el = document.querySelector('meta[name="csrf-token"]');
            return el ? el.content : null;
        });

        // Ambil Cookies
        const cookies = await page.cookies();
        
        await browser.close();

        // Cari Token di Cookie jika HTML null
        if (!csrfToken && cookies.length > 0) {
            const xsrf = cookies.find(c => c.name === 'XSRF-TOKEN');
            if (xsrf) csrfToken = decodeURIComponent(xsrf.value);
        }

        if (!csrfToken) {
            console.log('[BROWSER] ⚠️ Token kosong. Menyimpan session parsial.');
            csrfToken = ""; 
        } else {
            console.log(`[BROWSER] ✅ TOKEN DIDAPAT: ${csrfToken.substring(0, 10)}...`);
        }

        // SIMPAN KE FILE
        const finalData = {
            cookies: cookies,
            csrfToken: csrfToken,
            updatedAt: Date.now()
        };

        fs.writeFileSync(`${SESSION_DIR}/${email}.json`, JSON.stringify(finalData, null, 2));
        
        return { success: true, foto: buktiPath };

    } catch (error) {
        if (browser) await browser.close();
        return { success: false, pesan: error.message };
    }
}

// ============================================================
// 2. MESIN AXIOS: EKSEKUSI KILAT
// ============================================================
const createAxiosClient = (session) => {
    const cookieHeader = session.cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const headers = {
        'User-Agent': USER_AGENT,
        'Cookie': cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://monev.maganghub.kemnaker.go.id',
        'Referer': 'https://monev.maganghub.kemnaker.go.id/dashboard',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
    };

    if (session.csrfToken) {
        headers['X-CSRF-TOKEN'] = session.csrfToken;
        headers['X-XSRF-TOKEN'] = session.csrfToken;
    }

    return axios.create({
        timeout: 30000,
        maxRedirects: 0,
        headers: headers
    });
};

async function executeAxios(email, password, action = 'CHECK_STATUS', payloadData = null) {
    const sessionPath = `${SESSION_DIR}/${email}.json`;

    if (!fs.existsSync(sessionPath)) {
        console.log('[AXIOS] Kunci tidak ada. Memanggil Browser...');
        // [FIX] PANGGIL FUNGSI YANG BENAR
        const loginRes = await runPuppeteer(email, password, 'LOGIN');
        if (!loginRes.success) return loginRes;
    }

    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    const client = createAxiosClient(session);

    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // --- AKSI: CEK STATUS ---
        if (action === 'CHECK_STATUS') {
            console.log(`[AXIOS] 🔍 Cek Status: ${email}`);
            const res = await client.get(`https://monev.maganghub.kemnaker.go.id/api/daily-logs?date=${todayStr}`);
            
            const logs = res.data.data || [];
            const logHariIni = Array.isArray(logs) ? logs.find(l => l.date === todayStr) : null;

            if (logHariIni) {
                return { success: true, sudahAbsen: true, data: logHariIni };
            }
            return { success: true, sudahAbsen: false };
        }

        // --- AKSI: SUBMIT LAPORAN ---
        if (action === 'SUBMIT') {
            console.log(`[AXIOS] 📤 Submit Laporan: ${email}`);
            
            const cek = await client.get(`https://monev.maganghub.kemnaker.go.id/api/daily-logs?date=${todayStr}`);
            if (cek.data && cek.data.id) return { success: false, pesan: "SUDAH ABSEN HARI INI! 🛑" };

            const payload = {
                date: todayStr,
                status: "PRESENT",
                activity_log: payloadData.aktivitas,
                lesson_learned: payloadData.pembelajaran,
                obstacles: payloadData.kendala
            };

            const resPost = await client.post('https://monev.maganghub.kemnaker.go.id/api/attendances/with-daily-log', payload);

            if (resPost.status === 200 || resPost.status === 201) {
                const resVerify = await client.get(`https://monev.maganghub.kemnaker.go.id/api/daily-logs?date=${todayStr}`);
                const vLogs = resVerify.data.data || [];
                const isVerified = vLogs.find(l => l.date === todayStr) ? "✅ TERVERIFIKASI" : "⚠️ Pending";
                return { success: true, nama: email, pesan_tambahan: `(${isVerified})` };
            }
        }

    } catch (error) {
        console.log(`[AXIOS ERROR] ${error.message}`);
        
        // Auto Relogin
        if (error.response && (error.response.status === 401 || error.response.status === 419 || error.response.status === 302)) {
            console.log('[AXIOS] ⚠️ Kunci Kedaluwarsa. Mengambil kunci baru...');
            fs.unlinkSync(sessionPath);
            
            // [FIX] PANGGIL FUNGSI YANG BENAR
            const loginRes = await runPuppeteer(email, password, 'LOGIN');
            if (!loginRes.success) return loginRes;
            
            return await executeAxios(email, password, action, payloadData);
        }
        return { success: false, pesan: `API Error: ${error.message}` };
    }
    return { success: false, pesan: "Unknown Error" };
}

// --- EXPORTS ---
module.exports = {
    // !daftar: Pakai Browser
    cekKredensial: async (e, p) => {
        if (fs.existsSync(`${SESSION_DIR}/${e}.json`)) fs.unlinkSync(`${SESSION_DIR}/${e}.json`);
        // [FIX] PANGGIL FUNGSI YANG BENAR
        return await runPuppeteer(e, p, 'LOGIN');
    },
    
    // !cekabsen: Pakai Axios
    cekStatusHarian: async (e, p) => {
        return await executeAxios(e, p, 'CHECK_STATUS');
    },

    // !absen: Pakai Axios
    prosesLoginDanAbsen: async (dataUser) => {
        return await executeAxios(dataUser.email, dataUser.password, 'SUBMIT', dataUser);
    }
};