
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { AUTH_STATE_DIR } = require('./src/config/constants');

async function findBintang() {
    const { state } = await useMultiFileAuthState(AUTH_STATE_DIR);
    const sock = makeWASocket({ auth: state, logger: require('pino')({ level: 'silent' }) });

    sock.ev.on('connection.update', async (update) => {
        if (update.connection === 'open') {
            const groups = await sock.groupFetchAllParticipating();
            const target = Object.values(groups).find(g => /siapa\s+suruh\s+ke?\s*sini/i.test(g.subject));
            
            if (target) {
                console.log(`Searching in ${target.subject}...`);
                const participants = target.participants;
                
                // Note: participants usually only have id. To get name, we might need store or look at metadata
                // But let's check if any have names in the metadata
                participants.forEach(p => {
                    // Search for Mahabintang or Bintang in any available field
                    console.log(`ID: ${p.id}`);
                });
            }
            process.exit(0);
        }
    });
}
findBintang();
