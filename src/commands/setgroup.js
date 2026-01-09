/**
 * Command: !setgroup
 * Set active group for automated reminders
 */
const fs = require('fs');
const { GROUP_ID_FILE } = require('../config/constants');
const { getMessage } = require('../services/messageService');

module.exports = {
    name: 'setgroup',
    description: 'Set grup untuk pengingat otomatis',

    async execute(sock, msgObj, context) {
        const { sender, isGroup } = context;

        if (!isGroup) {
            await sock.sendMessage(sender, { text: getMessage('setgroup_not_group') }, { quoted: msgObj });
            return;
        }

        fs.writeFileSync(GROUP_ID_FILE, sender);
        await sock.sendMessage(sender, { text: getMessage('setgroup_success') }, { quoted: msgObj });
    }
};
