const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const cron = require('node-cron'); // LIBRARY JADWAL
const fs = require('fs');

// Import Fungsi Cek Masal dari database/api (Kita reuse logika handler)
const { getAllUsers } = require('./database');
const { cekStatusHarian } = require('./api_magang');

const usePairingCode = true

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve) => rl.question(text, (ans) => { rl.close(); resolve(ans) }))
}

function getMessageContent(msg) {
    if (!msg.message) return "";
    const m = msg.message;
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage && m.extendedTextMessage.text) return m.extendedTextMessage.text;
    if (m.imageMessage && m.imageMessage.caption) return m.imageMessage.caption;
    if (m.ephemeralMessage && m.ephemeralMessage.message) {
        const sub = m.ephemeralMessage.message;
        if (sub.conversation) return sub.conversation;
        if (sub.extendedTextMessage) return sub.extendedTextMessage.text;
    }
    return "";
}

// --- FUNGSI ALARM OTOMATIS ---
async function runAutoReminder(sock) {
    console.log(chalk.magenta('[SCHEDULER] Menjalankan Alarm Otomatis...'));
    
    // Cek apakah ada file ID Grup
    if (!fs.existsSync('./group_id.txt')) {
        console.log(chalk.red('[SCHEDULER] Gagal: Belum ada grup yang diset. Ketik !setgroup di WA.'));
        return;
    }

    const groupId = fs.readFileSync('./group_id.txt', 'utf8').trim();
    const allUsers = getAllUsers();
    
    if (allUsers.length === 0) return;

    await sock.sendMessage(groupId, { text: `🔔 *ALARM OTOMATIS*\nSedang mengecek status absensi seluruh peserta...` });

    let belumAbsen = [];
    for (const user of allUsers) {
        try {
            // Cek status via API (Cepat)
            const status = await cekStatusHarian(user.email, user.password);
            if (status.success && !status.sudahAbsen) {
                belumAbsen.push(user.phone);
            } else if (!status.success) {
                belumAbsen.push(user.phone); // Asumsi belum
            }
        } catch (e) { console.error(e); }
    }

    if (belumAbsen.length > 0) {
        let msgAlert = `🚨 *PERINGATAN UPAH (AUTO)* 🚨\n\n`;
        msgAlert += `Halo teman-teman, sekarang sudah malam.\nNama-nama di bawah ini *BELUM ABSEN*:\n\n`;
        belumAbsen.forEach(num => msgAlert += `👉 @${num.split('@')[0]}\n`);
        msgAlert += `\n💡 _Segera isi laporan sebelum jam 23:59!_`;

        await sock.sendMessage(groupId, { 
            text: msgAlert, 
            mentions: belumAbsen 
        });
    } else {
        await sock.sendMessage(groupId, { text: `✅ *SEMUA AMAN!* Seluruh peserta sudah absen.` });
    }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('SesiWA')
  const { version } = await fetchLatestBaileysVersion()
  
  console.log(chalk.cyan(`🤖 Memulai Bot (v${version.join('.')}) + SCHEDULER`))

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: !usePairingCode,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    version,
    generateHighQualityLinkPreview: true,
  })

  if (usePairingCode && !sock.authState.creds.registered) {
    const phoneNumber = await question(chalk.green('Nomor WA (628xxx): '))
    const code = await sock.requestPairingCode(phoneNumber.trim())
    console.log(chalk.green(`Kode Pairing: `) + chalk.yellow.bold(code))
  }

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update
      if ( connection === "close") {
          const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
          if(shouldReconnect) connectToWhatsApp()
      } else if ( connection === "open") {
          console.log(chalk.green("✅ KONEKSI STABIL. Scheduler Aktif."))
          
          // --- SET JADWAL CRON ---
          // Format Cron: Menit Jam * * *
          
          // Jam 18:00 (6 Sore)
          cron.schedule('0 18 * * *', () => runAutoReminder(sock), { timezone: "Asia/Jakarta" });
          
          // Jam 20:00 (8 Malam)
          cron.schedule('0 20 * * *', () => runAutoReminder(sock), { timezone: "Asia/Jakarta" });

          // Jam 22:00 (10 Malam)
          cron.schedule('0 22 * * *', () => runAutoReminder(sock), { timezone: "Asia/Jakarta" });

          console.log(chalk.blue('📅 Jadwal Alarm: 18:00, 20:00, 22:00 WIB'));
      }
  })

  sock.ev.on("messages.upsert", async (m) => {
      const msg = m.messages[0]
      if (!msg.message) return
      
      // ABAIKAN STATUS
      if (msg.key.remoteJid === 'status@broadcast') return;

      const text = getMessageContent(msg);
      if (!text) return;

      const isMe = msg.key.fromMe;
      console.log(chalk.blue(`📩 ${isMe ? 'ME' : 'USER'}: ${text.substring(0,20)}...`));

      try {
        msg.bodyTeks = text; 
        require("./handler")(sock, msg)
      } catch (e) {
        console.error(chalk.bgRed(" HANDLER ERROR "), e)
      }
  })
}

connectToWhatsApp()