const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Generates a waveform buffer for WhatsApp Voice Notes (PTT)
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<Buffer>} - A Uint8Array buffer of 64 peaks (0-255)
 */
function generateWaveform(filePath) {
    return new Promise((resolve, reject) => {
        const tempFile = path.join(os.tmpdir(), `wf_${Date.now()}_${Math.random().toString(36).substring(7)}.raw`);

        ffmpeg(filePath)
            .audioChannels(1)
            .audioFrequency(44100) // Standard sample rate for better accuracy
            .format('s16le')
            .on('error', (err) => {
                console.error('[Waveform] FFMPEG Command Error:', err);
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                reject(err);
            })
            .on('end', () => {
                try {
                    const buffer = fs.readFileSync(tempFile);
                    const numSamples = Math.floor(buffer.length / 2);
                    const samples = new Int16Array(buffer.buffer, buffer.byteOffset, numSamples);
                    
                    // WhatsApp typically uses 64 bars
                    const targetBars = 64;
                    const waveform = new Uint8Array(targetBars);
                    const step = Math.floor(numSamples / targetBars);

                    // First pass: find global maximum for relative normalization
                    let globalMax = 0;
                    for (let i = 0; i < numSamples; i++) {
                        const val = Math.abs(samples[i]);
                        if (val > globalMax) globalMax = val;
                    }
                    
                    // Avoid division by zero
                    if (globalMax === 0) globalMax = 1;

                    for (let i = 0; i < targetBars; i++) {
                        let localMax = 0;
                        const start = Math.floor(i * step);
                        const end = Math.min(start + step, numSamples);

                        for (let j = start; j < end; j++) {
                            const val = Math.abs(samples[j]);
                            if (val > localMax) localMax = val;
                        }

                        // Normalize relative to the file's own loud parts
                        // This ensures quiet files still have visible waves
                        waveform[i] = Math.min(255, Math.floor((localMax / globalMax) * 255));
                    }
                    
                    // Cleanup
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    
                    resolve(Buffer.from(waveform));
                } catch (e) {
                    console.error('[Waveform] Processing Error:', e);
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    reject(e);
                }
            })
            .save(tempFile);
    });
}

module.exports = { generateWaveform };
