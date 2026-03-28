/**
 * Command: !getid
 * Membantu user mengetahui JID/LID mereka dan memindai anggota grup
 */
import { updateUserLid } from '../services/database.js';
import chalk from 'chalk';

export default {
    name: ['getid', 'getlid', 'mylid'],
    description: 'Mengetahui ID WhatsApp/LID Anda atau daftar LID grup',

    async execute(sock, msgObj, context) {
        const { sender, isGroup, args } = context;
        
        // Resolve target JID (LID or Phone)
        const senderJid = msgObj.key.participant || msgObj.key.remoteJid;

        // Sub-command: !getid all (Hanya untuk grup)
        if (isGroup && args && args.toLowerCase() === 'all') {
            try {
                await sock.sendMessage(sender, { react: { text: '🔍', key: msgObj.key } });
                
                const metadata = await sock.groupMetadata(sender);
                const participants = metadata.participants;
                
                let report = `👥 *DAFTAR LID ANGGOTA GRUP*\n`;
                report += `Nama Grup: ${metadata.subject}\n`;
                report += `Total Anggota: ${participants.length}\n\n`;
                
                let lidCount = 0;
                participants.forEach((p, i) => {
                    const id = p.id;
                    const isLid = id.includes('@lid');
                    if (isLid) lidCount++;
                    
                    // Format: 1. 628xxx (Phone) atau [LID] 123xxx@lid
                    report += `${i + 1}. ${isLid ? '🔗 `' + id + '`' : '📱 `' + id + '`'}\n`;
                });
                
                report += `\n*Statistik:* ${lidCount} LID detected.`;

                await sock.sendMessage(sender, { text: report }, { quoted: msgObj });
                return;
            } catch (err) {
                console.error(chalk.red('[CMD:GETID] Error fetching group metadata:'), err);
                await sock.sendMessage(sender, { text: "❌ Gagal mengambil data grup. Pastikan bot adalah Admin." }, { quoted: msgObj });
                return;
            }
        }

        // Default: !getid (Diri sendiri)
        const isLid = senderJid.includes('@lid');
        let message = `🆔 *INFO IDENTITAS ANDA*\n\n`;
        message += `*JID:* \`${senderJid}\`\n`;
        message += `*Tipe:* ${isLid ? 'LID (WhatsApp Internal ID)' : 'Phone Number JID'}\n\n`;
        
        if (isLid) {
            message += `_LID terdeteksi. Sistem akan otomatis memetakan ID ini ke akun Anda jika Anda sudah terdaftar._`;
        } else {
            message += `_ID Anda menggunakan format nomor telepon standar._`;
        }

        await sock.sendMessage(sender, { text: message }, { quoted: msgObj });
    }
};
