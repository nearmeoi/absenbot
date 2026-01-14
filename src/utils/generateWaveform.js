const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

/**
 * Generates a waveform buffer for WhatsApp Voice Notes (PTT)
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<Buffer>} - A Uint8Array buffer of 64 peaks (0-255)
 */
function generateWaveform(filePath) {
    return new Promise((resolve, reject) => {
        const command = ffmpeg(filePath)
            .audioChannels(1)
            .audioFrequency(44100) // Standard sample rate for better accuracy
            .format('s16le');

        const stream = command.pipe();
        const chunks = [];

        stream.on('data', (chunk) => {
            chunks.push(chunk);
        });

        stream.on('end', () => {
            const buffer = Buffer.concat(chunks);
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
            
            resolve(Buffer.from(waveform));
        });

        stream.on('error', (err) => {
            console.error('[Waveform] Error:', err);
            reject(err);
        });
    });
}

module.exports = { generateWaveform };
