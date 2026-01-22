const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { USERS_FILE } = require('../src/config/constants');

// Helper to Title Case a string
function toTitleCase(str) {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => {
        // Handle acronyms or specific cases if needed, but general Title Case:
        // First letter upper, rest lower.
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

// Custom fixer for specific edge cases (like titles)
function fixName(name) {
    let fixed = toTitleCase(name);
    
    // Fix specific patterns if needed
    // e.g., "A. naksya" -> "A. Naksya" (Regex \w matches A, but splitting by space covers it)
    
    // Fix dots without spaces if any, e.g., "Faizal.ms" -> "Faizal.Ms"
    fixed = fixed.replace(/\.([a-z])/g, (match, p1) => `.${p1.toUpperCase()}`);

    return fixed;
}

function tidyNames() {
    console.log(chalk.blue('Tidying User Names...'));
    
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        let updatedCount = 0;

        users.forEach(user => {
            if (user.name) {
                const oldName = user.name;
                const newName = fixName(oldName);
                
                if (oldName !== newName) {
                    user.name = newName;
                    console.log(chalk.green(`✨ Fixed: "${oldName}" -> "${newName}"`));
                    updatedCount++;
                }
            }
        });

        if (updatedCount > 0) {
            fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
            console.log(chalk.blue(`Done! Updated ${updatedCount} names.`));
        } else {
            console.log(chalk.yellow('All names are already tidy.'));
        }

    } catch (e) {
        console.error(chalk.red('Error tidying names:'), e.message);
    }
}

tidyNames();
