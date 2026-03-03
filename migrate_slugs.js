const { getAllUsers, updateUsers } = require('./src/services/database');
const { slugify } = require('./src/services/apiService');
const chalk = require('chalk');

async function migrate() {
    console.log(chalk.cyan('Starting slug migration...'));
    const allUsers = getAllUsers();
    let count = 0;

    for (const user of allUsers) {
        if (!user.slug) {
            const base = user.name || user.email.split('@')[0];
            user.slug = slugify(base);
            count++;
        }
    }

    if (count > 0) {
        await updateUsers(allUsers);
        console.log(chalk.green(`Successfully added slugs to ${count} users.`));
    } else {
        console.log(chalk.yellow('No users missing slugs.'));
    }
}

migrate().catch(console.error);
