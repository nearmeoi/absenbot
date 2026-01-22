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

        // --- NEW LOGIC: Support Reply/Quoted Message ---
        const quotedMsg = msgObj.message.extendedTextMessage?.contextInfo?.quotedMessage;
        let broadcastText = args;

        if (quotedMsg) {
            // Extract text from quoted message (supports conversation, extendedText, or image caption)
            broadcastText = quotedMsg.conversation || 
                            quotedMsg.extendedTextMessage?.text || 
                            quotedMsg.imageMessage?.caption || 
                            args; // Fallback to args if quoted msg has no text
        }

        if (!broadcastText) {
            await sock.sendMessage(sender, { text: getMessage('admin_hidetag_format') }, { quoted: msgObj });
            return;
        }

        try {
            const groupMetadata = await sock.groupMetadata(msgObj.key.remoteJid);
            const participants = groupMetadata.participants.map(p => p.id);

            await sock.sendMessage(msgObj.key.remoteJid, { 
                text: broadcastText, 
                mentions: participants 
            });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(sender, { text: 'Gagal melakukan tag all.' }, { quoted: msgObj });
        }
    }
};
