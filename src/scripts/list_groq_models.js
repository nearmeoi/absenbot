const axios = require('axios');
require('dotenv').config();
const GROQ_API_KEY = process.env.GROQ_API_KEY;

(async () => {
    try {
        const response = await axios.get('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
        });
        console.log("Available Groq Models:");
        response.data.data.forEach(m => console.log(`- ${m.id}`));
    } catch (e) {
        console.error("Error listing Groq models:", e.response ? e.response.data : e.message);
    }
})();
