/**
 * Sync Users Phone - Auto-link WhatsApp numbers from Kemnaker Profile
 * Runs through all users in users.json and fetches their registered phone number
 */
const { getAllUsers, updateUsers } = require('./src/services/database');
const { getUserProfile } = require('./src/services/magang');
const apiService = require('./src/services/apiService');
const chalk = require('chalk');

async function syncAll() {
    console.log(chalk.cyan('🚀 Starting User Phone Sync from Kemnaker...'));
    const allUsers = getAllUsers(); // Load fresh copy
    const limit = 3;
    const usersToProcess = allUsers.slice(0, limit);
    let updatedCount = 0;

    for (let i = 0; i < usersToProcess.length; i++) {
        const user = usersToProcess[i];
        if (!user.email || !user.password) continue;

        console.log(chalk.yellow(`\n[SYNC] Processing: ${user.email}...`));
        
        try {
            // 1. Get Profile
            let profile = await getUserProfile(user.email);
            
            // 2. If session invalid, try direct login once
            if (!profile.success && profile.needsLogin) {
                console.log(chalk.gray(`[SYNC] Session expired for ${user.email}, logging in via Direct API...`));
                const loginRes = await apiService.directLogin(user.email, user.password);
                if (loginRes.success) {
                    profile = await getUserProfile(user.email);
                }
            }

            if (profile.success && profile.data) {
                // Debug response structure
                // console.log(JSON.stringify(profile.data, null, 2));

                const profileData = Array.isArray(profile.data) ? profile.data[0] : (profile.data.data ? profile.data.data[0] : profile.data);
                
                if (!profileData) {
                    console.log(chalk.red(`[SYNC] ⚠️ Empty profile data for ${user.email}`));
                    console.log(chalk.gray(`Full response: ${JSON.stringify(profile)}`));
                    continue;
                }

                const kemnakerPhone = profileData.telepon || profileData.phone;
                console.log(chalk.gray(`[SYNC] Kemnaker Phone found: ${kemnakerPhone}`));
                
                if (kemnakerPhone) {
                    // Normalize to WhatsApp format
                    let digits = kemnakerPhone.replace(/\D/g, '');
                    if (digits.startsWith('0')) digits = '62' + digits.substring(1);
                    if (!digits.startsWith('62')) digits = '62' + digits;
                    
                    const waJid = digits + '@s.whatsapp.net';
                    
                    // Initialize identifiers if missing
                    if (!user.identifiers) user.identifiers = [];
                    
                    // Add current known IDs to identifiers
                    if (user.phone && !user.identifiers.includes(user.phone)) user.identifiers.push(user.phone);
                    if (user.lid && !user.identifiers.includes(user.lid)) user.identifiers.push(user.lid);

                    // Add new WA JID if not exists
                    if (!user.identifiers.includes(waJid)) {
                        user.identifiers.push(waJid);
                        
                        // Update primary phone if it's currently an LID
                        if (!user.phone || user.phone.includes('@lid')) {
                            user.phone = waJid;
                        }
                        
                        user.name = profileData.nama || user.name;
                        updatedCount++;
                        console.log(chalk.green(`[SYNC] ✅ Linked ${waJid} to ${user.email} (${user.name})`));
                    } else {
                        console.log(chalk.blue(`[SYNC] ℹ️ Phone ${waJid} already linked for ${user.email}`));
                    }
                } else {
                    console.log(chalk.red(`[SYNC] ⚠️ No phone number found in Kemnaker profile for ${user.email}`));
                }
            } else {
                console.log(chalk.red(`[SYNC] ❌ Failed to fetch profile for ${user.email}: ${profile.pesan}`));
            }
        } catch (e) {
            console.error(chalk.red(`[SYNC] 💥 Error processing ${user.email}:`), e.message);
        }
        
        await new Promise(r => setTimeout(r, 1000));
    }

    // Save all changes at once
    if (updatedCount > 0) {
        await updateUsers(allUsers);
        console.log(chalk.green(`\n💾 Saved changes for ${updatedCount} users to users.json`));
    }

    console.log(chalk.cyan(`\n✨ Sync Finished! Updated total: ${updatedCount} users.`));
    process.exit(0);
}

syncAll();
