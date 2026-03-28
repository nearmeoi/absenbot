import { downloadMediaMessage } from 'wileys';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

export default {
    name: ['tomp3', 'mp3'],
    description: 'Ekstrak audio dari video atau ubah audio menjadi MP3',
    async execute(sock, msg, context) {
        const { sender } = context;
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const targetMsg = quotedMsg ? quotedMsg : msg.message;
            
            const viewOnce = targetMsg.viewOnceMessageV2 || targetMsg.viewOnceMessage || 
                             targetMsg.viewOnceMessageV2Extension; 
            const content = viewOnce ? viewOnce.message : targetMsg;
            const mediaMsg = content.videoMessage || content.audioMessage;

            if (!mediaMsg) {
                return await sock.sendMessage(sender, { 
                    text: '⚠️ Kirim video/audio dengan caption *!tomp3* atau reply video/audio yang ingin diubah menjadi MP3.' 
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

            const buffer = await downloadMediaMessage(msgToDownload, 'buffer', {}, { logger: console });
            if (!buffer) throw new Error('Gagal mengunduh media.');

            const timestamp = Date.now();
            const inputPath = path.join(tempDir, `in_${timestamp}`);
            const outputPath = path.join(tempDir, `out_${timestamp}.mp3`);

            fs.writeFileSync(inputPath, buffer);

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .toFormat('mp3')
                    .on('error', (err) => {
                        console.error('[TOMP3] FFmpeg Error:', err);
                        reject(err);
                    })
                    .on('end', () => {
                        resolve();
                    })
                    .save(outputPath);
            });

            await sock.sendMessage(sender, { 
                audio: fs.readFileSync(outputPath),
                mimetype: 'audio/mpeg',
                fileName: `audio_${timestamp}.mp3`
            }, { quoted: msg });

            // Cleanup
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        } catch (error) {
            console.error('[TOMP3] Error:', error);
            await sock.sendMessage(sender, { text: `❌ Gagal mengekstrak MP3.
_Error: ${error.message}_` }, { quoted: msg });
        }
    }
};
