const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const puppeteer = require('puppeteer-core');
const { CHROMIUM_PATH, PUPPETEER_ARGS } = require('../config/constants');

/**
 * Render text to transparent PNG using Puppeteer (Chrome)
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
        
        const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
        
        const processedText = text.split(emojiRegex).map(part => {
            if (!part) return '';
            if (part.match(emojiRegex)) return `<span class="emoji">${part}</span>`;
            return `<span class="outline">${part}</span>`;
        }).join('');

        const html = `
        <html>
        <head>
            <style>
                @font-face {
                    font-family: 'Apple Color Emoji';
                    src: url('file:///home/ubuntu/.local/share/fonts/AppleColorEmoji.ttf');
                }
                body {
                    margin: 0; padding: 0; background: transparent;
                    display: flex; justify-content: center; align-items: flex-end;
                    height: 100vh; overflow: hidden;
                }
                .text {
                    font-size: 60px; font-weight: bold; color: white;
                    text-align: center; padding-bottom: 20px;
                    -webkit-font-smoothing: antialiased; line-height: 1.2;
                }
                .emoji { font-family: 'Apple Color Emoji'; }
                .outline {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    text-shadow: -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000;
                }
            </style>
        </head>
        <body><div class="text">${processedText}</div></body>
        </html>`;

        await page.setContent(html);
        const element = await page.$('.text');
        return await element.screenshot({ omitBackground: true });
    } finally {
        await browser.close();
    }
}

/**
 * Convert MP4 video buffer to animated WebP using FFmpeg with optional text overlay
 */
async function videoToWebp(inputBuffer, textOverlayBuffer = null) {
    const tmpDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const id = Date.now();
    const inputPath = path.join(tmpDir, `input_${id}.mp4`);
    const textPath = path.join(tmpDir, `text_${id}.png`);
    const outputPath = path.join(tmpDir, `output_${id}.webp`);

    try {
        fs.writeFileSync(inputPath, inputBuffer);
        
        let filter = `fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0`;
        let inputFiles = `-i "${inputPath}"`;

        if (textOverlayBuffer) {
            fs.writeFileSync(textPath, textOverlayBuffer);
            inputFiles += ` -i "${textPath}"`;
            filter += ` [vid]; [vid][1:v] overlay=(main_w-overlay_w)/2:main_h-overlay_h-20`;
        }

        // Convert to 512x512 animated webp, max 5 seconds, 15 fps
        await execAsync(`ffmpeg ${inputFiles} -t 5 -vf "${filter}" -loop 0 -vcodec libwebp -lossless 0 -compression_level 4 -q:v 50 "${outputPath}"`);
        
        const outputBuffer = fs.readFileSync(outputPath);
        return outputBuffer;
    } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(textPath)) fs.unlinkSync(textPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
}

const { reportError } = require('../services/errorReporter');

module.exports = {
    name: ['s', 'sticker', 'stiker'],
    description: 'Ubah gambar/video ke sticker dengan iOS Emoji (Ultra HD)',
    async execute(sock, msg, context) {
        const { sender } = context;

        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const targetMsg = quotedMsg ? quotedMsg : msg.message;
            
            const viewOnce = targetMsg.viewOnceMessageV2 || targetMsg.viewOnceMessage || 
                             targetMsg.viewOnceMessageV2Extension; 
            const content = viewOnce ? viewOnce.message : targetMsg;
            const mediaMsg = content.imageMessage || content.videoMessage || content.stickerMessage;

            if (!mediaMsg) {
                return await sock.sendMessage(sender, { 
                    text: '⚠️ Kirim gambar/video dengan caption *!s* atau reply gambar/video/sticker.' 
                }, { quoted: msg });
            }

            if (!mediaMsg.mediaKey) {
                return await sock.sendMessage(sender, { 
                    text: '⚠️ Media tidak dapat diunduh (Media Key kosong). Cobalah mengirim ulang media tersebut.' 
                }, { quoted: msg });
            }

            const msgToDownload = {
                key: quotedMsg ? { 
                    ...msg.key, 
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant || msg.key.participant
                } : msg.key,
                message: content
            };

            let buffer = await downloadMediaMessage(msgToDownload, 'buffer', {}, { logger: console });
            if (!buffer) throw new Error('Gagal mengunduh media.');

            const text = context.args.trim();
            const isVideo = !!content.videoMessage;
            let textOverlay = null;

            if (text) {
                textOverlay = await renderTextToImage(text);
            }

            // Step 1: Handle video conversion if needed
            if (isVideo) {
                try {
                    // Pass textOverlay to FFmpeg for video processing
                    buffer = await videoToWebp(buffer, textOverlay);
                } catch (err) {
                    console.error('[STICKER] FFmpeg Error:', err);
                    throw new Error('Gagal memproses video. Pastikan format video didukung.');
                }
            }

            // Step 2: Processing with Sharp
            // For videos, the text is already burned in by FFmpeg in Step 1
            let pipeline = sharp(buffer, { animated: true })
                .resize(512, 512, {
                    fit: 'cover',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                });

            // Only composite with Sharp if it's NOT a video (for static images)
            if (text && !isVideo) {
                pipeline = pipeline.composite([
                    {
                        input: textOverlay,
                        gravity: 'south',
                        blend: 'over',
                        tile: false
                    }
                ]);
            }

            const finalBuffer = await pipeline
                .webp({ effort: 6, quality: isVideo ? 40 : 60 }) 
                .toBuffer();

            // Step 3: Create and Send Sticker
            const sticker = new Sticker(finalBuffer, {
                pack: 'Created by',
                author: '@Neardev',
                type: StickerTypes.FULL,
                categories: ['🤖'],
                id: 'monev-bot',
                quality: isVideo ? 40 : 60
            });

            await sock.sendMessage(sender, await sticker.toMessage(), { quoted: msg });

        } catch (error) {
            console.error('[STICKER] Error:', error);
            reportError(error, 'stickerCommand', { sender: sender, args: context.args });
            await sock.sendMessage(sender, { 
                text: `❌ *Gagal membuat sticker*\n\n*Error:* ${error.message.substring(0, 100)}` 
            }, { quoted: msg });
        }
    }
};