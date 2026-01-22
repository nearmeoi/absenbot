const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const puppeteer = require('puppeteer-core');
const { getAllUsers, saveUser } = require('../src/services/database');
const { USERS_FILE, CHROMIUM_PATH, PUPPETEER_ARGS, PUPPETEER_HEADLESS } = require('../src/config/constants');

async function launchBrowser() {
    return await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        executablePath: CHROMIUM_PATH,
        args: PUPPETEER_ARGS
    });
}

async function scrapeNamePuppeteer(user) {
    console.log(chalk.cyan(`[PUPPETEER] Processing ${user.email}...`));
    let browser = null;
    let name = '';

    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // 1. Login Logic (simplified from magang.js)
        await page.goto('https://account.kemnaker.go.id/auth/login', { waitUntil: 'domcontentloaded' });

        // Check for login form (using ID from HTML dump)
        const usernameSelector = '#username';
        const passwordSelector = '#password';
        const submitSelector = 'button[type="submit"]';

        try {
            await page.waitForSelector(usernameSelector, { timeout: 10000 });
            console.log(chalk.yellow(`[PUPPETEER] Login form found, logging in...`));
            
            await page.type(usernameSelector, user.email);
            await page.type(passwordSelector, user.password);
            
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
                page.click(submitSelector)
            ]);
            
            await new Promise(r => setTimeout(r, 2000)); // Wait for redirect
        } catch (e) {
            console.log(chalk.yellow(`[PUPPETEER] Login form not found or already logged in: ${e.message}`));
        }

        // 2. Go to Monev Dashboard
        console.log(chalk.yellow(`[PUPPETEER] Navigating to Dashboard...`));
        try {
            await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            // Wait for SSO Callback to finish
            if (page.url().includes('sso/callback')) {
                console.log(chalk.cyan(`[PUPPETEER] Waiting for SSO Callback redirect...`));
                try {
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
                } catch(e) {
                    console.log(chalk.yellow(`[PUPPETEER] Navigation timeout, checking URL...`));
                }
            }

            // Explicitly wait for common dashboard elements
            // Monev uses Vuetify, so look for v-application or v-main
            try {
                await page.waitForSelector('.v-main, .dashboard, nav', { timeout: 20000 });
            } catch(e) {}

        } catch (e) {
             console.log(chalk.red(`[PUPPETEER] Dashboard nav error: ${e.message}`));
        }

        // 3. Scrape Name
        await new Promise(r => setTimeout(r, 5000)); // Extra wait for rendering

        // Precise Scrape Logic: Find the label "Nama Peserta Magang" and get the next sibling
        name = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('div'));
            const nameLabel = labels.find(el => el.textContent.trim() === 'Nama Peserta Magang');
            if (nameLabel && nameLabel.nextElementSibling) {
                return nameLabel.nextElementSibling.textContent.trim();
            }
            
            // Fallback strategy 2: Look for specific class combination found in debug
            const nameEl = document.querySelector('.text-body-1.font-weight-bold');
            if (nameEl && nameEl.textContent.includes(' ') && !nameEl.textContent.includes('Peserta')) {
                 return nameEl.textContent.trim();
            }

            return '';
        });

        if (name) {
            console.log(chalk.green(`[PUPPETEER] Found accurate name: ${name}`));
        }
        
        // Regex Fallback if everything else fails
        if (!name) {
             name = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                // Look for "Halo, Name" or just Name in typical header position
                const match = bodyText.match(/(Halo|Selamat Datang|Welcome)[,\s]+([A-Za-z\s]+)/i);
                return match ? match[2].trim() : '';
            });
            if (name) console.log(chalk.green(`[PUPPETEER] Found name via Regex: ${name}`));
        }

    } catch (e) {
        console.error(chalk.red(`[PUPPETEER] Error for ${user.email}:`), e.message);
    } finally {
        if (browser) await browser.close();
    }

    return name;
}

async function syncUserNamesPuppeteer() {
    console.log(chalk.blue('Starting PUPPETEER User Name Sync...'));
    const users = getAllUsers();
    let updatedCount = 0;

    // Process sequentially to save resources
    for (const user of users) {
        try {
            // Smart Skip Logic:
            // Calculate what the "fallback" name would be.
            let fallbackName = user.email.split('@')[0];
            fallbackName = fallbackName.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            
            // If current name exists and is DIFFERENT from fallback (and not "Hadir"), assume it's already a real name.
            if (user.name && user.name !== 'Hadir' && user.name !== fallbackName) {
                console.log(chalk.gray(`Skipping ${user.email} (Already has real name: "${user.name}")`));
                continue;
            }

            const realName = await scrapeNamePuppeteer(user);
            
            if (realName) {
                // Read fresh file
                const currentUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
                const userIndex = currentUsers.findIndex(u => u.email === user.email);
                
                if (userIndex !== -1) {
                    currentUsers[userIndex].name = realName;
                    fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2));
                    console.log(chalk.green(`✅ SAVED: ${user.email} -> ${realName}`));
                    updatedCount++;
                }
            } else {
                console.log(chalk.red(`❌ FAILED to find name for ${user.email}`));
            }
        } catch (e) {
            console.error(e);
        }
    }

    console.log(chalk.blue(`Sync Complete. Updated ${updatedCount} users.`));
}

syncUserNamesPuppeteer();
