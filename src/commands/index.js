/**
 * Command Loader Index
 * Auto-loads all command files and exports them as a map
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const commands = new Map();

// Load all .js files in this directory (except index.js)
const commandFiles = fs.readdirSync(__dirname).filter(file =>
    file.endsWith('.js') && file !== 'index.js'
);

for (const file of commandFiles) {
    try {
        const command = require(path.join(__dirname, file));

        // Handle array of names (aliases)
        const names = Array.isArray(command.name) ? command.name : [command.name];

        for (const name of names) {
            commands.set(name, command);
        }

        console.log(chalk.green(`[COMMANDS] Loaded: ${names.join(', ')}`));
    } catch (e) {
        console.error(chalk.red(`[COMMANDS] Failed to load ${file}:`), e.message);
    }
}

console.log(chalk.cyan(`[COMMANDS] Total commands loaded: ${commands.size}`));

/**
 * Get command by name
 * @param {string} name - Command name without prefix
 * @returns {Object|null} Command object or null
 */
function getCommand(name) {
    return commands.get(name.toLowerCase()) || null;
}

/**
 * Get all registered commands
 * @returns {Map} Map of all commands
 */
function getAllCommands() {
    return commands;
}

module.exports = {
    commands,
    getCommand,
    getAllCommands
};
