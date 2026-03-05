const axios = require('axios');
require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function testGroq() {
    console.log('Testing Groq API Key:', GROQ_API_KEY ? `${GROQ_API_KEY.substring(0, 10)}...` : 'MISSING');
    
    try {
        const response = await axios.post(GROQ_API_URL, {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Hello, are you active?' }],
            max_tokens: 10
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Groq Response Success!');
        console.log('Content:', response.data.choices[0]?.message?.content);
    } catch (error) {
        console.error('❌ Groq API Failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error Message:', error.message);
        }
    }
}

testGroq();
