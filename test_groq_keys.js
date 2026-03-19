const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const GROQ_KEY = process.env.GROQ_API_KEY;

async function testGroq(apiKey) {
    console.log(`\n🔍 Mengetes Groq API Key: ${apiKey.substring(0, 10)}...`);
    
    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Halo, ini tes koneksi. Balas dengan kata "OK".' }],
            max_tokens: 5
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        const content = response.data.choices[0]?.message?.content;
        console.log(`✅ VALID! Respon AI: "${content.trim()}"`);
        return true;
    } catch (err) {
        const status = err.response?.status || 'TIMEOUT/NETWORK';
        const msg = err.response?.data?.error?.message || err.message;
        console.error(`❌ INVALID! Status: ${status} | Error: ${msg}`);
        return false;
    }
}

async function runTest() {
    if (!GROQ_KEY) {
        console.error('❌ Tidak ada GROQ_API_KEY di file .env!');
        return;
    }

    const keys = GROQ_KEY.split(',').map(k => k.trim());
    console.log(`Ditemukan ${keys.length} API Key.`);

    for (let i = 0; i < keys.length; i++) {
        await testGroq(keys[i]);
    }
}

runTest();
