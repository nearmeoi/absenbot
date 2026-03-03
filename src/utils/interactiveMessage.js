/**
 * Utility for sending interactive messages (buttons, lists, etc.)
 * Compatible with newer versions of Baileys/WhatsApp
 */

const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

/**
 * Sends an interactive message with buttons
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

    // Prepare header
    let header = {};
    if (image) {
        header = {
            title: title || "",
            hasMediaAttachment: true,
            imageMessage: image
        };
    } else if (video) {
        header = {
            title: title || "",
            hasMediaAttachment: true,
            videoMessage: video
        };
    } else {
        header = {
            title: title || "",
            hasMediaAttachment: false
        };
    }

    const buttonsMessage = {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.fromObject({
                        text: body
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.fromObject({
                        text: footer || ""
                    }),
                    header: proto.Message.InteractiveMessage.Header.fromObject(header),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                        buttons: buttons.map(btn => ({
                            name: btn.name,
                            buttonParamsJson: btn.params || JSON.stringify({})
                        }))
                    }),
                    contextInfo: options.quoted ? {
                        stakingRollback: options.quoted,
                        quotedMessage: options.quoted.message,
                        participant: options.quoted.key.participant || options.quoted.key.remoteJid,
                        stanzaId: options.quoted.key.id,
                        remoteJid: options.quoted.key.remoteJid
                    } : {}
                })
            }
        }
    };

    const message = generateWAMessageFromContent(jid, buttonsMessage, {
        quoted: options.quoted,
        userJid: sock.user.id
    });

    await sock.relayMessage(jid, message.message, {
        messageId: message.key.id
    });

    // Logging outgoing interactive message
    const cleanJid = jid.split('@')[0];
    console.log(
        require('chalk').blue.bold("BOT"),
        require('chalk').gray("->"),
        require('chalk').cyan(cleanJid),
        require('chalk').gray(":"),
        require('chalk').white(`[Interactive] ${body.substring(0, 50)}${body.length > 50 ? '...' : ''}`)
    );

    return message;
}

module.exports = {
    sendInteractiveMessage
};
