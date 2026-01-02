require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('--- DEBUG START ---');
console.log('Current Directory:', process.cwd());
const envPath = path.join(process.cwd(), '.env');
console.log('Checking .env at:', envPath);

if (fs.existsSync(envPath)) {
    console.log('✅ .env file exists.');

    // Check loaded env var
    const key = process.env.GROQ_API_KEY;
    console.log('Process Env GROQ_API_KEY is detected:', !!key);

    if (key) {
        console.log(`Key length: ${key.length}`);
        console.log(`Key format check (starts with 'gsk_'): ${key.trim().startsWith('gsk_')}`);
    } else {
        console.log('❌ process.env.GROQ_API_KEY is undefined or empty.');

        // Inspect file content safely
        try {
            const content = fs.readFileSync(envPath, 'utf8');
            console.log('Raw .env file size:', content.length, 'bytes');

            const lines = content.split('\n');
            let foundKeyInFile = false;

            lines.forEach((line, index) => {
                const trimmed = line.trim();
                // Check if line looks like GROQ_API_KEY=...
                if (trimmed.startsWith('GROQ_API_KEY')) {
                    foundKeyInFile = true;
                    const parts = trimmed.split('=');
                    console.log(`found line ${index + 1}: GROQ_API_KEY is present.`);
                    if (parts.length > 1 && parts[1].trim().length > 0) {
                        console.log(`Line ${index + 1} seems to have a value (length ${parts[1].trim().length}).`);
                    } else {
                        console.log(`Line ${index + 1} seems to have NO value.`);
                    }
                }
            });

            if (!foundKeyInFile) {
                console.log('❌ text "GROQ_API_KEY" NOT found in .env file lines.');
            }
        } catch (e) {
            console.log('Error reading .env file:', e.message);
        }
    }
} else {
    console.log('❌ .env file does NOT exist at expected path.');
}
console.log('--- DEBUG END ---');
