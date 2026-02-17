const { _puppeteerLoginCore } = require('./src/services/magang'); // I need access to internal login or direct puppeteer
const puppeteer = require('puppeteer-core');
const { SESSION_DIR, CHROMIUM_PATH, PUPPETEER_ARGS, PUPPETEER_HEADLESS, USER_AGENT } = require('./src/config/constants');
const apiService = require('./src/services/apiService');
const chalk = require('chalk');
const fs = require('fs');

async function run() {
    const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
    const targetEmail = 'akmaljie12355@gmail.com';
    const user = users.find(u => u.email === targetEmail);

    if (!user) return console.log("User not found");

    console.log(chalk.blue(`🕵️ INSPECTING CALENDAR FOR: ${user.email}`));

    const browser = await puppeteer.launch({
        headless: "new", // Headless but new mode
        executablePath: CHROMIUM_PATH,
        args: [...PUPPETEER_ARGS, '--no-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        
        // 1. Login Logic (simplified for debug)
        console.log("Logging in...");
        await page.goto('https://account.kemnaker.go.id/auth/login', { waitUntil: 'domcontentloaded' });
        
        // Check if already logged in (cookies) - loading session manually
        const session = apiService.loadSession(user.email);
        if (session && session.cookies) {
             const validCookies = session.cookies.map(c => ({ ...c, domain: c.domain || 'monev.maganghub.kemnaker.go.id' }));
             await page.setCookie(...validCookies);
        }

        // Navigate to Dashboard
        console.log("Navigating to Dashboard...");
        await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for calendar
        try {
            await page.waitForSelector('.calendar-table', { timeout: 30000 });
        } catch(e) {
            console.log("Calendar not found, maybe login failed. Trying screenshot.");
            await page.screenshot({ path: 'debug_calendar_fail.png' });
            // Try explicit login if needed (skip for now, assuming session works from previous step)
        }

        // 2. Inspect Cells
        console.log(chalk.yellow("Inspecting Calendar Cells..."));
        
        const cellData = await page.evaluate(() => {
            const cells = Array.from(document.querySelectorAll('.calendar-table tbody td'));
            return cells.map(td => {
                const dayEl = td.querySelector('span');
                const dotEl = td.querySelector('.status-dot');
                
                let bgColor = 'N/A';
                let classes = 'N/A';
                
                if (dotEl) {
                    bgColor = window.getComputedStyle(dotEl).backgroundColor;
                    classes = dotEl.className;
                }

                return {
                    day: dayEl ? dayEl.innerText.trim() : 'EMPTY',
                    hasDot: !!dotEl,
                    bgColor: bgColor,
                    classes: classes
                };
            });
        });

        console.log("---------------------------------------------------");
        console.log("| Day | Dot? | Color (RGBA) | Classes |");
        console.log("---------------------------------------------------");
        
        cellData.forEach(c => {
            if (c.day !== 'EMPTY') {
                console.log(`| ${c.day.padEnd(3)} | ${c.hasDot ? 'YES ' : 'NO  '} | ${c.bgColor.padEnd(20)} | ${c.classes} |`);
            }
        });
        console.log("---------------------------------------------------");

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await browser.close();
    }
}

run();
