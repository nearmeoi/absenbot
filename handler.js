const { prosesLoginDanAbsen, cekKredensial, cekStatusHarian } = require('./api_magang'); 
const { saveUser, getUserByPhone, updateUserLid } = require('./database'); 
const fs = require('fs');

module.exports = async (sock, msg) => {
    try {
        let msgObj = msg.messages ? msg.messages[0] : msg;
        if (!msgObj || !msgObj.message) return;
        if (msgObj.key.fromMe) return; 

        // Helper text
        const getMsgText = (m) => {
            if (!m) return "";
            return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || "";
        };
        const textMessage = getMsgText(msgObj.message);
        
        const HEADER_LAPORAN = "[LAPORAN MAGANGHUB]";
        const isCommand = textMessage.trim().startsWith('!');
        const isLaporanContent = textMessage.includes(HEADER_LAPORAN);

        if (!isCommand && !isLaporanContent) return; 

        const sender = msgObj.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        let senderNumber = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;

        // LID Logic
        if (isGroup && senderNumber.includes('@lid')) {
            const userByLid = getUserByPhone(senderNumber); 
            if (userByLid) senderNumber = userByLid.phone;
            else {
                try {
                    const metadata = await sock.groupMetadata(sender);
                    const userAsli = metadata.participants.find(p => p.id === senderNumber);
                    if (userAsli && userAsli.phoneNumber) {
                        updateUserLid(userAsli.phoneNumber, senderNumber);
                        senderNumber = userAsli.phoneNumber;
                    }
                } catch (e) {}
            }
        }

        if (senderNumber && senderNumber.includes(':')) senderNumber = senderNumber.split(':')[0] + '@s.whatsapp.net';
        else if (senderNumber && !senderNumber.includes('@')) senderNumber = senderNumber + '@s.whatsapp.net';

        const command = textMessage.trim().split(/\s+/)[0].toLowerCase();
        const args = textMessage.trim().substring(command.length).trim();

        // ----------------------------------------------------
        // !HAI / MENU
        // ----------------------------------------------------
        if (command === '!hai' || command === '!menu' || command === '!help') {
            const info = `🤖 *BOT MAGANGHUB v1.1*
Halo sobat POLTEKPAR! 🌈

🔹 *!daftar email|pass*
(Wajib di Chat Pribadi)

🔹 *!absen*
(Kirim Laporan Harian)

🔹 *!cekabsen*
(Cek apakah hari ini sudah absen?)

🔹 *!cek*
(Cek status pendaftaran)`;
            await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
            return;
        }

        // ----------------------------------------------------
        // !CEKABSEN (FITUR BARU)
        // ----------------------------------------------------
        if (command === '!cekabsen') {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: '⚠️ Kamu belum terdaftar. Ketik *!daftar email|pass* di PC dulu.' }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { text: `⏳ Mengecek data di server MagangHub...` }, { quoted: msgObj });

            const status = await cekStatusHarian(user.email, user.password);

            if (status.success) {
                if (status.sudahAbsen) {
                    const log = status.data;
                    let reply = `✅ *SUDAH ABSEN HARI INI*\n\n`;
                    reply += `📅 Tanggal: ${log.date}\n`;
                    reply += `📝 Aktivitas: ${log.activity_log.substring(0, 50)}...\n`;
                    reply += `Status: TERKIRIM ke Server`;
                    await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
                } else {
                    await sock.sendMessage(sender, { text: `❌ *BELUM ABSEN HARI INI*\n\nSilakan ketik *!absen* untuk mengisi laporan.` }, { quoted: msgObj });
                }
            } else {
                await sock.sendMessage(sender, { text: `⚠️ Gagal cek status: ${status.pesan}` }, { quoted: msgObj });
            }
            return;
        }

        // ----------------------------------------------------
        // !DAFTAR
        // ----------------------------------------------------
        if (command === '!daftar') {
            if (args.includes('emailmu@gmail.com')) return; 
            if (isGroup) {
                await sock.sendMessage(sender, { text: `⚠️ *BAHAYA!* Chat Pribadi (PC) saya untuk daftar.` }, { quoted: msgObj });
                return;
            }
            if (args.split('|').length < 2) {
                await sock.sendMessage(sender, { text: '❌ Format salah! Gunakan: *!daftar email|pass*' }, { quoted: msgObj });
                return;
            }

            const [email, password] = args.split('|').map(s => s.trim());
            await sock.sendMessage(sender, { text: '⏳ Verifikasi akun...' }, { quoted: msgObj });

            const cekLogin = await cekKredensial(email, password);
            if (cekLogin.success) {
                saveUser(senderNumber, email, password);
                await sock.sendMessage(sender, { text: `✅ *BERHASIL DAFTAR!*\nAkun: ${email}` }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { text: `❌ *GAGAL:*\n${cekLogin.pesan}` }, { quoted: msgObj });
            }
            return;
        }

        // ----------------------------------------------------
        // !ABSEN
        // ----------------------------------------------------
        if (command === '!absen' || isLaporanContent) {
            
            // A. KASIH TEMPLATE
            if (!textMessage.includes('Aktivitas:')) {
                const template = `!absen ${HEADER_LAPORAN}
(Salin, Isi, dan Kirim Balik)

Aktivitas: 

Pembelajaran: 

Kendala: 

_(Tips: Isi minimal 100 karakter per kolom)_`;
                await sock.sendMessage(sender, { text: template }, { quoted: msgObj });
                return;
            }

            // B. PROSES
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: `⚠️ Kamu belum terdaftar.` }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { text: `⏳ Memproses laporan milik @${senderNumber.split('@')[0]}...`, mentions: [senderNumber] }, { quoted: msgObj });

            const aktMatch = textMessage.match(/Aktivitas:\s*([\s\S]*?)(?=Pembelajaran:|$)/i);
            const pembMatch = textMessage.match(/Pembelajaran:\s*([\s\S]*?)(?=Kendala:|$)/i);
            const kenMatch = textMessage.match(/Kendala:\s*([\s\S]*)/i);

            const aktivitas = aktMatch ? aktMatch[1].trim() : "";
            const pembelajaran = pembMatch ? pembMatch[1].trim() : "";
            let kendala = kenMatch ? kenMatch[1].trim() : "Tidak ada kendala";
            if (kendala.includes('_(Tips:')) kendala = kendala.split('_(Tips:')[0].trim();

            if (aktivitas.length < 100 || pembelajaran.length < 100 || kendala.length < 100) {
                await sock.sendMessage(sender, { text: `⚠️ *Laporan Ditolak*\nSemua kolom wajib minimal 100 karakter.` }, { quoted: msgObj });
                return;
            }

            const hasil = await prosesLoginDanAbsen({
                email: user.email, password: user.password, aktivitas, pembelajaran, kendala
            });

            if (hasil.success) {
                let reply = `✅ *SUKSES ABSEN*\n👤 Nama: @${senderNumber.split('@')[0]}\n📅 Tanggal: ${new Date().toLocaleDateString()}\n${hasil.pesan_tambahan}`;
                await sock.sendMessage(sender, { text: reply, mentions: [senderNumber] }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { text: `❌ *Gagal:* ${hasil.pesan}` }, { quoted: msgObj });
            }
        }

        // !CEK (Status Lokal)
        if (command === '!cek') {
            const user = getUserByPhone(senderNumber);
            if (user) {
                const masked = user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3");
                await sock.sendMessage(sender, { text: `👤 *TERDAFTAR*\nEmail: ${masked}\n✅ Siap Absen.` }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { text: '❌ Belum terdaftar.' }, { quoted: msgObj });
            }
        }

    } catch (e) {
        console.error("Handler Error:", e);
    }
};