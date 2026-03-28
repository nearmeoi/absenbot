/**
 * Command: !dev
 * Developer/Admin commands (hidden from !help)
 */
import { ADMIN_NUMBERS } from '../config/constants.js';
import { addHoliday, removeHoliday, isHoliday, getAllHolidays, addAllowedGroup, removeAllowedGroup, getAllowedGroups } from '../config/holidays.js';
import { getMessage } from '../services/messageService.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

export default {
    name: 'dev',
    description: 'Developer commands',
    hidden: true,

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, textMessage, BOT_PREFIX } = context;

        // Security: Only allow admin numbers
        const senderDigits = senderNumber.split('@')[0];
        if (!ADMIN_NUMBERS.includes(senderDigits)) {
            return; // Silent fail
        }

        const args = textMessage.replace(BOT_PREFIX + 'dev', '').trim();
        const [subCmd, ...params] = args.split(' ');

        // !dev showid
        if (subCmd === 'showid') {
            const chatId = sender;
            const isGroup = sender.endsWith('@g.us');
            const message = getMessage('DEV_CHAT_ID_HEADER') +
                `Chat Type: ${isGroup ? 'Group' : 'Private'}\n` +
                `ID: \`${chatId}\`\n\n` +
                `${isGroup ? getMessage('DEV_CHAT_GROUP_ADD_HINT').replace('{id}', chatId) : ''}`;

            await sock.sendMessage(senderNumber, { text: message });
            return;
        }

        // !dev libur [tanggal]
        if (subCmd === 'libur') {
            const dateStr = params[0] || new Date().toISOString().split('T')[0];
            const added = addHoliday(dateStr);
            const reply = added
                ? getMessage('DEV_HOLIDAY_ADDED').replace('{date}', dateStr)
                : getMessage('DEV_HOLIDAY_EXISTS').replace('{date}', dateStr);
            await sock.sendMessage(senderNumber, { text: reply });
            return;
        }

        // !dev hapus-libur [tanggal]
        if (subCmd === 'hapus-libur') {
            const dateStr = params[0] || new Date().toISOString().split('T')[0];
            const removed = removeHoliday(dateStr);
            const reply = removed
                ? getMessage('DEV_HOLIDAY_REMOVED').replace('{date}', dateStr)
                : getMessage('DEV_HOLIDAY_NOT_FOUND').replace('{date}', dateStr);
            await sock.sendMessage(senderNumber, { text: reply });
            return;
        }

        // !dev status
        if (subCmd === 'status') {
            const holidays = getAllHolidays();
            const groups = getAllowedGroups();
            const today = new Date().toISOString().split('T')[0];
            const todayIsHoliday = isHoliday();
            
            // Memory stats
            const used = process.memoryUsage();
            const memMsg = `💾 Memory: ${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB\n`;

            const statusMsg = getMessage('DEV_STATUS_HEADER') +
                `Hari ini: ${today}\n` +
                `Status: ${todayIsHoliday ? '🔴 LIBUR' : '🟢 KERJA'}\n` +
                memMsg +
                `📅 Custom Holidays (${holidays.length}):\n${holidays.length > 0 ? holidays.map(d => `  • ${d}`).join('\n') : '  (kosong)'}\n\n` +
                `👥 Allowed Groups (${groups.length}):\n${groups.length > 0 ? groups.map(g => `  • ${g}`).join('\n') : '  (kosong)'}`;

            await sock.sendMessage(senderNumber, { text: statusMsg });
            return;
        }

        // !dev update
        if (subCmd === 'update') {
            await sock.sendMessage(senderNumber, { text: '🚀 Memulai update dari GitHub...' });
            exec('git pull && npm install', (err, stdout, stderr) => {
                if (err) {
                    sock.sendMessage(senderNumber, { text: `❌ Update Gagal: ${err.message}` });
                    return;
                }
                sock.sendMessage(senderNumber, { text: `✅ Update Selesai. Merestart bot...\n\nLog:\n${stdout.substring(0, 500)}` }).then(() => {
                    process.exit(0); // PM2 will restart
                });
            });
            return;
        }

        // !dev clean
        if (subCmd === 'clean') {
            const { AUTH_STATE_DIR } = await import('../config/constants.js');
            const files = fs.readdirSync(AUTH_STATE_DIR);
            let count = 0;
            for (const file of files) {
                if (file !== 'creds.json') {
                    fs.unlinkSync(path.join(AUTH_STATE_DIR, file));
                    count++;
                }
            }
            await sock.sendMessage(senderNumber, { text: `🧹 Berhasil membersihkan ${count} file junk di SesiWA.` });
            return;
        }

        // !dev grup add/remove [id]
        if (subCmd === 'grup') {
            const action = params[0];
            const groupId = params[1];

            if (!action || !groupId) {
                await sock.sendMessage(senderNumber, { text: `⚠️ Format: !dev grup [add/remove] [groupId]` });
                return;
            }

            if (action === 'add') {
                const added = addAllowedGroup(groupId);
                const reply = added
                    ? getMessage('DEV_GROUP_ADDED').replace('{id}', groupId)
                    : getMessage('DEV_GROUP_EXISTS').replace('{id}', groupId);
                await sock.sendMessage(senderNumber, { text: reply });
            } else if (action === 'remove') {
                const removed = removeAllowedGroup(groupId);
                const reply = removed
                    ? getMessage('DEV_GROUP_REMOVED').replace('{id}', groupId)
                    : getMessage('DEV_GROUP_NOT_FOUND').replace('{id}', groupId);
                await sock.sendMessage(senderNumber, { text: reply });
            } else {
                await sock.sendMessage(senderNumber, { text: getMessage('DEV_INVALID_ACTION') });
            }
            return;
        }

        // Unknown subcommand
        await sock.sendMessage(senderNumber, { text: getMessage('DEV_HELP') });
    }
};
