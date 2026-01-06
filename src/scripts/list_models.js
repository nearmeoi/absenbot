const axios = require('axios');
const GEMINI_API_KEY = 'AIzaSyDRLqq5E8GBcNSXHtx-RGuyvjiL5pwT0NU';

(async () => {
    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        console.log("Available Models:");
        response.data.models.forEach(m => {
            if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                console.log(`- ${m.name}`);
            }
        });
    } catch (e) {
        console.error("Error listing models:", e.response ? e.response.data : e.message);
    }
})();
