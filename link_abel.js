const { getAllUsers, updateUsers } = require('./src/services/database');
const chalk = require('chalk');

async function linkUser() {
    const email = 'abelianiadil4@gmail.com';
    const newId = '185869776478348@s.whatsapp.net';
    
    console.log(chalk.cyan(`Linking ${newId} to ${email}...`));
    
    const allUsers = getAllUsers();
    const userIndex = allUsers.findIndex(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    
    if (userIndex === -1) {
        console.error(chalk.red(`User with email ${email} not found!`));
        return;
    }
    
    const user = allUsers[userIndex];
    if (!user.identifiers) user.identifiers = [user.phone];
    
    if (!user.identifiers.includes(newId)) {
        user.identifiers.push(newId);
        await updateUsers(allUsers);
        console.log(chalk.green(`Successfully linked ${newId} to ${user.name || email}`));
    } else {
        console.log(chalk.yellow(`ID ${newId} was already linked to this user.`));
    }
}

linkUser().catch(console.error);
