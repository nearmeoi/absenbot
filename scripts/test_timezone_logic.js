const { loadGroupSettings } = require('../src/services/groupSettings');
const chalk = require('chalk');

// Mock cron and other dependencies if needed, or just test the logic
function testTimezoneLogic() {
    console.log(chalk.cyan('--- Testing Timezone Scheduler Logic ---'));

    const standardTimezones = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
    const settings = {
        'group1': { name: 'Jakarta Group', timezone: 'Asia/Jakarta', schedulerEnabled: true },
        'group2': { name: 'Makassar Group', timezone: 'Asia/Makassar', schedulerEnabled: true },
        'group3': { name: 'Jayapura Group', timezone: 'Asia/Jayapura', schedulerEnabled: true },
        'group4': { name: 'Default Group', schedulerEnabled: true } // No timezone
    };

    console.log('Mock Settings:', JSON.stringify(settings, null, 2));

    const customTimezones = Object.values(settings)
        .map(s => s.timezone)
        .filter(tz => tz && !standardTimezones.includes(tz));

    const timezones = [...new Set([...standardTimezones, ...customTimezones])];

    console.log('Timezones to register:', timezones);

    timezones.forEach(tz => {
        console.log(chalk.yellow(`\nInitializing crons for: ${tz}`));

        // Filter groups for this timezone
        const enabledGroups = Object.entries(settings).filter(([_, c]) => {
            const groupTz = c.timezone || 'Asia/Makassar';
            return c.schedulerEnabled && groupTz === tz;
        });

        console.log(`Groups in ${tz}:`, enabledGroups.map(([id, c]) => c.name || id));
    });

    console.log(chalk.green('\n--- Logic Verification Complete ---'));
}

testTimezoneLogic();
