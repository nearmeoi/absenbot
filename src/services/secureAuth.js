/**
 * Secure Authentication Service
 * Implements a web-based authentication flow to avoid sending credentials via WhatsApp
 */

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');
const os = require('os');
const { SESSION_DIR, USERS_FILE } = require('../config/constants');

// In-memory storage for temporary tokens (would use Redis in production)
const tempTokens = new Map();
const pendingAuths = new Map(); // Store pending authentication requests

// Create a simple web server for authentication
let authServer = null;
let serverPort = process.env.AUTH_PORT || 3000;
let detectedIP = null;

// Generate a secure random token
function generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Smart IP Detection - Works for both local and VPS
 * Priority: ENV variable > Public IP > Local IP > localhost
 */
async function getServerAddress() {
    // 0. Force Localhost (for testing)
    if (process.env.FORCE_LOCALHOST === 'true') {
        console.log(chalk.yellow(`[AUTH] Forcing localhost as requested`));
        return `http://localhost:${serverPort}`;
    }

    // 1. Check environment variable first (manual override)
    if (process.env.AUTH_URL) {
        return process.env.AUTH_URL;
    }

    if (process.env.VPS_IP) {
        return `http://${process.env.VPS_IP}:${serverPort}`;
    }

    // 2. Try to detect public IP (for VPS)
    try {
        const https = require('https');
        const publicIP = await new Promise((resolve, reject) => {
            https.get('https://api.ipify.org', { timeout: 3000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data.trim()));
            }).on('error', reject);
        });

        if (publicIP && /^\d+\.\d+\.\d+\.\d+$/.test(publicIP)) {
            console.log(chalk.cyan(`[AUTH] Detected public IP: ${publicIP}`));
            detectedIP = publicIP;
            return `http://${publicIP}:${serverPort}`;
        }
    } catch (e) {
        // Public IP detection failed, continue to local detection
    }

    // 3. Get local network IP (for development)
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(chalk.cyan(`[AUTH] Using local IP: ${iface.address}`));
                detectedIP = iface.address;
                return `http://${iface.address}:${serverPort}`;
            }
        }
    }

    // 4. Fallback to localhost
    console.log(chalk.yellow(`[AUTH] Fallback to localhost`));
    return `http://localhost:${serverPort}`;
}

// Initialize the authentication server
function initAuthServer() {
    const app = express();

    // Session middleware for dashboard
    app.use(session({
        secret: process.env.DASHBOARD_SECRET || 'absenbot-secret-key-change-this',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false, // Set to true if using HTTPS
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    }));

    // Serve React App Assets
    app.use('/dashboard', express.static(path.join(__dirname, '../../client/dist'))); // Serve React build at /dashboard
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Dashboard routes
    const dashboardRoutes = require('../routes/dashboardRoutes');
    app.use('/dashboard', dashboardRoutes);


    // Legacy HTML routes replaced by React SPA
    // app.get('/auth/preview') removed
    // app.get('/auth/:token') removed - handled by React Router via dashboard catch-all

    // Handle login submission
    app.post('/auth/submit', async (req, res) => {
        const { token, email, password } = req.body;

        // Allow debug token to simulate success UI (but not actual login)
        if (token === 'debug-preview-token') {
            return res.json({
                success: true,
                message: 'Login simulation successful (Debug Mode)'
            });
        }

        if (!token || !email || !password) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const authRequest = pendingAuths.get(token);
        if (!authRequest) {
            return res.status(400).json({ success: false, message: 'Invalid or expired token' });
        }

        // Import the magang service to verify credentials
        const { cekKredensial } = require('./magang');
        const { saveUser } = require('./database');

        try {
            const result = await cekKredensial(email, password);

            if (result.success) {
                // Save user using database module (handles multi-identifier auto-linking)
                saveUser(authRequest.phone, email, password);


                // Call the WhatsApp notification callback
                if (authRequest.callback) {
                    authRequest.callback({ success: true, message: 'Registrasi berhasil!' });
                }

                // Clean up the token
                pendingAuths.delete(token);
                tempTokens.delete(token);

                res.json({
                    success: true,
                    message: 'Successfully registered and logged in!'
                });
            } else {
                res.json({
                    success: false,
                    message: result.pesan || 'Login failed'
                });
            }
        } catch (error) {
            console.error('Auth error:', error);
            res.json({
                success: false,
                message: 'Server error during authentication'
            });
        }
    });

    // Endpoint to notify about auth status
    app.post('/auth/notify', (req, res) => {
        const { token, success, message } = req.body;

        if (token === 'debug-preview-token') return res.json({ success: true });

        const authRequest = pendingAuths.get(token);

        if (authRequest && authRequest.callback) {
            // Call the WhatsApp notification callback
            authRequest.callback({ success, message });
        }

        res.json({ success: true });
    });

    // Start server on available port
    let attempts = 0;
    const maxAttempts = 10;

    function startServer() {
        if (attempts >= maxAttempts) {
            console.error(chalk.red('❌ Could not start auth server - all ports busy'));
            return;
        }

        authServer = app.listen(serverPort, () => {
            console.log(chalk.green(`✅ Auth server running on port ${serverPort}`));
            if (process.env.FORCE_LOCALHOST === 'true') {
                console.log(chalk.yellow(`👉 Debug Preview: http://localhost:${serverPort}/auth/preview`));
            }
        });

        authServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(chalk.yellow(`⚠️ Port ${serverPort} in use, trying ${serverPort + 1}`));
                serverPort++;
                attempts++;
                startServer();
            }
        });
    }

    startServer();
}

// Generate a secure authentication URL for a user
async function generateAuthUrl(phoneNumber, callback) {
    const token = generateToken();

    // Store the pending authentication request
    pendingAuths.set(token, {
        phone: phoneNumber,
        timestamp: Date.now(),
        callback: callback
    });

    // Store token temporarily
    tempTokens.set(token, Date.now());

    // Clean up expired tokens periodically
    setTimeout(cleanExpiredTokens, 10 * 60 * 1000); // 10 minutes

    // Get server address (auto-detects IP)
    const baseUrl = await getServerAddress();
    const authUrl = `${baseUrl}/dashboard/auth/${token}`;

    console.log(chalk.green(`[AUTH] Generated auth URL: ${authUrl}`));
    return authUrl;
}

// Clean up expired tokens
function cleanExpiredTokens() {
    const now = Date.now();
    const expiredTokens = [];

    for (const [token, timestamp] of tempTokens) {
        if (now - timestamp > 10 * 60 * 1000) { // 10 minutes
            expiredTokens.push(token);
        }
    }

    for (const token of expiredTokens) {
        tempTokens.delete(token);
        pendingAuths.delete(token);
    }
}

// Shutdown the auth server
function shutdownAuthServer() {
    if (authServer) {
        authServer.close(() => {
            console.log(chalk.yellow('🔒 Auth server closed'));
        });
    }
}

module.exports = {
    initAuthServer,
    generateAuthUrl,
    shutdownAuthServer
};