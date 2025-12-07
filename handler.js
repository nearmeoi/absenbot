const { prosesLoginDanAbsen, cekKredensial, cekStatusHarian } = require('./api_magang'); 
const { saveUser, getUserByPhone, updateUserLid } = require('./database'); 
const fs = require('fs');

module.exports = async (sock, msg) => {
    try {
        let msgObj = msg.messages ? msg.messages[0] : msg;
        if (!msgObj || !msgObj.message) return;
        
        const getMsgText = (m) => {
            if (!m) return "";
            return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || "";
        };
        const textMessage = getMsgText(msgObj.message);

        if (msgObj.key.fromMe && !textMessage.startsWith('!')) return;

        const HEADER_LAPORAN = "[LAPORAN MAGANGHUB]";
        const isCommand = textMessage.trim().startsWith('!');
        const isLaporanContent = textMessage.includes(HEADER_LAPORAN);

        if (!isCommand && !isLaporanContent) return; 

        const sender = msgObj.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        let senderNumber = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;

        // LID Logic (Sama seperti sebelumnya)
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

        // !HAI
        if (command === '!hai' || command === '!menu') {
            await sock.sendMessage(sender, { text: `🤖 *BOT MAGANGHUB v4.0 (Visual)*\n\n1️⃣ !daftar email|pass\n2️⃣ !absen (Kirim Laporan)` }, { quoted: msgObj });
            return;
        }

        // !DAFTAR (DENGAN BUKTI FOTO)
        if (command === '!daftar') {
            if (args.includes('emailmu@gmail.com')) return; 
            if (isGroup && !msgObj.key.fromMe) {
                await sock.sendMessage(sender, { text: `⚠️ Daftar lewat Chat Pribadi (PC) ya.` }, { quoted: msgObj });
                return;
            }
            if (args.split('|').length < 2) {
                await sock.sendMessage(sender, { text: '❌ Format: *!daftar email|pass*' }, { quoted: msgObj });
                return;
            }
            const [email, password] = args.split('|').map(s => s.trim());
            
            await sock.sendMessage(sender, { text: '⏳ Verifikasi akun (Bot sedang login)...' }, { quoted: msgObj });
            
            const cekLogin = await cekKredensial(email, password);
            
            if (cekLogin.success) {
                saveUser(senderNumber, email, password);
                
                // [FITUR BARU] KIRIM BUKTI FOTO DASHBOARD
                let caption = `✅ *BERHASIL LOGIN!*\nAkun: ${email}\nData tersimpan aman.`;
                
                if (cekLogin.foto && fs.existsSync(cekLogin.foto)) {
                    await sock.sendMessage(sender, { 
                        image: { url: cekLogin.foto }, 
                        caption: caption 
                    }, { quoted: msgObj });
                    try { fs.unlinkSync(cekLogin.foto); } catch(e){}
                } else {
                    await sock.sendMessage(sender, { text: caption }, { quoted: msgObj });
                }
            } else {
                await sock.sendMessage(sender, { text: `❌ *Gagal:* ${cekLogin.pesan}` }, { quoted: msgObj });
            }
            return;
        }

        // !ABSEN
        if (command === '!absen' || isLaporanContent) {
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

            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: `⚠️ Kamu belum terdaftar.` }, { quoted: msgObj });
                return;
            }

            const aktMatch = textMessage.match(/Aktivitas:\s*([\s\S]*?)(?=Pembelajaran:|$)/i);
            const pembMatch = textMessage.match(/Pembelajaran:\s*([\s\S]*?)(?=Kendala:|$)/i);
            const kenMatch = textMessage.match(/Kendala:\s*([\s\S]*)/i);

            const aktivitas = aktMatch ? aktMatch[1].trim() : "";
            const pembelajaran = pembMatch ? pembMatch[1].trim() : "";
            let kendala = kenMatch ? kenMatch[1].trim() : "Tidak ada kendala";
            if (kendala.includes('_(Tips:')) kendala = kendala.split('_(Tips:')[0].trim();

            if (aktivitas.length < 100 || pembelajaran.length < 100 || kendala.length < 100) {
                await sock.sendMessage(sender, { text: `⚠️ *Laporan Ditolak* (Milik @${senderNumber.split('@')[0]})\nSemua kolom wajib min 100 karakter.`, mentions: [senderNumber] }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { text: `🚀 Memproses laporan @${senderNumber.split('@')[0]}...`, mentions: [senderNumber] }, { quoted: msgObj });

            // Jalankan
            prosesLoginDanAbsen({
                email: user.email, password: user.password, aktivitas, pembelajaran, kendala
            }).then(hasil => {
                if (hasil.success) {
                    let reply = `✅ *SUKSES ABSEN* ${hasil.pesan_tambahan}\n👤 Nama: @${senderNumber.split('@')[0]}\n📅 Tanggal: ${new Date().toLocaleDateString()}`;
                    sock.sendMessage(sender, { text: reply, mentions: [senderNumber] }, { quoted: msgObj });
                } else {
                    sock.sendMessage(sender, { text: `❌ *Gagal Absen:* ${hasil.pesan}` }, { quoted: msgObj });
                }
            });
        }

        // !CEKABSEN
        if (command === '!cekabsen' || command === '!cek') {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: '❌ Belum terdaftar.' }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { text: `⏳ Cek Data di Server...` }, { quoted: msgObj });
            
            const status = await cekStatusHarian(user.email, user.password);

            if (status.success) {
                if (status.sudahAbsen) {
                    const log = status.data;
                    let reply = `✅ *SUDAH ABSEN HARI INI*\n📅 ${log.date}\n📝 ${log.activity_log.substring(0, 50)}...`;
                    sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
                } else {
                    sock.sendMessage(sender, { text: `❌ *BELUM ABSEN HARI INI*` }, { quoted: msgObj });
                }
            } else {
                sock.sendMessage(sender, { text: `⚠️ Error: ${status.pesan}` }, { quoted: msgObj });
            }
        }

    } catch (e) {
        console.error("Handler Error:", e);
    }
};