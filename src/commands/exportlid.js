
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'exportlid',
    description: 'Export semua LID grup ke JSON',

    async execute(sock, msgObj, context) {
        const { sender, isGroup, senderNumber } = context;

        if (!isGroup) {
            return sock.sendMessage(sender, { text: "❌ Perintah ini hanya bisa digunakan di dalam grup." }, { quoted: msgObj });
        }

        try {
            await sock.sendMessage(sender, { react: { text: '📂', key: msgObj.key } });

            const metadata = await sock.groupMetadata(sender);
            const participants = metadata.participants;

            const data = {
                groupName: metadata.subject,
                groupId: metadata.id,
                exportedAt: new Date().toISOString(),
                totalParticipants: participants.length,
                members: participants.map(p => ({
                    id: p.id,
                    isLid: p.id.includes('@lid'),
                    phoneNumber: p.phoneNumber || null
                }))
            };

            const fileName = `export_lid_${metadata.id.split('@')[0]}.json`;
            const filePath = path.join(__dirname, '../../temp', fileName);

            // Ensure temp dir exists
            if (!fs.existsSync(path.join(__dirname, '../../temp'))) {
                fs.mkdirSync(path.join(__dirname, '../../temp'));
            }

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

            // Kirim file ke user yang meminta (PC)
            await sock.sendMessage(senderNumber, { 
                document: fs.readFileSync(filePath), 
                fileName: fileName, 
                mimetype: 'application/json',
                caption: `✅ Export LID untuk grup: *${metadata.subject}*`
            });

            await sock.sendMessage(sender, { text: "✅ File JSON telah dikirim ke chat pribadi Anda." }, { quoted: msgObj });

            // Hapus file temp setelah dikirim
            setTimeout(() => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }, 5000);

        } catch (err) {
            console.error('[CMD:EXPORTLID] Error:', err);
            await sock.sendMessage(sender, { text: "❌ Gagal melakukan export. Pastikan bot adalah admin." }, { quoted: msgObj });
        }
    }
};
