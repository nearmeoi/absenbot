const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const chalk = require('chalk');
const { getAllUsers, saveUser } = require('../src/services/database');
const { directLogin, createApiClient, loadSession } = require('../src/services/apiService');
const { USERS_FILE } = require('../src/config/constants');

// Constants
const DASHBOARD_URL = 'https://monev.maganghub.kemnaker.go.id/dashboard';

async function syncUserNames() {
    console.log(chalk.blue('Starting User Name Sync...'));
    const users = getAllUsers();
    let updatedCount = 0;

    for (const user of users) {
        console.log(chalk.cyan(`Processing ${user.email}...`));

        let name = '';

        try {
            // 1. Check Session & Re-login if needed
            let session = loadSession(user.email);
            // Force re-login if session is older than 60 mins or doesn't exist
            const isStale = !session || (Date.now() - (session.timestamp || 0) > 60 * 60 * 1000);
            
            if (isStale) {
                console.log(chalk.yellow(`Session stale/missing for ${user.email}, logging in...`));
                const loginRes = await directLogin(user.email, user.password);
                if (!loginRes.success) {
                    console.error(chalk.red(`Login failed for ${user.email}: ${loginRes.pesan}`));
                    // Fallback to email name immediately if login fails
                } else {
                    session = loadSession(user.email);
                }
            }

            if (session) {
                // 2. Fetch Dashboard
                const client = createApiClient(session);
                try {
                    const response = await client.get(DASHBOARD_URL);
                    
                    // 3. Parse Name
                    const $ = cheerio.load(response.data);
                    
                    // Improved Selectors
                    const selectors = [
                        '.user-profile .name', 
                        '.profile-name', 
                        '.dropdown-user .username',
                        '.sidebar-user-details .user-name',
                        'p.name',
                        'h5.name'
                    ];

                    for (const sel of selectors) {
                        const text = $(sel).first().text().trim();
                        if (text) {
                            name = text;
                            break;
                        }
                    }
                    
                    if (!name) {
                         // Look for "Halo, [Name]" pattern in text nodes
                        $('body *').each((i, el) => {
                            if (name) return;
                            const text = $(el).clone().children().remove().end().text().trim();
                            const match = text.match(/Halo,\s+([A-Za-z\s]+)/i) || text.match(/Selamat Datang,\s+([A-Za-z\s]+)/i);
                            if (match && match[1]) {
                                name = match[1].trim();
                            }
                        });
                    }
                } catch (err) {
                    console.error(chalk.red(`Dashboard fetch failed: ${err.message}`));
                }
            }
            
            // 4. Fallback to Email Name if scraping failed OR if scraped name is garbage like "Hadir"
            if (!name || name === 'Hadir') {
                console.log(chalk.yellow(`Using email name as fallback for ${user.email} (Current: ${name})`));
                let displayName = user.email.split('@')[0];
                displayName = displayName.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                name = displayName;
            }

            // 5. Save Name
            if (name) {
                const currentUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
                const userIndex = currentUsers.findIndex(u => u.email === user.email);
                
                if (userIndex !== -1) {
                    currentUsers[userIndex].name = name;
                    fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2));
                    console.log(chalk.green(`✅ Updated ${user.email} -> ${name}`));
                    updatedCount++;
                }
            }

        } catch (e) {
            console.error(chalk.red(`Error processing ${user.email}:`), e.message);
        }
    }

    console.log(chalk.blue(`Sync Complete. Updated ${updatedCount} users.`));
}

syncUserNames();
