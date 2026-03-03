/**
 * Utility for sending messages (Simplified to use Smart sendMessage Override)
 * Supports All Platforms (Android, iOS, PC)
 */

const chalk = require('chalk');

/**
 * Sends a message with interactive buttons
 * @param {Object} sock - Baileys socket
 * @param {String} jid - Recipient JID
 * @param {Object} content - Message content
 * @param {Object} options - Message options (quoted, etc.)
 */
async function sendInteractiveMessage(sock, jid, content, options = {}) {
    const { 
        title, 
        body, 
        footer, 
        buttons = [], 
        image, 
        video 
    } = content;

    // Construct message object using the new smart structure
    const messageContent = {
        text: body,
        footer: footer,
        interactiveButtons: buttons
    };

    // Add media if present
    if (image) {
        // Ensure image is in a format Baileys expects (object with url or Buffer)
        messageContent.image = (typeof image === 'string') ? { url: image } : image;
        messageContent.caption = body;
        delete messageContent.text;
    } else if (video) {
        // Ensure video is in a format Baileys expects (object with url or Buffer)
        messageContent.video = (typeof video === 'string') ? { url: video } : video;
        messageContent.caption = body;
        delete messageContent.text;
    }

    // This will now trigger the smart override in app.js
    const message = await sock.sendMessage(jid, messageContent, { 
        quoted: options.quoted,
        mentions: options.mentions || []
    });

    // Logging
    const cleanJid = jid.split('@')[0];
    console.log(
        chalk.blue.bold("BOT"),
        chalk.gray("->"),
        chalk.cyan(cleanJid),
        chalk.gray(":"),
        chalk.white(`[Smart-Buttons]\n${body.substring(0, 50)}...`)
    );

    return message;
}

module.exports = {
    sendInteractiveMessage
};
