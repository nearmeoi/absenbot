const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { CHROMIUM_PATH, PUPPETEER_ARGS, PUPPETEER_HEADLESS } = require('../src/config/constants');

const EMAIL = 'mazid.gifari16@gmail.com';
const PASSWORD = 'your_password_here'; // Wait, I need to fetch the password from users.json

const users = JSON.parse(fs.readFileSync(path.join(__dirname, '../users.json'), 'utf8'));
const targetUser = users.find(u => u.email === EMAIL);

if (!targetUser) {
    console.error('User not found');
    process.exit(1);
}

(async () => {
    console.log(`Debugging for ${targetUser.email}`);
    const browser = await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        executablePath: CHROMIUM_PATH,
        args: PUPPETEER_ARGS
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // 1. LOGIN
    await page.goto('https://account.kemnaker.go.id/auth/login', { waitUntil: 'domcontentloaded' });
    
    // Check if login needed
    if (await page.$('input[type="email"]')) {
        await page.type('input[type="email"]', targetUser.email);
        await page.type('input[type="password"]', targetUser.password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
    }

    // 2. GOTO DASHBOARD
    await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });

    // 3. DUMP
    console.log('Page loaded. Dumping content...');
    const html = await page.content();
    fs.writeFileSync('debug_dashboard.html', html);
    await page.screenshot({ path: 'debug_dashboard.png' });

    console.log('Saved debug_dashboard.html and debug_dashboard.png');
    await browser.close();
})();
