const {
    prosesLoginDanAbsen,
    cekKredensial,
    cekStatusHarian
} = require("./api_magang");
const {
    saveUser,
    getUserByPhone,
    updateUserLid,
    getAllUsers
} = require("./database");
const fs = require("fs");

module.exports = async (sock, msg) => {
    try {
        let msgObj = msg.messages ? msg.messages[0] : msg;
        if (!msgObj || !msgObj.message) return;

        const getMsgText = m => {
            if (!m) return "";
            return (
                m.conversation ||
                m.extendedTextMessage?.text ||
                m.imageMessage?.caption ||
                ""
            );
        };
        const textMessage = getMsgText(msgObj.message);

        // Abaikan pesan bot sendiri
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

        // LID Logic
        if (isGroup && senderNumber.includes("@lid")) {
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
                } catch (e) {}
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
        if (command === "!hai" || command === "!menu") {
            const info = `🤖 *BOT MAGANGHUB v5.0 (Alarm Upah)*

1️⃣ *!daftar email|pass* (PC Only)
2️⃣ *!absen* (Kirim Laporan)
3️⃣ *!cekabsen* (Cek Status Sendiri)
4️⃣ *!ingatkan* (Tag semua yang belum absen)`;
            await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
            return;
        }

        // ----------------------------------------------------
        // !INGATKAN / !TAGALL (ALARM UPAH)
        // ----------------------------------------------------
        if (command === "!ingatkan" || command === "!tagall") {
            if (!isGroup) {
                await sock.sendMessage(
                    sender,
                    { text: "❌ Perintah ini khusus untuk Grup." },
                    { quoted: msgObj }
                );
                return;
            }

            const allUsers = getAllUsers();
            if (allUsers.length === 0) {
                await sock.sendMessage(
                    sender,
                    { text: "⚠️ Belum ada yang daftar di bot ini." },
                    { quoted: msgObj }
                );
                return;
            }

            await sock.sendMessage(
                sender,
                {
                    text: `🔍 *Mengecek status ${allUsers.length} peserta...*\nMohon tunggu sebentar.`
                },
                { quoted: msgObj }
            );

            const belumAbsen = [];
            const sudahAbsenCount = 0;

            // Cek satu per satu secara paralel (biar cepat)
            // Hati-hati rate limit, tapi karena pakai Axios + Cookie harusnya aman
            for (const user of allUsers) {
                try {
                    // Gunakan mode Cek Cepat (Axios)
                    // Fungsi cekStatusHarian di api_magang.js sudah handle login otomatis
                    const status = await cekStatusHarian(
                        user.email,
                        user.password
                    );

                    if (status.success) {
                        if (!status.sudahAbsen) {
                            // Masukkan ke daftar hitam
                            belumAbsen.push(user.phone);
                        }
                    } else {
                        // Jika gagal login/error, anggap belum absen biar dicek manual
                        console.log(`Gagal cek ${user.email}: ${status.pesan}`);
                        belumAbsen.push(user.phone);
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            if (belumAbsen.length > 0) {
                let msgAlert = `🚨 *PENGINGAT SOBAT POLTEKPAR* 🚨\n`;
                msgAlert += `📅 Tanggal: ${new Date().toLocaleDateString()}\n\n`;
                msgAlert += `Peserta berikut *BELUM MENGISI LAPORAN*:\n`;

                // Buat list mention
                belumAbsen.forEach(num => {
                    msgAlert += `👉 @${num.split("@")[0]}\n`;
                });

                msgAlert += `\n💡 _Segera ketik *!absen* atau hilang sede uang!`;

                await sock.sendMessage(
                    sender,
                    {
                        text: msgAlert,
                        mentions: belumAbsen
                    },
                    { quoted: msgObj }
                );
            } else {
                await sock.sendMessage(
                    sender,
                    {
                        text: `✅ *AMAZING!*\nSemua peserta (${allUsers.length} orang) SUDAH ABSEN hari ini.\n\nLaporan aman, gaji lancar! 🎉`
                    },
                    { quoted: msgObj }
                );
            }
            return;
        }

        // ----------------------------------------------------
        // !DAFTAR
        // ----------------------------------------------------
        if (command === "!daftar") {
            if (args.includes("emailmu@gmail.com")) return;
            if (isGroup && !msgObj.key.fromMe) {
                await sock.sendMessage(
                    sender,
                    { text: `⚠️ Daftar lewat Chat Pribadi (PC) ya.` },
                    { quoted: msgObj }
                );
                return;
            }
            if (args.split("|").length < 2) {
                await sock.sendMessage(
                    sender,
                    { text: "❌ Format: *!daftar email|pass*" },
                    { quoted: msgObj }
                );
                return;
            }
            const [email, password] = args.split("|").map(s => s.trim());
            await sock.sendMessage(
                sender,
                { text: "⏳ Verifikasi akun..." },
                { quoted: msgObj }
            );
            const cekLogin = await cekKredensial(email, password);
            if (cekLogin.success) {
                saveUser(senderNumber, email, password);

                let caption = `✅ *BERHASIL DAFTAR!*\nAkun: ${email}`;
                if (cekLogin.foto && fs.existsSync(cekLogin.foto)) {
                    await sock.sendMessage(
                        sender,
                        { image: { url: cekLogin.foto }, caption: caption },
                        { quoted: msgObj }
                    );
                    try {
                        fs.unlinkSync(cekLogin.foto);
                    } catch (e) {}
                } else {
                    await sock.sendMessage(
                        sender,
                        { text: caption },
                        { quoted: msgObj }
                    );
                }
            } else {
                let errMsg = `❌ *Gagal:* ${cekLogin.pesan}`;
                if (cekLogin.foto && fs.existsSync(cekLogin.foto)) {
                    await sock.sendMessage(
                        sender,
                        { image: { url: cekLogin.foto }, caption: errMsg },
                        { quoted: msgObj }
                    );
                    try {
                        fs.unlinkSync(cekLogin.foto);
                    } catch (e) {}
                } else {
                    await sock.sendMessage(
                        sender,
                        { text: errMsg },
                        { quoted: msgObj }
                    );
                }
            }
            return;
        }

        // ----------------------------------------------------
        // !ABSEN
        // ----------------------------------------------------
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
                        sock.sendMessage(
                            sender,
                            {
                                image: { url: hasil.foto },
                                caption: reply,
                                mentions: [senderNumber]
                            },
                            { quoted: msgObj }
                        );
                        try {
                            fs.unlinkSync(hasil.foto);
                        } catch (e) {}
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

        // ----------------------------------------------------
        // !CEKABSEN
        // ----------------------------------------------------
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

            await sock.sendMessage(
                sender,
                { text: `⏳ Cek Data di Server...` },
                { quoted: msgObj }
            );

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
