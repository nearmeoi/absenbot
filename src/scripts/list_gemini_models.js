const axios = require('axios');
const GEMINI_API_KEY = 'AIzaSyDRLqq5E8GBcNSXHtx-RGuyvjiL5pwT0NU';

async function listModels() {
    try {
        const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        console.log("AVAILABLE MODELS:");
        res.data.models.forEach(m => {
            if (m.name.includes("gemini")) {
                console.log(`- ${m.name} (${m.displayName})`);
                console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
            }
        });
    } catch (e) {
        console.error("Error:", e.response?.data || e.message);
    }
}
listModels();
