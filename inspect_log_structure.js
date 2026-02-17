const apiService = require('./src/services/apiService');
const chalk = require('chalk');

async function run() {
    const email = 'amrinarosyadah2704@gmail.com';
    console.log(chalk.blue(`Probing Dashboard APIs for ${email}...`));
    
    const session = apiService.loadSession(email);
    if (!session) return;

    const client = apiService.createApiClient(session);
    
    const endpoints = [
        'https://monev.maganghub.kemnaker.go.id/api/dashboard',
        'https://monev.maganghub.kemnaker.go.id/api/participant/dashboard',
        'https://monev.maganghub.kemnaker.go.id/api/v1/dashboard',
        'https://monev.maganghub.kemnaker.go.id/api/participants/me/dashboard',
        'https://monev-api.maganghub.kemnaker.go.id/api/v1/participants/dashboard' // External API directly? usually blocked by CORS or need diff token
    ];

    for (const url of endpoints) {
        try {
            console.log(`Probing ${url}...`);
            const response = await client.get(url, { validateStatus: null });
            console.log(`Status: ${response.status}`);
            if (response.status === 200) {
                console.log(chalk.green("✅ FOUND!"));
                console.log(JSON.stringify(response.data).substring(0, 500));
                return; // Stop if found
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
    
    console.log(chalk.red("❌ No endpoint matched."));
}

run();