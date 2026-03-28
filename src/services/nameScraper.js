import chalk from 'chalk';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { USERS_FILE, CHROMIUM_PATH, PUPPETEER_ARGS, PUPPETEER_HEADLESS } from '../config/constants.js';

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

        await page.goto('https://account.kemnaker.go.id/auth/login', { waitUntil: 'domcontentloaded' });

        const usernameSelector = '#username';
        const passwordSelector = '#password';
        const submitSelector = 'button[type="submit"]';

        try {
            await page.waitForSelector(usernameSelector, { timeout: 10000 });
            
            await page.type(usernameSelector, user.email);
            await page.type(passwordSelector, user.password);
            
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
                page.click(submitSelector)
            ]);
            
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.log(chalk.yellow(`[PUPPETEER] Login form not found or already logged in: ${e.message}`));
        }

        console.log(chalk.yellow(`[PUPPETEER] Navigating to Dashboard...`));
        try {
            await page.goto('https://monev.maganghub.kemnaker.go.id/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            if (page.url().includes('sso/callback')) {
                try {
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
                } catch(e) {}
            }

            try {
                await page.waitForSelector('.v-main, .dashboard, nav', { timeout: 20000 });
            } catch(e) {}

        } catch (e) {
             console.log(chalk.red(`[PUPPETEER] Dashboard nav error: ${e.message}`));
        }

        await new Promise(r => setTimeout(r, 5000));

        name = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('div'));
            const nameLabel = labels.find(el => el.textContent.trim() === 'Nama Peserta Magang');
            if (nameLabel && nameLabel.nextElementSibling) {
                return nameLabel.nextElementSibling.textContent.trim();
            }
            
            const nameEl = document.querySelector('.text-body-1.font-weight-bold');
            if (nameEl && nameEl.textContent.includes(' ') && !nameEl.textContent.includes('Peserta')) {
                 return nameEl.textContent.trim();
            }

            return '';
        });

        if (!name) {
             name = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                const match = bodyText.match(/(Halo|Selamat Datang|Welcome)[,\s]+([A-Za-z\s]+)/i);
                return match ? match[2].trim() : '';
            });
        }

        if (name) {
            name = name.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            console.log(chalk.green(`[PUPPETEER] Found name: ${name}`));
        }

    } catch (e) {
        console.error(chalk.red(`[PUPPETEER] Error for ${user.email}:`), e.message);
    } finally {
        if (browser) await browser.close();
    }

    return name;
}

async function scrapeAndSaveUser(user) {
    const realName = await scrapeNamePuppeteer(user);
    if (realName) {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const index = users.findIndex(u => u.email === user.email);
        
        if (index !== -1) {
            users[index].name = realName;
            
            let slug = realName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            let counter = 1;
            let finalSlug = slug;
            while (users.some(u => u.slug === finalSlug && u.email !== user.email)) {
                finalSlug = `${slug}-${counter++}`;
            }
            users[index].slug = finalSlug;

            fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
            console.log(chalk.green(`[PUPPETEER] Updated user ${user.email} with name "${realName}" and slug "${finalSlug}"`));
            return true;
        }
    }
    return false;
}

export { scrapeNamePuppeteer, scrapeAndSaveUser };