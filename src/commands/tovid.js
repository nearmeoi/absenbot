import { downloadMediaMessage } from 'wileys';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { exec } from 'child_process';
const execPromise = (cmd, opts) => new Promise((resolve, reject) => {
    exec(cmd, opts, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve({ stdout, stderr });
    });
});

export default {
    name: ['tovid', 'tovideo', 'vid'],
    description: 'Ubah sticker animasi menjadi video (MP4) - Ultra Fast',
    async execute(sock, msg, context) {
        const { sender } = context;
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg || !quotedMsg.stickerMessage) {
                return await sock.sendMessage(sender, { text: '⚠️ Balas sticker animasi untuk diubah ke video.' }, { quoted: msg });
            }

            const sticker = quotedMsg.stickerMessage;
            const msgToDownload = {
                key: {
                    ...msg.key,
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant || msg.key.participant
                },
                message: quotedMsg
            };

            const buffer = await downloadMediaMessage(msgToDownload, 'buffer', {});
            if (!buffer) throw new Error('Gagal mengunduh sticker.');

            const timestamp = Date.now();
            const inputPath = path.join(tempDir, `in_${timestamp}.webp`);
            const outputPath = path.join(tempDir, `out_${timestamp}.mp4`);

            // Save buffer for ffmpeg
            fs.writeFileSync(inputPath, buffer);

            /**
             * ULTRA FAST OPTIMIZATION:
             * 1. Use -probesize and -analyzeduration to speed up initial format detection.
             * 2. Use 'ultrafast' preset for x264.
             * 3. Avoid complex filters if possible, but keep scale for compatibility.
             * 4. Direct conversion from webp to mp4 if ffmpeg supports it (it should if it has libwebp).
             */
            const ffmpegCmd = `ffmpeg -y -probesize 32k -analyzeduration 0 -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black" -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -movflags +faststart -threads 0 "${outputPath}"`;

            try {
                await execPromise(ffmpegCmd);
            } catch (err) {
                // Fallback to GIF method if direct webp fails (for older ffmpeg versions)
                console.log('[TOVID] Direct conversion failed, using GIF fallback...');
                const gifBuffer = await sharp(buffer, { animated: true }).gif().toBuffer();
                const gifPath = path.join(tempDir, `temp_${timestamp}.gif`);
                fs.writeFileSync(gifPath, gifBuffer);
                await execPromise(`ffmpeg -y -i "${gifPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${outputPath}"`);
                if (fs.existsSync(gifPath)) fs.unlinkSync(gifPath);
            }

            await sock.sendMessage(sender, { video: fs.readFileSync(outputPath) }, { quoted: msg });

            // Cleanup
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        } catch (error) {
            console.error('[TOVID] Error:', error);
            await sock.sendMessage(sender, { text: '❌ Gagal konversi cepat.' }, { quoted: msg });
        }
    }
};