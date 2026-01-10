/**
 * Command: !help
 * Shows detailed help information
 */
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'help',
    description: 'Tampilkan bantuan detail',

    async execute(sock, msgObj, context) {
        const { sender } = context;
        const helpText = getMessage('GENERAL_HELP');
        await sock.sendMessage(sender, { text: helpText }, { quoted: msgObj });
    }
};
