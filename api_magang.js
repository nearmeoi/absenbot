const puppeteer = require("puppeteer-core");
const axios = require("axios");
const fs = require("fs");
const { execSync } = require("child_process");

const SESSION_DIR = "./sessions";
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

const getChromiumPath = () => {
    return "/data/data/com.termux/files/usr/bin/chromium-browser";
};

// ============================================================
// 1. MESIN PUPPETEER: LOGIN & CURI DATA
// ============================================================
async function loginAndExtractData(email, password) {
    console.log(`[BROWSER] 🚀 Memulai Misi: ${email}`);
    const executablePath = getChromiumPath();
    if (!fs.existsSync(executablePath))
        throw new Error("Chromium tidak ditemukan.");

    let browser;
    let sniffedToken = null;

    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: executablePath,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--single-process",
                "--no-zygote"
            ]
        });

        const page = await browser.newPage();
        page.setDefaultTimeout(120000);
        await page.setUserAgent(USER_AGENT);

        await page.setRequestInterception(true);
        page.on("request", req => {
            const resourceType = req.resourceType();
            if (["image", "media", "font"].includes(resourceType)) {
                req.abort();
                return;
            }
            const headers = req.headers();
            if (headers["x-csrf-token"]) sniffedToken = headers["x-csrf-token"];
            req.continue();
        });

        // A. LOGIN FLOW
        await page.goto("https://account.kemnaker.go.id/auth/login", {
            waitUntil: "domcontentloaded"
        });

        if (
            page.url().includes("dashboard") ||
            page.url().includes("siapkerja")
        ) {
            await page.goto("https://account.kemnaker.go.id/auth/logout", {
                waitUntil: "domcontentloaded"
            });
            await page.goto("https://account.kemnaker.go.id/auth/login", {
                waitUntil: "domcontentloaded"
            });
        }

        console.log("[BROWSER] Mengetik...");
        const emailSel = 'input[name="username"]';
        await page.waitForSelector(emailSel, { visible: true });

        await page.type(emailSel, email, { delay: 10 });
        await page.type('input[type="password"]', password, { delay: 10 });

        console.log("[BROWSER] Klik Masuk...");
        await page.click('button[type="submit"]');

        try {
            await page.waitForFunction(
                () => !window.location.href.includes("auth/login"),
                { timeout: 60000 }
            );
        } catch {
            const errorMsg = await page.evaluate(() => {
                const el = document.querySelector(".alert-danger");
                return el ? el.innerText : null;
            });
            throw new Error(
                `Login Gagal: ${errorMsg ? errorMsg.trim() : "Timeout"}`
            );
        }

        // B. PINDAH KE MONEV
        console.log("[BROWSER] 🔄 Pindah ke MagangHub...");
        await page.goto("https://monev.maganghub.kemnaker.go.id/dashboard", {
            waitUntil: "networkidle2"
        });

        if (!page.url().includes("monev")) {
            await page.reload({ waitUntil: "networkidle2" });
        }

        console.log("[BROWSER] 📸 CEKREK! Login Sukses.");
        const buktiPath = `bukti_login_${Date.now()}.png`;
        await page.screenshot({ path: buktiPath });

        // D. KUMPULKAN HASIL CURIAN
        let cookies = await page.cookies();
        let finalCsrf = sniffedToken;

        if (!finalCsrf) {
            finalCsrf = await page.evaluate(() => {
                const el = document.querySelector('meta[name="csrf-token"]');
                return el ? el.content : null;
            });
        }

        if (!finalCsrf) {
            const content = await page.content();
            const match = content.match(/csrf-token"\s*content="([^"]+)"/);
            if (match) finalCsrf = match[1];
        }

        await browser.close();

        if (!finalCsrf && cookies.length > 0) {
            const xsrf = cookies.find(c => c.name === "XSRF-TOKEN");
            if (xsrf) finalCsrf = decodeURIComponent(xsrf.value);
        }

        if (!finalCsrf) finalCsrf = "TOKEN_MISSING";

        // SIMPAN KE FILE
        const finalData = {
            cookies: cookies,
            csrfToken: finalCsrf,
            updatedAt: Date.now()
        };

        fs.writeFileSync(
            `${SESSION_DIR}/${email}.json`,
            JSON.stringify(finalData, null, 2)
        );

        return { success: true, foto: buktiPath };
    } catch (error) {
        if (browser) await browser.close();
        return { success: false, pesan: error.message };
    }
}

// ============================================================
// 2. MESIN AXIOS: EKSEKUSI KILAT (PARSING FIX)
// ============================================================
async function executeAxios(
    email,
    password,
    action = "CHECK_STATUS",
    payloadData = null
) {
    const sessionPath = `${SESSION_DIR}/${email}.json`;

    if (!fs.existsSync(sessionPath)) {
        console.log("[AXIOS] Kunci tidak ada. Memanggil Browser...");
        const loginRes = await loginAndExtractData(email, password);
        if (!loginRes.success) return loginRes;
    }

    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    const cookieHeader = session.cookies
        .map(c => `${c.name}=${c.value}`)
        .join("; ");

    const client = axios.create({
        timeout: 30000,
        maxRedirects: 0,
        headers: {
            "User-Agent": USER_AGENT,
            Cookie: cookieHeader,
            "X-CSRF-TOKEN": session.csrfToken,
            "X-Requested-With": "XMLHttpRequest",
            Origin: "https://monev.maganghub.kemnaker.go.id",
            Referer: "https://monev.maganghub.kemnaker.go.id/dashboard",
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json"
        }
    });

    try {
        const todayStr = new Date().toISOString().split("T")[0];

        // --- HELPER PARSING ---
        // Fungsi ini mencari data tanggal hari ini di dalam tumpukan respon server
        const findLogForToday = responseData => {
            // Cek jika responseData.data adalah Array
            if (responseData.data && Array.isArray(responseData.data)) {
                return responseData.data.find(log => log.date === todayStr);
            }
            return null;
        };

        // --- AKSI: CEK STATUS ---
        if (action === "CHECK_STATUS") {
            console.log(`[AXIOS] 🔍 Cek Status: ${email}`);

            // Kita minta data spesifik tanggal ini (walau server kadang kasih semua)
            const res = await client.get(
                `https://monev.maganghub.kemnaker.go.id/api/daily-logs?date=${todayStr}`
            );

            // [FIX UTAMA] Parse Array
            const logHariIni = findLogForToday(res.data);

            if (logHariIni && logHariIni.id) {
                return { success: true, sudahAbsen: true, data: logHariIni };
            }
            return { success: true, sudahAbsen: false };
        }

        // --- AKSI: SUBMIT LAPORAN ---
        if (action === "SUBMIT") {
            console.log(`[AXIOS] 📤 Submit Laporan: ${email}`);

            // Cek dulu
            const cek = await client.get(
                `https://monev.maganghub.kemnaker.go.id/api/daily-logs?date=${todayStr}`
            );
            const logAda = findLogForToday(cek.data);

            if (logAda && logAda.id)
                return { success: false, pesan: "SUDAH ABSEN HARI INI! 🛑" };

            const payload = {
                date: todayStr,
                status: "PRESENT",
                activity_log: payloadData.aktivitas,
                lesson_learned: payloadData.pembelajaran,
                obstacles: payloadData.kendala
            };

            const resPost = await client.post(
                "https://monev.maganghub.kemnaker.go.id/api/attendances/with-daily-log",
                payload
            );

            if (resPost.status === 200 || resPost.status === 201) {
                return {
                    success: true,
                    nama: email,
                    pesan_tambahan: "⚡ (API Kilat)"
                };
            }
        }
    } catch (error) {
        console.log(`[AXIOS ERROR] ${error.message}`);

        if (
            error.response &&
            (error.response.status === 401 ||
                error.response.status === 419 ||
                error.response.status === 302)
        ) {
            console.log(
                "[AXIOS] ⚠️ Kunci Kedaluwarsa. Mengambil kunci baru..."
            );
            fs.unlinkSync(sessionPath);

            const loginRes = await loginAndExtractData(email, password);
            if (!loginRes.success) return loginRes;

            return await executeAxios(email, password, action, payloadData);
        }
        return { success: false, pesan: `API Error: ${error.message}` };
    }
    return { success: false, pesan: "Unknown Error" };
}

module.exports = {
    cekKredensial: async (e, p) => {
        if (fs.existsSync(`${SESSION_DIR}/${e}.json`))
            fs.unlinkSync(`${SESSION_DIR}/${e}.json`);
        return await loginAndExtractData(e, p);
    },
    cekStatusHarian: async (e, p) => {
        return await executeAxios(e, p, "CHECK_STATUS");
    },
    prosesLoginDanAbsen: async dataUser => {
        return await executeAxios(
            dataUser.email,
            dataUser.password,
            "SUBMIT",
            dataUser
        );
    }
};
