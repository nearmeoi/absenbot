const { prosesLoginDanAbsen, cekKredensial, cekStatusHarian } = require('../services/magang');
const { saveUser, getUserByPhone, updateUserLid, getAllUsers } = require('../services/database');
const { GROUP_ID_FILE } = require('../config/constants');
const { generateAuthUrl, initAuthServer } = require('../services/secureAuth');
const fs = require('fs');

module.exports = async (sock, msg) => {
    try {
        let msgObj = msg.messages ? msg.messages[0] : msg;
        if (!msgObj || !msgObj.message) return;

        const getMsgText = (m) => {
            if (!m) return "";
            return (
                m.conversation ||
                m.extendedTextMessage?.text ||
                m.imageMessage?.caption ||
                ""
            );
        };
        const textMessage = getMsgText(msgObj.message);

        // Abaikan pesan bot sendiri (Kecuali command !ingatkan dari scheduler nanti)
        if (msgObj.key.fromMe && !textMessage.startsWith("!")) return;

        const HEADER_LAPORAN = "[LAPORAN MAGANGHUB]";
        const isCommand = textMessage.trim().startsWith("!");
        const isLaporanContent = textMessage.includes(HEADER_LAPORAN);

        if (!isCommand && !isLaporanContent) return;

        const sender = msgObj.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");
        let senderNumber = isGroup
            ? msgObj.key.participant || msgObj.participant
            : sender;

        if (isGroup && senderNumber.includes('@lid')) {
            const userByLid = getUserByPhone(senderNumber);
            if (userByLid) senderNumber = userByLid.phone;
            else {
                try {
                    const metadata = await sock.groupMetadata(sender);
                    const userAsli = metadata.participants.find(
                        p => p.id === senderNumber
                    );
                    if (userAsli && userAsli.phoneNumber) {
                        updateUserLid(userAsli.phoneNumber, senderNumber);
                        senderNumber = userAsli.phoneNumber;
                    }
                } catch (e) { }
            }
        }

        if (senderNumber && senderNumber.includes(":"))
            senderNumber = senderNumber.split(":")[0] + "@s.whatsapp.net";
        else if (senderNumber && !senderNumber.includes("@"))
            senderNumber = senderNumber + "@s.whatsapp.net";

        const command = textMessage.trim().split(/\s+/)[0].toLowerCase();
        const args = textMessage.trim().substring(command.length).trim();

        // ----------------------------------------------------
        // !HAI
        // ----------------------------------------------------
        if (command === '!hai' || command === '!menu') {
            const info = `🤖 *BOT MAGANGHUB v6.0 (Auto-Schedule)*
1️⃣ *!daftar email|pass* (PC Only)
2️⃣ *!absen* (Kirim Laporan)
3️⃣ *!cekabsen* (Cek Status Sendiri)
4️⃣ *!ingatkan* (Tag yang belum absen)

Adapun tujuan dibuat bot ini agar terhindar dari musibah lupa absen, dan juga untuk memudahkan absen melalui WA, terutama yang sudah siapkan di wa tapi suka lupa buka web monev.)`;
            await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
            return;
        }

        // ----------------------------------------------------
        // !SETGROUP (SETUP LOKASI ALARM OTOMATIS)
        // ----------------------------------------------------
        if (command === "!setgroup") {
            if (!isGroup) {
                await sock.sendMessage(
                    sender,
                    { text: "❌ Perintah ini harus di dalam Grup." },
                    { quoted: msgObj }
                );
                return;
            }

            // Simpan ID Grup ke file
            fs.writeFileSync(GROUP_ID_FILE, sender);
            await sock.sendMessage(
                sender,
                {
                    text: `✅ *GRUP TERSIMPAN!* \n\nAlarm Otomatis (Jam 18, 20, 22) akan dikirim ke grup ini.`
                },
                { quoted: msgObj }
            );
            return;
        }

        // ----------------------------------------------------
        // !INGATKAN (MANUAL / AUTO)
        // ----------------------------------------------------
        if (command === "!ingatkan") {
            if (!isGroup) {
                await sock.sendMessage(
                    sender,
                    { text: "❌ Khusus Grup." },
                    { quoted: msgObj }
                );
                return;
            }

            const allUsers = getAllUsers();
            if (allUsers.length === 0) {
                await sock.sendMessage(
                    sender,
                    { text: "⚠️ Belum ada user terdaftar." },
                    { quoted: msgObj }
                );
                return;
            }

            await sock.sendMessage(
                sender,
                { text: `🔍 *Mengecek status ${allUsers.length} peserta...*` },
                { quoted: msgObj }
            );

            let belumAbsen = [];

            for (const user of allUsers) {
                try {
                    const status = await cekStatusHarian(
                        user.email,
                        user.password
                    );
                    if (status.success && !status.sudahAbsen) {
                        belumAbsen.push(user.phone);
                    } else if (!status.success) {
                        belumAbsen.push(user.phone); // Yg error juga ditag
                    }
                } catch (e) { }
            }

            if (belumAbsen.length > 0) {
                let msgAlert = `🚨 *PERINGATAN UPAH* 🚨\n📅 ${new Date().toLocaleDateString()}\n\nPeserta belum absen:\n`;
                belumAbsen.forEach(
                    num => (msgAlert += `👉 @${num.split("@")[0]}\n`)
                );
                msgAlert += `\n💡 _Segera ketik *!absen*!_`;

                await sock.sendMessage(sender, { text: msgAlert, mentions: belumAbsen });
            } else {
                await sock.sendMessage(
                    sender,
                    { text: `✅ *AANJAUYY!* Semua sudah absen hari ini.` },
                    { quoted: msgObj }
                );
            }
            return;
        }

        if (command === '!daftar') {
            if (args.includes('emailmu@gmail.com')) return;
            if (isGroup && !msgObj.key.fromMe) {
                await sock.sendMessage(
                    sender,
                    { text: `⚠️ Daftar lewat Chat Pribadi (PC) ya.` },
                    { quoted: msgObj }
                );
                return;
            }

            // Check if user is already registered
            const existingUser = getUserByPhone(senderNumber);
            if (existingUser) {
                await sock.sendMessage(
                    sender,
                    {
                        text: "⚠️ Kamu sudah terdaftar sebelumnya. Gunakan !absen untuk absen atau !cek untuk cek status."
                    },
                    { quoted: msgObj }
                );
                return;
            }

            // Generate secure authentication URL
            const authUrl = generateAuthUrl(senderNumber, async (result) => {
                if (result.success) {
                    await sock.sendMessage(
                        sender,
                        {
                            text: `✅ *BERHASIL DAFTAR!*\n\nKamu sudah berhasil terdaftar dan bisa langsung menggunakan bot.\n\nGunakan *!absen* untuk mengirim laporan.`
                        }
                    );
                } else {
                    await sock.sendMessage(
                        sender,
                        {
                            text: `❌ *Gagal Mendaftar:*\n${result.message || 'Terjadi kesalahan saat registrasi'}`
                        }
                    );
                }
            });

            await sock.sendMessage(
                sender,
                {
                    text: `🔐 *REGISTRASI AMAN*\n\nUntuk mendaftar, silakan buka link berikut di browser:\n\n${authUrl}\n\n🔒 *Keamanan:* Email dan passwordmu tidak akan dikirim melalui WhatsApp.\n\n*Catatan:* Link hanya berlaku 10 menit.`
                },
                { quoted: msgObj }
            );
            return;
        }

        if (command === "!absen" || isLaporanContent) {
            if (!textMessage.includes("Aktivitas:")) {
                const template = `!absen ${HEADER_LAPORAN}
(Salin, Isi, dan Kirim Balik)

Aktivitas: 

Pembelajaran: 

Kendala: 

_(Tips: Isi minimal 100 karakter per kolom)_`;
                await sock.sendMessage(
                    sender,
                    { text: template },
                    { quoted: msgObj }
                );
                return;
            }

            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(
                    sender,
                    { text: `⚠️ Kamu belum terdaftar.` },
                    { quoted: msgObj }
                );
                return;
            }

            const aktMatch = textMessage.match(
                /Aktivitas:\s*([\s\S]*?)(?=Pembelajaran:|$)/i
            );
            const pembMatch = textMessage.match(
                /Pembelajaran:\s*([\s\S]*?)(?=Kendala:|$)/i
            );
            const kenMatch = textMessage.match(/Kendala:\s*([\s\S]*)/i);

            const aktivitas = aktMatch ? aktMatch[1].trim() : "";
            const pembelajaran = pembMatch ? pembMatch[1].trim() : "";
            let kendala = kenMatch ? kenMatch[1].trim() : "Tidak ada kendala";
            if (kendala.includes("_(Tips:"))
                kendala = kendala.split("_(Tips:")[0].trim();

            if (
                aktivitas.length < 100 ||
                pembelajaran.length < 100 ||
                kendala.length < 100
            ) {
                await sock.sendMessage(
                    sender,
                    {
                        text: `⚠️ *Laporan Ditolak* (Milik @${
                            senderNumber.split("@")[0]
                        })\nSemua kolom wajib min 100 karakter.`,
                        mentions: [senderNumber]
                    },
                    { quoted: msgObj }
                );
                return;
            }

            await sock.sendMessage(
                sender,
                {
                    text: `🚀 Memproses laporan @${
                        senderNumber.split("@")[0]
                    }...`,
                    mentions: [senderNumber]
                },
                { quoted: msgObj }
            );

            prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas,
                pembelajaran,
                kendala
            }).then(hasil => {
                if (hasil.success) {
                    let reply = `✅ *SUKSES ABSEN* ${
                        hasil.pesan_tambahan
                    }\n👤 Nama: @${
                        senderNumber.split("@")[0]
                    }\n📅 Tanggal: ${new Date().toLocaleDateString()}`;
                    if (hasil.foto && fs.existsSync(hasil.foto)) {
                        sock.sendMessage(sender, { image: { url: hasil.foto }, caption: reply, mentions: [senderNumber] }, { quoted: msgObj });
                        try { fs.unlinkSync(hasil.foto); } catch (e) { }
                    } else {
                        sock.sendMessage(
                            sender,
                            { text: reply, mentions: [senderNumber] },
                            { quoted: msgObj }
                        );
                    }
                } else {
                    sock.sendMessage(
                        sender,
                        { text: `❌ *Gagal Absen:* ${hasil.pesan}` },
                        { quoted: msgObj }
                    );
                }
            });
        }

        if (command === "!cekabsen" || command === "!cek") {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(
                    sender,
                    { text: "❌ Belum terdaftar." },
                    { quoted: msgObj }
                );
                return;
            }

            await sock.sendMessage(sender, { text: `⏳ Cek Data di Server...` }, { quoted: msgObj });

            const status = await cekStatusHarian(user.email, user.password);

            if (status.success) {
                if (status.sudahAbsen) {
                    const log = status.data;
                    let reply = `✅ *SUDAH ABSEN HARI INI*\n📅 ${
                        log.date
                    }\n📝 ${log.activity_log.substring(0, 50)}...`;
                    sock.sendMessage(
                        sender,
                        { text: reply },
                        { quoted: msgObj }
                    );
                } else {
                    sock.sendMessage(
                        sender,
                        { text: `❌ *BELUM ABSEN HARI INI*` },
                        { quoted: msgObj }
                    );
                }
            } else {
                sock.sendMessage(
                    sender,
                    { text: `⚠️ Error: ${status.pesan}` },
                    { quoted: msgObj }
                );
            }
        }
    } catch (e) {
        console.error("Handler Error:", e);
    }
};
