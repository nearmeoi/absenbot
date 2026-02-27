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

        // Handle name and aliases
        const names = [];
        if (command.name) {
            if (Array.isArray(command.name)) names.push(...command.name);
            else names.push(command.name);
        }
        if (command.aliases && Array.isArray(command.aliases)) {
            names.push(...command.aliases);
        }

        for (const name of names) {
            commands.set(name.toLowerCase(), command);
        }

        // Silent load — only log failures
    } catch (e) {
        console.error(chalk.red(`[COMMANDS] Failed to load ${file}:`), e.message);
    }
}

// One-line summary with unique command names
const uniqueNames = [...new Set([...commands.values()].map(c => (Array.isArray(c.name) ? c.name[0] : c.name)))];
console.log(chalk.cyan(`[COMMANDS] ${commands.size} loaded (${uniqueNames.join(', ')})`));

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

/**
 * Get all command names/aliases
 * @returns {Array} List of all command strings
 */
function getCommandKeys() {
    return Array.from(commands.keys()).sort();
}

module.exports = {
    commands,
    getCommand,
    getAllCommands,
    getCommandKeys
};
