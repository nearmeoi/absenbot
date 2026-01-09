/**
 * Command: !dev
 * Developer/Admin commands (hidden from !help)
 */
const { ADMIN_NUMBERS } = require('../config/constants');
const { addHoliday, removeHoliday, isHoliday, getAllHolidays, addAllowedGroup, removeAllowedGroup, getAllowedGroups } = require('../config/holidays');
const { getMessage } = require('../services/messageService');

module.exports = {
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
            const message = getMessage('dev_chat_id_header') +
                `Chat Type: ${isGroup ? 'Group' : 'Private'}\n` +
                `ID: \`${chatId}\`\n\n` +
                `${isGroup ? getMessage('dev_chat_group_add_hint').replace('{id}', chatId) : ''}`;

            await sock.sendMessage(senderNumber, { text: message });
            return;
        }

        // !dev libur [tanggal]
        if (subCmd === 'libur') {
            const dateStr = params[0] || new Date().toISOString().split('T')[0];
            const added = addHoliday(dateStr);
            const reply = added
                ? getMessage('dev_holiday_added').replace('{date}', dateStr)
                : getMessage('dev_holiday_exists').replace('{date}', dateStr);
            await sock.sendMessage(senderNumber, { text: reply });
            return;
        }

        // !dev hapus-libur [tanggal]
        if (subCmd === 'hapus-libur') {
            const dateStr = params[0] || new Date().toISOString().split('T')[0];
            const removed = removeHoliday(dateStr);
            const reply = removed
                ? getMessage('dev_holiday_removed').replace('{date}', dateStr)
                : getMessage('dev_holiday_not_found').replace('{date}', dateStr);
            await sock.sendMessage(senderNumber, { text: reply });
            return;
        }

        // !dev status
        if (subCmd === 'status') {
            const holidays = getAllHolidays();
            const groups = getAllowedGroups();
            const today = new Date().toISOString().split('T')[0];
            const todayIsHoliday = isHoliday();

            const statusMsg = getMessage('dev_status_header') +
                `Hari ini: ${today}\n` +
                `Status: ${todayIsHoliday ? '🔴 LIBUR' : '🟢 KERJA'}\n\n` +
                `📅 Custom Holidays (${holidays.length}):\n${holidays.length > 0 ? holidays.map(d => `  • ${d}`).join('\n') : '  (kosong)'}\n\n` +
                `👥 Allowed Groups (${groups.length}):\n${groups.length > 0 ? groups.map(g => `  • ${g}`).join('\n') : '  (kosong)'}`;

            await sock.sendMessage(senderNumber, { text: statusMsg });
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
                    ? getMessage('dev_group_added').replace('{id}', groupId)
                    : getMessage('dev_group_exists').replace('{id}', groupId);
                await sock.sendMessage(senderNumber, { text: reply });
            } else if (action === 'remove') {
                const removed = removeAllowedGroup(groupId);
                const reply = removed
                    ? getMessage('dev_group_removed').replace('{id}', groupId)
                    : getMessage('dev_group_not_found').replace('{id}', groupId);
                await sock.sendMessage(senderNumber, { text: reply });
            } else {
                await sock.sendMessage(senderNumber, { text: getMessage('dev_invalid_action') });
            }
            return;
        }

        // Unknown subcommand
        await sock.sendMessage(senderNumber, { text: getMessage('dev_help') });
    }
};
