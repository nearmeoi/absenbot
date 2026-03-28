/**
 * Command: !help
 * Shows detailed help information
 */
import { getMessage } from '../services/messageService.js';

export default {
    name: 'help',
    description: 'Tampilkan bantuan detail',

    async execute(sock, msgObj, context) {
        const { sender } = context;
        const helpText = getMessage('!help');
        await sock.sendMessage(sender, { text: helpText }, { quoted: msgObj });
    }
};
