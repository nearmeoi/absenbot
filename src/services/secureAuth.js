/**
 * Secure Authentication Service
 * - generateAuthUrl(): Generates registration URL via standalone auth server
 * - initAuthServer(): Minimal Express server for app API + auth callback
 */

import express from 'express';
import crypto from 'crypto';
import chalk from 'chalk';
import axios from 'axios';

const STANDALONE_AUTH_URL = 'http://localhost:3005';
const PUBLIC_AUTH_URL = 'http://monev-absenbot.my.id';

let authServer = null;
let botSocket = null;

function generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

function setBotSocket(sock) {
    botSocket = sock;
}

async function generateAuthUrl(phoneNumber) {
    const token = generateToken();

    try {
        const response = await axios.post(`${STANDALONE_AUTH_URL}/register-token`, {
            token,
            phone: phoneNumber
        }, { timeout: 10000 });

        if (response.status !== 200) {
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

async function initAuthServer() {
    if (authServer) return;

    const serverPort = process.env.DASHBOARD_PORT || 3000;
    const app = express();
    app.use(express.json());

    const appRoutesModule = await import('../routes/appRoutes.js');
    const appRoutes = appRoutesModule.default || appRoutesModule;
    app.use('/app-api', appRoutes);

    app.post('/api/external/auth-success', async (req, res) => {
        const { phone, email, secret } = req.body;

        if (secret !== process.env.DASHBOARD_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!phone) return res.status(400).json({ error: 'Phone required' });

        console.log(chalk.green(`[EXTERNAL-AUTH] Received success notification for ${phone}`));

        if (botSocket) {
            try {
                const { getMessage } = await import('./messageService.js');
                const { normalizeToStandard } = await import('../utils/messageUtils.js');
                const senderNumber = normalizeToStandard(phone);
                await botSocket.sendMessage(senderNumber, {
                    text: getMessage('!daftar_success', senderNumber)
                });
                console.log(chalk.green(`[EXTERNAL-AUTH] Success message sent to ${phone}`));
            } catch (e) {
                console.error(`[EXTERNAL-AUTH] Failed to send message:`, e.message);
            }
        }

        res.json({ success: true });
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
    });

    authServer = app.listen(serverPort, () => {
        console.log(chalk.green(`✅ API server running on port ${serverPort}`));
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
            console.log(chalk.yellow('🔒 API server closed'));
        });
    }
}

export {
    initAuthServer,
    generateAuthUrl,
    shutdownAuthServer,
    setBotSocket
};