/**
 * Command: Admin Schedule Controls
 * Replaces dashboard scheduler management
 */
const { loadSchedules, updateSchedule, runTestScheduler } = require('../services/scheduler');
const botState = require('../services/botState');
const { getAllUsers } = require('../services/database');
const { getAllowedGroups } = require('../config/holidays'); // Used for broadcast
const { ADMIN_NUMBERS } = require('../config/constants');
const chalk = require('chalk');

module.exports = {
    name: ['schedule', 'broadcast'],
    description: 'Admin schedule & broadcast control',

    async execute(sock, msgObj, context) {
        const { sender, commandName, args, fullArgs, isOwner } = context;

        if (!isOwner) {
            return sock.sendMessage(sender, { text: '❌ Anda tidak memiliki akses admin!' }, { quoted: msgObj });
        }

        if (commandName === 'broadcast') {
            if (!fullArgs) return sock.sendMessage(sender, { text: '❌ Format: !broadcast <pesan_anda>' }, { quoted: msgObj });

            await sock.sendMessage(sender, { text: '🔄 Memulai broadcast lintas grup dan private message...' }, { quoted: msgObj });

            let sent = 0;
            let failed = 0;

            // Broadcast to private users
            const users = getAllUsers();
            for (const user of users) {
                try {
                    await sock.sendMessage(user.phone, { text: `[BROADCAST ADMIN]\n\n${fullArgs}` });
                    sent++;
                    await new Promise(r => setTimeout(r, 3000)); // anti-spam delay
                } catch (e) { failed++; }
            }

            // Broadcast to groups
            const groups = getAllowedGroups();
            for (const groupId of groups) {
                try {
                    await sock.sendMessage(groupId, { text: `[BROADCAST ADMIN]\n\n${fullArgs}` });
                    sent++;
                    await new Promise(r => setTimeout(r, 3000));
                } catch (e) { failed++; }
            }

            return sock.sendMessage(sender, { text: `✅ Broadcast Selesai.\nBerhasil: ${sent}\nGagal: ${failed}` }, { quoted: msgObj });
        }

        // commandName === 'schedule'
        const action = args[0]?.toLowerCase();

        switch (action) {
            case 'list':
                const schedules = loadSchedules();
                let txt = `*DAFTAR JADWAL (Scheduler is ${botState.isSchedulerEnabled() ? 'ON ✅' : 'OFF ❌'})*\n\n`;
                schedules.forEach(s => {
                    txt += `ID: *${s.id}*\n`;
                    txt += `- Waktu: ${s.time} WITA\n`;
                    txt += `- Hari: ${s.days}\n`;
                    txt += `- Tipe: ${s.type}\n`;
                    txt += `- Status: ${s.enabled ? 'Aktif ✅' : 'Mati ❌'}\n\n`;
                });
                return sock.sendMessage(sender, { text: txt.trim() }, { quoted: msgObj });

            case 'toggle':
                const current = botState.isSchedulerEnabled();
                botState.setSchedulerEnabled(!current);
                return sock.sendMessage(sender, { text: `✅ Global Scheduler sekarang: *${!current ? 'ON' : 'OFF'}*` }, { quoted: msgObj });

            case 'on':
            case 'off':
                const schedIdTarget = args[1];
                if (!schedIdTarget) return sock.sendMessage(sender, { text: `❌ Format: !schedule ${action} <id>` }, { quoted: msgObj });

                const enableIt = (action === 'on');
                const updated = updateSchedule(schedIdTarget, { enabled: enableIt });
                if (updated) {
                    return sock.sendMessage(sender, { text: `✅ Jadwal *${schedIdTarget}* sekarang *${enableIt ? 'AKTIF' : 'MATI'}*` }, { quoted: msgObj });
                } else {
                    return sock.sendMessage(sender, { text: `❌ Jadwal dengan ID ${schedIdTarget} tidak ditemukan.` }, { quoted: msgObj });
                }

            case 'time':
                const idTime = args[1];
                const newTime = args[2];
                if (!idTime || !newTime || !newTime.includes(':')) {
                    return sock.sendMessage(sender, { text: `❌ Format: !schedule time <id> <HH:MM>` }, { quoted: msgObj });
                }
                const updatedTime = updateSchedule(idTime, { time: newTime });
                if (updatedTime) {
                    return sock.sendMessage(sender, { text: `✅ Waktu jadwal *${idTime}* diubah menjadi *${newTime}*` }, { quoted: msgObj });
                } else {
                    return sock.sendMessage(sender, { text: `❌ Jadwal dengan ID ${idTime} tidak ditemukan.` }, { quoted: msgObj });
                }

            case 'trigger':
                const idTrigger = args[1];
                if (!idTrigger) return sock.sendMessage(sender, { text: `❌ Format: !schedule trigger <id>` }, { quoted: msgObj });

                await sock.sendMessage(sender, { text: `🔄 Menjalankan trigger manual untuk jadwal: ${idTrigger}...` }, { quoted: msgObj });
                const result = await runTestScheduler(sock, idTrigger);
                if (result && result.success) {
                    return sock.sendMessage(sender, { text: `✅ Trigger berhasil dijalankan.` }, { quoted: msgObj });
                } else {
                    return sock.sendMessage(sender, { text: `❌ Gagal menjalankan trigger: ${result?.message || 'Error tidak diketahui'}` }, { quoted: msgObj });
                }

            default:
                const helpTxt = `*COMMANDS SCHEDULER*\n` +
                    `- !schedule list (Lihat jadwal)\n` +
                    `- !schedule toggle (Matikan/hidupkan secara global)\n` +
                    `- !schedule on <id> (Aktifkan jadwal)\n` +
                    `- !schedule off <id> (Matikan jadwal)\n` +
                    `- !schedule time <id> <HH:MM> (Ubah jam tayang)\n` +
                    `- !schedule trigger <id> (Jalankan paksa jadwal sekarang)\n` +
                    `- !broadcast <pesan> (Kirim pesan ke semua orang)`;
                return sock.sendMessage(sender, { text: helpTxt }, { quoted: msgObj });
        }
    }
};
