const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

// Load Apple Color Emoji font once at startup (if available)
const EMOJI_FONT_PATH = '/home/ubuntu/.local/share/fonts/AppleColorEmoji.ttf';
try {
    const fontFs = require('fs');
    if (fontFs.existsSync(EMOJI_FONT_PATH)) {
        GlobalFonts.registerFromPath(EMOJI_FONT_PATH, 'AppleEmoji');
        console.log('[STICKER] Apple Color Emoji font loaded ✅');
    } else {
        console.warn('[STICKER] Apple Color Emoji not found at', EMOJI_FONT_PATH, '- using system emoji');
    }
} catch (e) {
    console.warn('[STICKER] Could not load emoji font:', e.message);
}

/**
 * Render text to transparent PNG using @napi-rs/canvas (Rust native, no browser)
 * Supports Apple Color Emoji (iPhone emoji) rendering
 * ~100x faster and ~50x less RAM than Puppeteer
 */
async function renderTextToImage(text) {
    const width = 512;
    const height = 120;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Auto-size font based on text length
    const fontSize = Math.min(56, Math.floor(450 / Math.max(text.length, 1)) + 20);
    const fontFamily = '"AppleEmoji", "Segoe UI Emoji", "Segoe UI", "Noto Color Emoji", sans-serif';

    // Draw text outline (black stroke)
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'black';
    ctx.strokeText(text, width / 2, height * 0.6);

    // Draw text fill (white)
    ctx.fillStyle = 'white';
    ctx.fillText(text, width / 2, height * 0.6);

    return canvas.toBuffer('image/png');
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
    name: ['s', 'sticker', 'stiker', 'sf', 'sfull', 'stickerfull'],
    description: 'Ubah gambar/video ke sticker (!sf untuk pertahankan dimensi asli)',
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
                    text: '⚠️ Kirim gambar/video dengan caption *!s* atau *!sf* (full dimension), atau reply gambar/video/sticker.'
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

            // Detect full mode from original command (!sf, !sfull, !stickerfull)
            const cmdUsed = context.textMessage.trim().split(/\s+/)[0].toLowerCase().replace(/^!/, '');
            const isFullMode = ['sf', 'sfull', 'stickerfull'].includes(cmdUsed);

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
                    fit: isFullMode ? 'contain' : 'cover',
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