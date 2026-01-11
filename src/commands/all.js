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
            await sock.sendMessage(sender, { text: getMessage('group_only_command') }, { quoted: msgObj });
            return;
        }

        // Check if admin (optional, maybe allow everyone for now or strict check)
        // ...

        if (!args) {
            await sock.sendMessage(sender, { text: getMessage('admin_hidetag_format') }, { quoted: msgObj });
            return;
        }

        try {
            const groupMetadata = await sock.groupMetadata(msgObj.key.remoteJid);
            const participants = groupMetadata.participants.map(p => p.id);

            await sock.sendMessage(msgObj.key.remoteJid, { 
                text: args, 
                mentions: participants 
            });
            
            // await sock.sendMessage(sender, { text: getMessage('admin_hidetag_done') }, { quoted: msgObj });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(sender, { text: 'Gagal melakukan tag all.' }, { quoted: msgObj });
        }
    }
};
