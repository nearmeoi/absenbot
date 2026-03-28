import ffmpeg from 'fluent-ffmpeg';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function generateWaveform(filePath) {
    return new Promise((resolve, reject) => {
        const tempFile = path.join(os.tmpdir(), `wf_${Date.now()}_${Math.random().toString(36).substring(7)}.raw`);

        ffmpeg(filePath)
            .audioChannels(1)
            .audioFrequency(44100)
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
                    
                    const targetBars = 64;
                    const waveform = new Uint8Array(targetBars);
                    const step = Math.floor(numSamples / targetBars);

                    let globalMax = 0;
                    for (let i = 0; i < numSamples; i++) {
                        const val = Math.abs(samples[i]);
                        if (val > globalMax) globalMax = val;
                    }
                    
                    if (globalMax === 0) globalMax = 1;

                    for (let i = 0; i < targetBars; i++) {
                        let localMax = 0;
                        const start = Math.floor(i * step);
                        const end = Math.min(start + step, numSamples);

                        for (let j = start; j < end; j++) {
                            const val = Math.abs(samples[j]);
                            if (val > localMax) localMax = val;
                        }

                        waveform[i] = Math.min(255, Math.floor((localMax / globalMax) * 255));
                    }
                    
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

export { generateWaveform };