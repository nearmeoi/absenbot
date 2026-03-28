/**
 * Command Loader Index
 * Auto-loads all command files and exports them as a map
 */
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commands = new Map();

/**
 * Async command loader — must be called before using getCommand etc.
 */
async function initCommands() {
    const commandFiles = fs.readdirSync(__dirname).filter(file =>
        file.endsWith('.js') && file !== 'index.js'
    );

    for (const file of commandFiles) {
        try {
            const filePath = path.resolve(__dirname, file);
            const mod = await import(filePath);
            const command = mod.default || mod;

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
}

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

export { commands, getCommand, getAllCommands, getCommandKeys, initCommands };
