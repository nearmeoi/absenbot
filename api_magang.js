const puppeteer = require("puppeteer-core");
const axios = require("axios");
const fs = require("fs");
const { execSync } = require("child_process");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");
const cheerio = require("cheerio");

// --- SETUP FOLDER ---
const SESSION_DIR = "./sessions";
const TEMP_DIR = "./temp"; // Folder Sampah Sementara

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR); // Buat folder temp jika belum ada

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

const getChromiumPath = () => {
    return "/data/data/com.termux/files/usr/bin/chromium-browser";
};

// --- FUNGSI UTAMA ---
async function runPuppeteer(
    email,
    password,
    mode = "LOGIN",
    dataLaporan = null
) {
    console.log(`[BROWSER] 🚀 Mode: ${mode} (${email})`);
    const executablePath = getChromiumPath();

    let browser;
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
        page.setDefaultTimeout(90000);
        await page.setUserAgent(USER_AGENT);

        await page.setRequestInterception(true);
        page.on("request", req => {
            if (["image", "media", "font"].includes(req.resourceType()))
                req.abort();
            else req.continue();
        });

        // 1. LOGIN FLOW
        const loginUrl = `https://account.kemnaker.go.id/auth/login?continue=${encodeURIComponent(
            "https://monev.maganghub.kemnaker.go.id/dashboard"
        )}`;
        await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

        if (
            !page.url().includes("dashboard") &&
            !page.url().includes("monev")
        ) {
            console.log("[BROWSER] Login process...");
            await page.waitForSelector('input[name="username"]', {
                visible: true
            });

            await page.type(emailSel, email, { delay: 20 });
            await page.type('input[type="password"]', password, { delay: 20 });
            await page.click('button[type="submit"]');

            try {
                await page.waitForFunction(
                    () =>
                        location.href.includes("monev") ||
                        location.href.includes("dashboard"),
                    { timeout: 60000 }
                );
            } catch {
                if (page.url().includes("auth/login"))
                    throw new Error("Password Salah / Login Gagal");
            }
        }

        // Simpan Cookie
        const cookies = await page.cookies();
        fs.writeFileSync(
            `${SESSION_DIR}/${email}.json`,
            JSON.stringify(cookies, null, 2)
        );

        // [FITUR FOTO BUKTI LOGIN]
        let loginProofPath = null;
        if (mode === "LOGIN") {
            console.log("[BROWSER] 📸 Mengambil Bukti Login...");
            loginProofPath = `${TEMP_DIR}/login_${Date.now()}.png`; // Simpan di temp
            await page.screenshot({ path: loginProofPath });
            await browser.close();
            return { success: true, foto: loginProofPath };
        }

        // --- MODE A: CEK STATUS ---
        if (mode === "CEK_STATUS") {
            // (Logika Cek Status sama seperti sebelumnya...)
            // Saya singkat agar muat. Fokus kita di path foto.
            await browser.close();
            return { success: true, sudahAbsen: false };
        }

        // --- MODE B: SUBMIT LAPORAN ---
        if (mode === "SUBMIT") {
            console.log("[BROWSER] 📝 Mengisi Form...");
            if (!page.url().includes("dashboard"))
                await page.goto(
                    "https://monev.maganghub.kemnaker.go.id/dashboard",
                    { waitUntil: "domcontentloaded" }
                );

            // ... (Logika Isi Form & Klik Tanggal sama) ...

            const tgl = new Date().getDate().toString();
            await page.waitForSelector("td.clickable-day, div.day", {
                timeout: 20000
            });
            const clicked = await page.evaluate(d => {
                /*...*/ return true;
            }, tgl);
            if (!clicked) throw new Error("Gagal klik tanggal.");

            await page.waitForSelector("textarea", { visible: true });

            // Isi Textarea...
            const textareas = await page.$$("textarea");
            if (textareas.length >= 3) {
                await textareas[0].type(dataLaporan.aktivitas);
                await textareas[1].type(dataLaporan.pembelajaran);
                await textareas[2].type(dataLaporan.kendala);
            }

            const checkbox = await page.$('input[type="checkbox"]');
            if (checkbox) await checkbox.click();

            const btnSimpan = await page.$x(
                "//button[contains(., 'Simpan') or contains(., 'Kirim')]"
            );
            if (btnSimpan.length > 0) {
                await btnSimpan[0].click();
                await new Promise(r => setTimeout(r, 5000));

                // [FIX] SIMPAN BUKTI DI TEMP
                const pathFoto = `${TEMP_DIR}/bukti_${Date.now()}.png`;
                await page.screenshot({ path: pathFoto });
                await browser.close();

                return {
                    success: true,
                    nama: email,
                    foto: pathFoto,
                    pesan_tambahan: "(Via Browser)"
                };
            }
            throw new Error("Tombol simpan hilang.");
        }

        await browser.close();
        return { success: true };
    } catch (error) {
        if (browser) await browser.close();
        return { success: false, pesan: error.message };
    }
}

// ... (WRAPPER & AXIOS SAMA SEPERTI SEBELUMNYA) ...
// (Copy paste bagian Axios & Wrapper dari kode sebelumnya, tidak ada perubahan path foto di sana)

// PASTIKAN MODULE EXPORTS ADA
module.exports = {
    prosesLoginDanAbsen: async dataUser => {
        // ... (Logic Hybrid) ...
        // Jika Fallback ke Browser, dia akan pakai runPuppeteer di atas yang sudah pakai TEMP_DIR
        return await runPuppeteer(
            dataUser.email,
            dataUser.password,
            "SUBMIT",
            dataUser
        );
    },
    cekKredensial: async (e, p) => {
        try {
            if (fs.existsSync(`${SESSION_DIR}/${e}.json`))
                fs.unlinkSync(`${SESSION_DIR}/${e}.json`);
            return await runPuppeteer(e, p, "LOGIN");
        } catch (err) {
            return { success: false, pesan: err.message };
        }
    },
    cekStatusHarian: async (e, p) => {
        /* ... */
    }
};
