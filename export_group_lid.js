
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { AUTH_STATE_DIR } = require('./src/config/constants');
const fs = require('fs');

async function findGroup() {
    const { state } = await useMultiFileAuthState(AUTH_STATE_DIR);
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log("Fetching groups...");
            const groups = await sock.groupFetchAllParticipating();
            const target = Object.values(groups).find(g => g.subject.toLowerCase().includes("siapa suruh kesini"));
            
            if (target) {
                console.log(`FOUND_ID:${target.id}`);
                console.log(`SUBJECT:${target.subject}`);
                
                const data = target.participants.map(p => ({
                    id: p.id,
                    isLid: p.id.includes('@lid'),
                    phoneNumber: p.phoneNumber || null
                }));
                
                fs.writeFileSync('grup_lid_export.json', JSON.stringify({
                    groupName: target.subject,
                    groupId: target.id,
                    totalParticipants: data.length,
                    participants: data
                }, null, 2));
                
                console.log(`EXPORT_SUCCESS:grup_lid_export.json`);
            } else {
                console.log("GROUP_NOT_FOUND");
            }
            process.exit(0);
        }
    });
}

findGroup();
