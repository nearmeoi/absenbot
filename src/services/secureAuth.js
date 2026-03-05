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
const { scrapeAndSaveUser } = require('./nameScraper');

// In-memory storage for temporary tokens (would use Redis in production)
const tempTokens = new Map();
const pendingAuths = new Map(); // Store pending authentication requests

// Create a simple web server for authentication
let authServer = null;
let serverPort = process.env.AUTH_PORT || 3000;
let detectedIP = null;
let cleanupInterval = null; // Single interval for token cleanup

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
        resave: true, // Force session to be saved back to the session store
        saveUninitialized: false,
        rolling: true, // Force a session identifier cookie to be set on every response
        cookie: {
            secure: false, // Set to true if using HTTPS
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    }));

    // Serve React App Assets
    const clientDistPath = path.join(__dirname, '../../client/dist');
    
    // 1. Global static serving for common assets (manifest, sw, assets)
    // This ensures /assets/ or /manifest.webmanifest works from ANY domain/path
    app.use(express.static(clientDistPath, { index: false }));

    app.use('/dashboard', express.static(clientDistPath)); // Original dashboard mount
    
    // Also serve static assets at root for app subdomain
    app.use((req, res, next) => {
        const host = req.headers.host || '';
        if (host.startsWith('app.')) {
            return express.static(clientDistPath)(req, res, next);
        }
        next();
    });

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // App routes (Public/User)
    const appRoutes = require('../routes/appRoutes');
    app.use('/app-api', appRoutes);

    // Root redirect
    app.get('/', (req, res) => {
        const host = (req.headers.host || '').toLowerCase();
        console.log(chalk.cyan(`[AUTH] Root access from host: ${host}`));
        
        // Check for app subdomain (various formats)
        if (host.startsWith('app.') || host === 'app.monev-absenbot.my.id') {
            console.log(chalk.green(`[AUTH] Serving React App for subdomain: ${host}`));
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            return res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
        }
        
        // If it's the main domain or something else, go to dashboard
        console.log(chalk.yellow(`[AUTH] Redirecting to dashboard for host: ${host}`));
        res.redirect('/dashboard');
    });

    // Subdomain catch-all for React routing AND static assets
    app.use((req, res, next) => {
        const host = req.headers.host || '';
        // If on app subdomain, try to serve static file from root first
        if (host.startsWith('app.')) {
            // Serve static files (assets, etc) if they exist
            express.static(clientDistPath)(req, res, (err) => {
                if (err) return next(err);
                // If not found, serve index.html for SPA routing (exclude API)
                if (!req.path.startsWith('/app-api')) {
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                    return res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
                }
                next();
            });
            return;
        }
        next();
    });


    // Serve the Kemnaker-style Login Page (Restored)
    app.get('/auth/preview', (req, res) => {
        const loginPagePath = path.join(__dirname, '../../public/login.html');
        if (fs.existsSync(loginPagePath)) {
            res.sendFile(loginPagePath);
        } else {
            res.status(404).send('Login page not found (public/login.html missing)');
        }
    });

    app.get('/auth/:token', (req, res) => {
        const token = req.params.token;
        const authRequest = pendingAuths.get(token);

        // Also allow debug token or verify if token exists
        if (token !== 'debug-preview-token' && !authRequest) {
            return res.send('Link kadaluarsa atau tidak valid.');
        }

        const loginPagePath = path.join(__dirname, '../../public/login.html');
        if (fs.existsSync(loginPagePath)) {
            res.sendFile(loginPagePath);
        } else {
            res.status(404).send('Login page not found (public/login.html missing)');
        }
    });

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

                // TRIGGER NAME SYNC (Background Process)
                console.log(chalk.blue(`[AUTH] Triggering background name sync for ${email}...`));
                scrapeAndSaveUser({ email, password }).catch(err => {
                    console.error(chalk.red('[AUTH] Background sync failed:'), err.message);
                });

                // Call the WhatsApp notification callback (wrapped in try-catch to prevent crash)
                if (authRequest.callback) {
                    try {
                        authRequest.callback({ success: true, message: 'Registrasi berhasil!' });
                    } catch (callbackErr) {
                        console.error(chalk.red('[AUTH] Callback error:'), callbackErr.message);
                    }
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
            // Attach WebSocket for Terminal
            attachWebSocketServer(authServer);
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

// ==========================================
// WEBSOCKET TERMINAL SERVER (Polyfill without node-pty)
// ==========================================
function attachWebSocketServer(server) {
    try {
        const WebSocket = require('ws');
        const { spawn } = require('child_process');
        const wss = new WebSocket.Server({ server, path: '/term-socket' });

        wss.on('connection', (ws) => {
            console.log(chalk.green('[TERM] Client connected to terminal (Mock PTY)'));

            // Use standard spawn instead of node-pty
            // We force a simple prompt interaction
            const shell = spawn('bash', ['-i'], {
                env: process.env,
                cwd: process.env.HOME || process.cwd()
            });

            // Send output to client
            shell.stdout.on('data', (data) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(data.toString());
            });

            shell.stderr.on('data', (data) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(data.toString());
            });

            // Handle client input
            ws.on('message', (message) => {
                try {
                    const msgStr = message.toString();
                    // Ignore resize commands (not supported in raw spawn)
                    if (msgStr.startsWith('{"cols":')) return;
                    
                    // Write to stdin
                    shell.stdin.write(msgStr);
                } catch (e) {
                    console.error('Shell input error:', e);
                }
            });

            shell.on('close', () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send('\r\n[Process exited]\r\n');
                    ws.close();
                }
            });

            ws.on('close', () => {
                shell.kill();
            });
        });
        
        console.log(chalk.green('✅ WebSocket Terminal Server attached (Standard Spawn)'));

    } catch (e) {
        console.error(chalk.red('❌ Failed to start WebSocket Terminal:'), e.message);
    }
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

    // Start cleanup interval if not already running (SINGLE interval, not per-request)
    if (!cleanupInterval) {
        cleanupInterval = setInterval(cleanExpiredTokens, 10 * 60 * 1000); // 10 minutes
        console.log(chalk.cyan('[AUTH] Token cleanup interval started'));
    }

    // Get server address (auto-detects IP)
    const baseUrl = await getServerAddress();
    const authUrl = `${baseUrl}/auth/${token}`;

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
