const { generateWaveform } = require('./src/utils/generateWaveform');
const path = require('path');
const fs = require('fs');

async function test() {
    const mediaDir = path.join(__dirname, 'data/media/morning');
    const files = fs.readdirSync(mediaDir).filter(f => f.endsWith('.opus'));
    
    if (files.length === 0) {
        console.log('No opus files found to test.');
        return;
    }

    const testFile = path.join(mediaDir, files[0]);
    console.log(`Testing waveform generation for: ${testFile}`);

    try {
        const waveform = await generateWaveform(testFile);
        console.log('Waveform generated!');
        console.log('Length:', waveform.length);
        console.log('Data (first 10):', waveform.slice(0, 10));
    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
