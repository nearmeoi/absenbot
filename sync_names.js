const { getAllUsers, updateUsers } = require('./src/services/database');
const { getUserProfile, directLogin } = require('./src/services/apiService');
const chalk = require('chalk');

async function syncAllNames() {
    console.log(chalk.cyan('🚀 Starting DEBUG Name & Slug Sync...'));
    const allUsers = getAllUsers();
    let updatedCount = 0;

    function slugify(text) {
        if (!text) return '';
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    for (const user of allUsers) {
        if (user.email !== 'akmaljie12355@gmail.com') continue; // DEBUG ONLY YOUR ACCOUNT
        
        console.log(chalk.yellow(`Checking: ${user.email}...`));
        try {
            // Force re-login to be 100% sure
            await directLogin(user.email, user.password);
            const profileRes = await getUserProfile(user.email);
            
            console.log(`[DEBUG] Profile API Response for ${user.email}:`, JSON.stringify(profileRes.data, null, 2));

            if (profileRes.success && profileRes.data) {
                // It might be an array or object
                const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data;
                
                // Let's check for ANY name-like field: 'nama', 'name', 'full_name', etc.
                const nameCandidate = profile.nama || profile.name || profile.full_name || profile.participant_name;
                
                if (nameCandidate) {
                    const newName = nameCandidate;
                    const newSlug = slugify(newName);
                    user.name = newName;
                    user.slug = newSlug;
                    updatedCount++;
                    console.log(chalk.green(`   ✅ Found & Updated: ${newName} (${newSlug})`));
                } else {
                    console.log(chalk.red(`   ❌ No name field found in response data.`));
                }
            }
        } catch (e) { console.log(chalk.red(`   ❌ Error: ${e.message}`)); }
    }

    if (updatedCount > 0) {
        await updateUsers(allUsers);
        console.log(chalk.green(`\n✨ Sync Complete!`));
    }
}
syncAllNames().catch(err => console.error(err));
