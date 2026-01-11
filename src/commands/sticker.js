const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { CHROMIUM_PATH, PUPPETEER_ARGS } = require('../config/constants');

/**
 * Render text to transparent PNG using Puppeteer (Chrome)
 * This is the ONLY way to get perfect iOS Emojis on old Linux
 */
async function renderTextToImage(text) {
    const browser = await puppeteer.launch({
        executablePath: CHROMIUM_PATH,
        args: [...PUPPETEER_ARGS, '--no-sandbox'],
        headless: true
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 512, height: 200, deviceScaleFactor: 1 });
        
        // Regex to separate emojis from text
        const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
        
        // Wrap ONLY non-emoji text in a span with outline
        const processedText = text.split(emojiRegex).map(part => {
            if (!part) return '';
            if (part.match(emojiRegex)) return part; // Keep emoji plain
            return `<span class="outline">${part}</span>`; // Add outline to text
        }).join('');

        const html = `
        <html>
        <head>
            <style>
                @font-face {
                    font-family: 'Apple Color Emoji';
                    src: local('Apple Color Emoji');
                }
                body {
                    margin: 0;
                    padding: 0;
                    background: transparent;
                    display: flex;
                    justify-content: center;
                    align-items: flex-end;
                    height: 100vh;
                    overflow: hidden;
                }
                .text {
                    font-family: "Apple Color Emoji", sans-serif !important;
                    font-size: 60px;
                    font-weight: bold;
                    color: white;
                    text-align: center;
                    padding-bottom: 20px;
                    -webkit-font-smoothing: antialiased;
                }
                .outline {
                    /* Inherit font but keep outline for text */
                    text-shadow: 
                        -1.5px -1.5px 0 #000,  
                         1.5px -1.5px 0 #000,
                        -1.5px  1.5px 0 #000,  
                         1.5px  1.5px 0 #000;
                }
            </style>
        </head>
        <body>
            <div class="text">${processedText}</div>
        </body>
        </html>
        `;

        await page.setContent(html);
        const element = await page.$('.text');
        const buffer = await element.screenshot({ omitBackground: true });
        return buffer;
    } finally {
        await browser.close();
    }
}

const { reportError } = require('../services/errorReporter');

module.exports = {
    name: ['s', 'sticker', 'stiker'],
    description: 'Ubah gambar ke sticker dengan iOS Emoji (Ultra HD)',
    async execute(sock, msg, context) {
        const { sender } = context;

        try {
            // 1. Identify Media
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const targetMsg = quotedMsg ? quotedMsg : msg.message;
            
            const isViewOnce = targetMsg.viewOnceMessageV2 || targetMsg.viewOnceMessage;
            const mediaMsg = isViewOnce ? (isViewOnce.message.imageMessage || isViewOnce.message.videoMessage) : (targetMsg.imageMessage || targetMsg.videoMessage || targetMsg.stickerMessage);

            if (!mediaMsg) {
                return await sock.sendMessage(sender, { text: '⚠️ Kirim gambar dengan caption *!s* atau reply gambar.' }, { quoted: msg });
            }

            // 2. Download Media
            const msgToDownload = quotedMsg ? {
                key: { ...msg.key, id: msg.message.extendedTextMessage.contextInfo.stanzaId },
                message: quotedMsg
            } : msg;
            if (isViewOnce) msgToDownload.message = isViewOnce.message; 

            const buffer = await downloadMediaMessage(msgToDownload, 'buffer', {}, { logger: console });
            if (!buffer) throw new Error('Gagal mengunduh media.');

            const text = context.args.trim();
            let finalBuffer;

            // 3. Image Processing with Sharp
            if (text) {
                // Render perfect iOS text overlay
                const textOverlay = await renderTextToImage(text);

                finalBuffer = await sharp(buffer, { animated: true })
                    .resize(512, 512, {
                        fit: 'cover',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .composite([
                        {
                            input: textOverlay,
                            gravity: 'south',
                            blend: 'over'
                        }
                    ])
                    .webp({ effort: 6 })
                    .toBuffer();
            } else {
                finalBuffer = await sharp(buffer, { animated: true })
                    .resize(512, 512, {
                        fit: 'cover',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .webp({ effort: 6 })
                    .toBuffer();
            }

            // 4. Create and Send Sticker
            const sticker = new Sticker(finalBuffer, {
                pack: 'Created by',
                author: '@Neardev',
                type: StickerTypes.FULL,
                categories: ['🤖'],
                id: 'monev-bot',
                quality: 60
            });

            await sock.sendMessage(sender, await sticker.toMessage(), { quoted: msg });

                } catch (error) {
                    console.error('[STICKER] Error:', error);
                    reportError(error, 'stickerCommand', { sender: sender, args: context.args });
                    await sock.sendMessage(sender, { 
                        text: `❌ *Gagal membuat sticker*\n\n*Error:* ${error.message.substring(0, 100)}` 
                    }, { quoted: msg });
                }    }
};