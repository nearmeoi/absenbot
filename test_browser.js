const puppeteer = require("puppeteer-core");
const { execSync } = require("child_process");
const fs = require("fs");

const getChromiumPath = () => {
    const paths = [
        "/data/data/com.termux/files/usr/bin/chromium",
        "/data/data/com.termux/files/usr/bin/chromium-browser"
    ];
    for (let p of paths) if (fs.existsSync(p)) return p;
    try {
        return execSync("which chromium").toString().trim();
    } catch (e) {}
    return null;
};

(async () => {
    console.log("[TEST] 1. Mencari Chromium...");
    const exePath = getChromiumPath();
    console.log(`[TEST] Path: ${exePath}`);

    if (!exePath) {
        console.error(
            "[TEST] ❌ CHROMIUM TIDAK DITEMUKAN! Jalankan: pkg install chromium"
        );
        return;
    }

    console.log("[TEST] 2. Meluncurkan Browser...");
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            executablePath: exePath,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--single-process",
                "--no-zygote"
            ]
        });

        console.log("[TEST] ✅ Browser Terbuka!");
        const page = await browser.newPage();

        console.log("[TEST] 3. Buka Google...");
        await page.goto("https://www.google.com");

        const title = await page.title();
        console.log(`[TEST] ✅ Judul Website: ${title}`);

        await browser.close();
        console.log("[TEST] Selesai. Puppeteer Normal.");
    } catch (e) {
        console.error("[TEST] ❌ ERROR FATAL:", e);
    }
})();
