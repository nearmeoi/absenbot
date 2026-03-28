import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SESSION_DIR = path.join(__dirname, '../../SesiWA');
const BACKUP_DIR = path.join(__dirname, '../../data/backups');
const SESSION_FILE = path.join(SESSION_DIR, 'creds.json');
const BACKUP_FILE = path.join(BACKUP_DIR, 'session_backup.json');

/**
 * Backup the main session file (creds.json)
 */
const backupSession = () => {
    try {
        if (!fs.existsSync(SESSION_FILE)) return;
        
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
        
        fs.copyFileSync(SESSION_FILE, BACKUP_FILE);
        console.log(chalk.green('[BACKUP] Session creds.json backed up successfully.'));
    } catch (e) {
        console.error(chalk.red('[BACKUP] Failed to backup session:'), e.message);
    }
};

/**
 * Restore session from backup if the main one is missing
 */
const restoreSession = () => {
    try {
        if (fs.existsSync(SESSION_FILE)) return false; // Already exists
        
        if (fs.existsSync(BACKUP_FILE)) {
            if (!fs.existsSync(SESSION_DIR)) {
                fs.mkdirSync(SESSION_DIR, { recursive: true });
            }
            fs.copyFileSync(BACKUP_FILE, SESSION_FILE);
            console.log(chalk.bgGreen.black(' [RESTORE] Main session missing! Restored from backup. '));
            return true;
        }
    } catch (e) {
        console.error(chalk.red('[RESTORE] Failed to restore session:'), e.message);
    }
    return false;
};

export { backupSession, restoreSession };
