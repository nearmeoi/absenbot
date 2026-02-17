/**
 * Command: !delete / !del
 * Delete a message sent by the bot (must be a reply)
 */
module.exports = {
    name: ['delete', 'del'],
    description: 'Hapus pesan yang dikirim oleh bot',
    async execute(sock, msg, context) {
        const { sender } = context;

        // 1. Check if it's a reply
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;

        if (!quotedMsg || !contextInfo?.stanzaId) {
            return await sock.sendMessage(sender, { 
                text: '⚠️ Balas pesan bot yang ingin dihapus dengan perintah *!delete*.' 
            }, { quoted: msg });
        }

        // 2. Determine if the quoted message was sent by the bot
        // Extract plain JID (without device ID)
        const getPlainJid = (jid) => jid ? jid.split(':')[0].split('@')[0] + '@s.whatsapp.net' : '';
        const getPlainLid = (jid) => jid ? jid.split(':')[0].split('@')[0] + '@lid' : '';
        
        const botJidPlain = getPlainJid(sock.user.id);
        const botLidPlain = sock.user.lid ? getPlainLid(sock.user.lid) : '';
        
        const participant = contextInfo.participant || contextInfo.remoteJid;
        const participantPlain = getPlainJid(participant);
        const participantLid = participant.includes('@lid') ? getPlainLid(participant) : '';
        
        // Debugging for admin logs
        console.log(`[DELETE] Request from ${sender}`);
        console.log(`[DELETE] Bot JID: ${sock.user.id} (Plain: ${botJidPlain}), LID: ${sock.user.lid}`);
        console.log(`[DELETE] Participant JID: ${participant} (Plain: ${participantPlain}), IsLID: ${participant.includes('@lid')}`);

        // Check if message is from bot (Standard JID or LID)
        const isBotMessage = (participantPlain === botJidPlain) || 
                             (botLidPlain && participantLid === botLidPlain) ||
                             (participant === sock.user.id) ||
                             (participant === sock.user.lid) ||
                             (contextInfo.participant === undefined && !sender.endsWith('@g.us')); // Private chat fallback

        if (!isBotMessage) {
            return await sock.sendMessage(sender, { 
                text: `⚠️ Saya hanya bisa menghapus pesan yang saya kirim sendiri.\n\n_Debug: ${participantPlain} vs ${botJidPlain}_` 
            }, { quoted: msg });
        }

        try {
            // 3. Send delete request (REVOKE)
            await sock.sendMessage(sender, {
                delete: {
                    remoteJid: sender,
                    fromMe: true,
                    id: contextInfo.stanzaId,
                    participant: participant // Required for groups
                }
            });
            
        } catch (error) {
            console.error('[DELETE] Error:', error);
            await sock.sendMessage(sender, { 
                text: '❌ Gagal menghapus pesan. Mungkin pesan sudah terlalu lama atau ada kendala koneksi.' 
            }, { quoted: msg });
        }
    }
};
