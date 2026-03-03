const { downloadMediaMessage } = require('wileys');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { generateWaveform } = require('../utils/generateWaveform');

module.exports = {
    name: ['tovn', 'vn'],
    description: 'Ekstrak audio dari video atau ubah audio menjadi Voice Note (VN)',
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
                    text: '⚠️ Kirim video/audio dengan caption *!tovn* atau reply video/audio yang ingin diubah menjadi VN.' 
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
            const outputPath = path.join(tempDir, `out_${timestamp}.opus`);

            fs.writeFileSync(inputPath, buffer);

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .audioCodec('libopus')
                    .audioChannels(1)
                    .audioFrequency(48000) // WhatsApp's preferred sample rate for Opus
                    .audioBitrate('32k')
                    .outputOptions([
                        '-application voip',
                        '-frame_duration 20',
                        '-packet_loss 10',
                        '-map_metadata -1'
                    ])
                    .on('error', (err) => {
                        console.error('[TOVN] FFmpeg Error:', err);
                        reject(err);
                    })
                    .on('end', () => {
                        resolve();
                    })
                    .save(outputPath);
            });

            // Optional: Generate waveform for better look
            let waveform = null;
            try {
                const wfBuffer = await generateWaveform(outputPath);
                if (wfBuffer) {
                    waveform = Buffer.from(wfBuffer);
                }
            } catch (wfErr) {
                console.error('[TOVN] Waveform error (skipped):', wfErr.message);
            }

            const stats = fs.statSync(outputPath);
            console.log(`[TOVN] Sending VN (48kHz/32k): ${stats.size} bytes`);

            await sock.sendMessage(sender, { 
                audio: fs.readFileSync(outputPath),
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
                waveform: waveform
            }, { quoted: msg });

            // Cleanup
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        } catch (error) {
            console.error('[TOVN] Error:', error);
            await sock.sendMessage(sender, { text: `❌ Gagal mengekstrak VN.
_Error: ${error.message}_` }, { quoted: msg });
        }
    }
};
