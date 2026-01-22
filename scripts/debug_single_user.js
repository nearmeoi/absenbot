const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { CHROMIUM_PATH, PUPPETEER_ARGS } = require('../src/config/constants');

const EMAIL = 'mazid.gifari16@gmail.com';
const PASSWORD = 'your_password_here'; // Placeholder, will read from file

// Read real password
const users = JSON.parse(fs.readFileSync(path.join(__dirname, '../users.json'), 'utf8'));
const targetUser = users.find(u => u.email === EMAIL);

if (!targetUser) {
    console.error('User not found!');
    process.exit(1);
}

(async () => {
    console.log(`Debugging for ${targetUser.email}...`);
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: CHROMIUM_PATH,
        args: [...PUPPETEER_ARGS, '--window-size=1280,800']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Log console output from browser
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    try {
        // 1. LOGIN
        console.log('Navigating to login...');
        await page.goto('https://account.kemnaker.go.id/auth/login', { waitUntil: 'networkidle2' });
        await page.screenshot({ path: 'debug_step1_login_page.png' });

        console.log('Filling credentials...');
        // Try multiple selectors for username
        const userSelectors = ['#username', 'input[name="username"]', 'input[type="email"]'];
        let userSel = null;
        for (const s of userSelectors) {
            if (await page.$(s)) { userSel = s; break; }
        }

        if (!userSel) throw new Error('Username input not found');

        await page.type(userSel, targetUser.email);
        await page.type('#password', targetUser.password);
        await page.screenshot({ path: 'debug_step2_filled.png' });

        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 })
        ]);
        console.log('Login submitted. Current URL:', page.url());
        await page.screenshot({ path: 'debug_step3_after_login.png' });

        // 2. NAVIGATE TO DASHBOARD
        console.log('Going to Dashboard...');
        await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('Dashboard loaded. Current URL:', page.url());
        
        // Wait a bit for dynamic content
        await new Promise(r => setTimeout(r, 5000));
        await page.screenshot({ path: 'debug_step4_dashboard.png' });

        // 3. DUMP HTML & SEARCH
        const html = await page.content();
        fs.writeFileSync('debug_final_html.html', html);

        // Try to find name in typical locations
        const potentialNames = await page.evaluate(() => {
            const results = [];
            // Strategy 1: Common profile classes
            const els = document.querySelectorAll('.user-profile, .profile-name, .username, .user-name, .name');
            els.forEach(el => results.push({ source: 'class', text: el.innerText }));

            // Strategy 2: Text near "Halo"
            const bodyText = document.body.innerText;
            const match = bodyText.match(/(Halo|Selamat Datang|Welcome)[,\s]+([A-Za-z\s]+)/i);
            if (match) results.push({ source: 'regex', text: match[2] });

            return results;
        });

        console.log('Potential Names Found:', potentialNames);

    } catch (e) {
        console.error('ERROR:', e);
        await page.screenshot({ path: 'debug_error.png' });
    } finally {
        await browser.close();
    }
})();
