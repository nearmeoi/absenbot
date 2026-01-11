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
        const { sender, isGroup, args } = context;

        if (!isGroup) {
            await sock.sendMessage(sender, { text: getMessage('group_only_command') }, { quoted: msgObj });
            return;
        }

        const groupId = msgObj.key.remoteJid;
        const groupName = args || 'Group Absensi'; // Optional custom name

        // Save group ID to file
        const { saveGroup } = require('../services/groupSettings');
        saveGroup(groupId, groupName);

        await sock.sendMessage(sender, { text: getMessage('group_set_success') }, { quoted: msgObj });
    }
};
