/**
 * Command: !setgroup
 * Set active group for automated reminders
 */
import fs from 'fs';
import { GROUP_ID_FILE } from '../config/constants.js';
import { getMessage } from '../services/messageService.js';

export default {
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
        const { saveGroup } = await import('../services/groupSettings.js');
        saveGroup(groupId, groupName);

        await sock.sendMessage(sender, { text: getMessage('group_set_success') }, { quoted: msgObj });
    }
};
