/**
 * Command: !settimezone [wib/wita/wit]
 * Mengubah zona waktu grup untuk penjadwalan
 */
const { updateGroup, getGroup } = require('../services/groupSettings');
const { reloadScheduler } = require('../services/scheduler');
const { getMessage } = require('../services/messageService');
const chalk = require('chalk');

module.exports = {
    name: 'settimezone',
    aliases: ['settz', 'zona'],
    description: 'Mengatur zona waktu grup (WIB, WITA, WIT)',

    async execute(sock, msgObj, context) {
        const { sender, isGroup, args, isOwner, isAdmin } = context;

        if (!isGroup) {
            await sock.sendMessage(sender, { text: "⚠️ Perintah ini hanya dapat digunakan di dalam grup." }, { quoted: msgObj });
            return;
        }

        // Pastikan yang mengubah adalah admin grup atau owner bot
        if (!isAdmin && !isOwner) {
            await sock.sendMessage(sender, { text: "❌ Hanya admin grup yang dapat mengubah zona waktu." }, { quoted: msgObj });
            return;
        }

        if (!args) {
            const currentGroup = getGroup(msgObj.key.remoteJid);
            const currentTz = currentGroup ? currentGroup.timezone : 'Asia/Makassar (Default)';
            await sock.sendMessage(sender, { 
                text: `🕒 *Zona Waktu Saat Ini:* ${currentTz}\n\nCara penggunaan:\n*!settimezone [wib/wita/wit]*` 
            }, { quoted: msgObj });
            return;
        }

        const input = args.toLowerCase().trim();
        let timezone = '';
        let label = '';

        if (input === 'wib') {
            timezone = 'Asia/Jakarta';
            label = 'WIB (GMT+7)';
        } else if (input === 'wita') {
            timezone = 'Asia/Makassar';
            label = 'WITA (GMT+8)';
        } else if (input === 'wit') {
            timezone = 'Asia/Jayapura';
            label = 'WIT (GMT+9)';
        } else {
            await sock.sendMessage(sender, { 
                text: "❌ Zona waktu tidak valid. Gunakan: *wib*, *wita*, atau *wit*." 
            }, { quoted: msgObj });
            return;
        }

        try {
            const groupId = msgObj.key.remoteJid;
            updateGroup(groupId, { timezone });
            
            // Reload scheduler agar mengikuti timezone baru
            reloadScheduler();
            
            console.log(chalk.green(`[GROUPS] Timezone updated and scheduler reloaded for ${groupId} to ${timezone}`));
            
            await sock.sendMessage(sender, { 
                text: `✅ Zona waktu grup berhasil diubah ke *${label}*.\n\nSemua jadwal pengingat sekarang akan mengikuti waktu tersebut.` 
            }, { quoted: msgObj });
        } catch (e) {
            console.error(chalk.red('[COMMANDS] Failed to update timezone:'), e);
            await sock.sendMessage(sender, { text: "❌ Gagal memperbarui zona waktu. Silakan coba lagi nanti." }, { quoted: msgObj });
        }
    }
};
