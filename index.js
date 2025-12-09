// Load environment variables first
require('dotenv').config();

const connectToWhatsApp = require('./src/app');

// Start Application
try {
    connectToWhatsApp();
} catch (error) {
    console.error("Critical Error starting application:", error);
}