/**
 * Command: !all
 * Mention all group members (hidetag)
 */
const chalk = require('chalk');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'all',
    description: 'Mention semua anggota grup',

    async execute(sock, msgObj, context) {
        const { sender, isGroup, args } = context;

        if (!isGroup) {
            await sock.sendMessage(sender, { text: getMessage('GROUP_ONLY_COMMAND') }, { quoted: msgObj });
            return;
        }

        const message = args || 'Attention!';

        try {
            const metadata = await sock.groupMetadata(sender);
            const participants = metadata.participants.map(p => p.id);

            await sock.sendMessage(sender, {
                text: message,
                mentions: participants
            });
        } catch (e) {
            console.error(chalk.red("[CMD:ALL] Error hidetag:"), e);
        }
    }
};
