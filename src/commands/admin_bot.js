/**
 * Command: Admin Bot Controls
 * Replaces dashboard bot status functions
 */
const { getMessage } = require('../services/messageService');
const botState = require('../services/botState');
const { ADMIN_NUMBERS, AUTH_STATE_DIR } = require('../config/constants');
const fs = require('fs');
const { exec } = require('child_process');

module.exports = {
    name: ['botstatus', 'setstatus', 'restart', 'resetsession', 'maintenance'],
    description: 'Admin bot control commands (Dashboard replacement)',

    async execute(sock, msgObj, context) {
        const { sender, commandName, args } = context;

        // ADMIN CHECK
        if (!ADMIN_NUMBERS.includes(sender)) {
            return sock.sendMessage(sender, { text: '❌ Anda tidak memiliki akses admin!' }, { quoted: msgObj });
        }

        switch (commandName) {
            case 'botstatus':
                const statusInfo = `*BOT STATUS*\n\n` +
                    `- Status: ${botState.getBotStatus().toUpperCase()}\n` +
                    `- WS Connected: ${botState.isBotConnected() ? '✅' : '❌'}\n` +
                    `- Scheduler Enabled: ${botState.isSchedulerEnabled() ? '✅' : '❌'}\n\n` +
                    `*Maintenance Commands:*\n` +
                    (botState.getMaintenanceCommands().length > 0 ?
                        botState.getMaintenanceCommands().map(c => `- !${c}`).join('\n') :
                        '- None');
                return sock.sendMessage(sender, { text: statusInfo }, { quoted: msgObj });

            case 'setstatus':
                const newStatus = args[0]?.toLowerCase();
                if (!['online', 'offline', 'maintenance'].includes(newStatus)) {
                    return sock.sendMessage(sender, { text: '❌ Format: !setstatus <online|offline|maintenance>' }, { quoted: msgObj });
                }
                botState.setBotStatus(newStatus);
                return sock.sendMessage(sender, { text: `✅ Bot status set to: ${newStatus.toUpperCase()}` }, { quoted: msgObj });

            case 'restart':
                await sock.sendMessage(sender, { text: '🔄 Merestart bot via PM2...' }, { quoted: msgObj });
                setTimeout(() => {
                    exec('pm2 restart absenbot', (err) => {
                        if (err) console.error('Gagal restart via PM2:', err);
                    });
                }, 1000);
                break;

            case 'resetsession':
                await sock.sendMessage(sender, { text: '⚠️ Menghapus sesi WhatsApp dan merestart bot untuk pairing ulang...' }, { quoted: msgObj });
                setTimeout(() => {
                    try {
                        if (fs.existsSync(AUTH_STATE_DIR)) {
                            fs.rmSync(AUTH_STATE_DIR, { recursive: true, force: true });
                        }
                        exec('pm2 restart absenbot');
                    } catch (e) {
                        console.error('Gagal reset session:', e);
                    }
                }, 1000);
                break;

            case 'maintenance':
                const targetCmd = args[0]?.toLowerCase();
                if (!targetCmd) {
                    return sock.sendMessage(sender, { text: '❌ Format: !maintenance <command_name>' }, { quoted: msgObj });
                }
                botState.toggleCommandMaintenance(targetCmd);
                const isMaint = botState.isCommandUnderMaintenance(targetCmd);
                return sock.sendMessage(sender, { text: `✅ Command !${targetCmd} is now ${isMaint ? 'di bawah perbaikan (MAINTENANCE)' : 'AKTIF'}` }, { quoted: msgObj });
        }
    }
};
