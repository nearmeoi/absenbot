/**
 * Command: !menu / !hai
 * Shows the main menu with bot information
 */
const fs = require('fs');
const path = require('path');
const { getMessage } = require('../services/messageService');

const COVER_IMAGE = path.join(__dirname, '../../public/img/cover.png');

module.exports = {
    name: ['menu', 'hai'],
    description: 'Tampilkan menu utama',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber } = context;
        const info = getMessage('!menu', senderNumber);

        try {
            if (fs.existsSync(COVER_IMAGE)) {
                await sock.sendMessage(sender, { image: { url: COVER_IMAGE }, caption: info }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
            }
        } catch (menuError) {
            console.error('[CMD:MENU] Error sending menu with image:', menuError.message);
            try {
                await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
            } catch (textError) {
                console.error('[CMD:MENU] Error sending menu text:', textError.message);
            }
        }
    }
};
