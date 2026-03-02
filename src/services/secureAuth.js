/**
 * Secure Authentication Service (Client for Standalone)
 */

const express = require('express');
const crypto = require('crypto');
const chalk = require('chalk');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Port standalone auth server
const STANDALONE_AUTH_URL = 'http://localhost:3005';
const PUBLIC_AUTH_URL = 'http://monev-absenbot.my.id';

let authServer = null;
const serverPort = process.env.DASHBOARD_PORT || 3000;

function generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a secure authentication URL for a user
 * This now registers the token with the STANDALONE server
 */
async function generateAuthUrl(phoneNumber) {
    const token = generateToken();

    try {
        // Daftarkan token ke standalone server
        const response = await fetch(`${STANDALONE_AUTH_URL}/register-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, phone: phoneNumber })
        });

        if (!response.ok) {
            throw new Error(`Failed to register token: ${response.statusText}`);
        }

        const authUrl = `${PUBLIC_AUTH_URL}/auth/${token}`;
        console.log(chalk.green(`[AUTH] Generated auth URL (via Standalone): ${authUrl}`));
        return authUrl;
    } catch (e) {
        console.error(chalk.red('[AUTH] Error communicating with standalone server:'), e.message);
        return `${PUBLIC_AUTH_URL}/auth/${token}`;
    }
}

function initAuthServer() {
    if (authServer) return;

    const app = express();
    app.use(express.json());
    
    // Use session for dashboard
    const session = require('express-session');
    app.use(session({
        secret: process.env.DASHBOARD_SECRET || 'absenbot-secret',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false } // Set to true if using HTTPS
    }));

    // Serve static files from React build
    const path = require('path');
    const clientPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientPath));

    // Dashboard & API Routes
    const dashboardRoutes = require('../routes/dashboardRoutes');
    app.use('/dashboard', dashboardRoutes);

    // App/User-facing API Routes
    const appRoutes = require('../routes/appRoutes');
    app.use('/app-api', appRoutes);

    // Also attach dashboardRoutes to / (for SPA and general API)
    app.use('/', dashboardRoutes);

    authServer = app.listen(serverPort, () => {
        console.log(chalk.green(`✅ API & Dashboard server running on port ${serverPort}`));
    });

    authServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(chalk.red(`❌ Port ${serverPort} is already in use.`));
        } else {
            console.error(chalk.red('[AUTH SERVER] Error:'), err.message);
        }
    });
}

function shutdownAuthServer() {
    if (authServer) {
        authServer.close(() => {
            console.log(chalk.yellow('🔒 Auth/API server closed'));
        });
    }
}

module.exports = {
    initAuthServer,
    generateAuthUrl,
    shutdownAuthServer
};
