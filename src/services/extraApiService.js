/**
 * Extra API Service
 * Extracted features from various bot sources
 */
const axios = require('axios');
const fs = require('fs');
const BodyForm = require('form-data');
const path = require('path');
const chalk = require('chalk');

/**
 * Upload file to Catbox.moe
 */
async function uploadToCatbox(filePath) {
    try {
        if (!fs.existsSync(filePath)) throw new Error("File not found");
        
        const fileStream = fs.createReadStream(filePath);
        const formData = new BodyForm();
        formData.append('fileToUpload', fileStream);
        formData.append('reqtype', 'fileupload');
        formData.append('userhash', '');

        const response = await axios.post('https://catbox.moe/user/api.php', formData, {
            headers: { ...formData.getHeaders() },
        });

        return response.data; // Returns file URL
    } catch (error) {
        console.error("[EXTRA-API] Catbox Error:", error.message);
        throw error;
    }
}

/**
 * Upload file to Telegra.ph
 */
async function uploadToTelegraph(filePath) {
    try {
        if (!fs.existsSync(filePath)) throw new Error("File not found");
        
        const form = new BodyForm();
        form.append("file", fs.createReadStream(filePath));
        
        const response = await axios.post("https://telegra.ph/upload", form, {
            headers: { ...form.getHeaders() }
        });
        
        return "https://telegra.ph" + response.data[0].src;
    } catch (error) {
        console.error("[EXTRA-API] Telegraph Error:", error.message);
        throw error;
    }
}

/**
 * AI Voice via ElevenLabs (using Termai API)
 */
async function textToSpeechNatural(text, voice = "bella") {
    try {
        const url = "https://api.termai.cc/api/text2speech/elevenlabs";
        const key = "TermAI-4ALwMabCh0KiN9I3";
        
        const response = await axios.get(url, {
            params: { text, voice, pitch: 0, speed: 0.9, key },
            responseType: "arraybuffer"
        });

        return response.data; // Audio buffer
    } catch (error) {
        console.error("[EXTRA-API] TTS Natural Error:", error.message);
        throw error;
    }
}

/**
 * AI Multimedia (Text-to-Video/Image via Aritek)
 */
const aiMultimedia = {
    setup: {
        cipher: 'hbMcgZLlzvghRlLbPcTbCpfcQKM0PcU0zhPcTlOFMxBZ1oLmruzlVp9remPgi0QWP0QW',
        dec(text) {
            return [...text].map(c =>
                /[a-z]/.test(c) ? String.fromCharCode((c.charCodeAt(0) - 97 - 3 + 26) % 26 + 97)
                : /[A-Z]/.test(c) ? String.fromCharCode((c.charCodeAt(0) - 65 - 3 + 26) % 26 + 65)
                : c
            ).join('');
        }
    },

    generate: async (prompt, type = 'video') => {
        const token = aiMultimedia.setup.dec(aiMultimedia.setup.cipher);
        const baseUrl = 'https://text2video.aritek.app';
        
        try {
            if (type === 'image') {
                const form = new BodyForm();
                form.append('prompt', prompt);
                form.append('token', token);
                const res = await axios.post(`${baseUrl}/text2img`, form, {
                    headers: { ...form.getHeaders(), 'user-agent': 'NB Android/1.0.0' }
                });
                return { success: true, url: res.data.url };
            } else {
                const payload = { 
                    deviceID: Math.random().toString(16).substring(2, 18),
                    isPremium: 1, prompt, used: [], versionCode: 59 
                };
                const res = await axios.post(`${baseUrl}/txt2videov3`, payload, {
                    headers: { authorization: token, 'user-agent': 'NB Android/1.0.0' }
                });
                
                if (res.data.code !== 0) throw new Error("Gagal mengambil Key Video");
                
                // Polling for video result
                const key = res.data.key;
                for (let i = 0; i < 60; i++) { // Max 2 minutes
                    await new Promise(r => setTimeout(r, 2000));
                    const poll = await axios.post(`${baseUrl}/video`, { keys: [key] }, {
                        headers: { authorization: token, 'user-agent': 'NB Android/1.0.0' }
                    });
                    if (poll.data.code === 0 && poll.data.datas[0].url) {
                        return { success: true, url: poll.data.datas[0].url };
                    }
                }
                throw new Error("Timeout generating video");
            }
        } catch (e) {
            console.error("[EXTRA-API] AI Multimedia Error:", e.message);
            return { success: false, error: e.message };
        }
    }
};

/**
 * Shion AI Chat (Roleplay Style)
 */
async function chatWithShion(text) {
    try {
        const url = `https://zelapioffciall.koyeb.app/ai/shion?text=${encodeURIComponent(text)}`;
        const res = await axios.get(url);
        if (res.data.status && res.data.result) {
            return res.data.result.content;
        }
        throw new Error("Invalid AI response");
    } catch (e) {
        console.error("[EXTRA-API] Shion AI Error:", e.message);
        throw e;
    }
}

module.exports = {
    uploadToCatbox,
    uploadToTelegraph,
    textToSpeechNatural,
    aiMultimedia,
    chatWithShion
};
