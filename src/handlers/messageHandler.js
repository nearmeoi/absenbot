const { prosesLoginDanAbsen, cekKredensial, cekStatusHarian, getRiwayat } = require('../services/magang');
const { saveUser, getUserByPhone, updateUserLid, getAllUsers, deleteUser } = require('../services/database');
const { GROUP_ID_FILE } = require('../config/constants');
const { generateAuthUrl, initAuthServer } = require('../services/secureAuth');
const { generateAttendanceReport } = require('../services/groqService');
const fs = require('fs');
const chalk = require('chalk');

// Cache untuk menyimpan preview sementara (per user)
const pendingPreviews = new Map();

// Admin numbers yang bisa broadcast
const ADMIN_NUMBERS = ['6285657025300', '6289517153324'];

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

        // Helper: Normalisasi nomor ke format standar
        const normalizeToStandard = (phone) => {
            if (!phone) return '';
            // Ambil angka saja (hapus @lid, @s.whatsapp.net, :device, dll)
            let digits = phone.split('@')[0].split(':')[0].replace(/\D/g, '');
            return digits + '@s.whatsapp.net';
        };

        // Handle LID (Linked ID) di grup
        if (isGroup && senderNumber && senderNumber.includes('@lid')) {
            const userByLid = getUserByPhone(senderNumber);
            if (userByLid) {
                senderNumber = userByLid.phone;
            } else {
                try {
                    const metadata = await sock.groupMetadata(sender);
                    const userAsli = metadata.participants.find(
                        p => p.id === senderNumber
                    );
                    if (userAsli && userAsli.phoneNumber) {
                        updateUserLid(userAsli.phoneNumber, senderNumber);
                        senderNumber = userAsli.phoneNumber;
                    }
                } catch (e) {
                    console.error(chalk.red('[HANDLER] Error getting group metadata:'), e.message);
                }
            }
        }

        // Normalisasi final: pastikan format standar 628xxx@s.whatsapp.net
        senderNumber = normalizeToStandard(senderNumber);

        const command = textMessage.trim().split(/\s+/)[0].toLowerCase();
        const args = textMessage.trim().substring(command.length).trim();

        // ----------------------------------------------------
        // !HAI / !MENU
        // ----------------------------------------------------
        if (command === '!hai' || command === '!menu') {
            const info = `*BOT MAGANGHUB v7.0 (AI Edition)*

Daftar Perintah:
1. !daftar - Sambungkan akun dulu (Wajib)
2. !preview - Minta dibuatin laporan otomatis
3. !buatkan - Kirim laporan otomatis ke web
4. !absen - Tulis laporan sendiri (Manual)
5. !cek - Cek laporan sudah masuk belum
6. !riwayat - Lihat laporan hari kemarin
7. !ingatkan - Tag teman yang belum lapor
8. !listuser - Lihat daftar peserta
9. !hapus - Hapus akun dari bot
!broadcast - Kirim info ke semua (Admin)

Bot ini membantu absensi harian MagangHub.`;

            await sock.sendMessage(sender, { text: info }, { quoted: msgObj, ephemeralExpiration: 86400 });
            return;
        }

        // ----------------------------------------------------
        // !SETGROUP (SETUP LOKASI ALARM OTOMATIS)
        // ----------------------------------------------------
        if (command === "!setgroup") {
            if (!isGroup) {
                await sock.sendMessage(
                    sender,
                    { text: "Perintah ini harus dijalankan di dalam grup." },
                    { quoted: msgObj }
                );
                return;
            }

            fs.writeFileSync(GROUP_ID_FILE, sender);
            await sock.sendMessage(
                sender,
                {
                    text: `Grup berhasil disimpan.\n\nAlarm otomatis (Jam 18:00, 20:00, 22:00 WIB) akan dikirim ke grup ini.`
                },
                { quoted: msgObj }
            );
            return;
        }

        // ----------------------------------------------------
        // !LISTUSER (LIHAT DAFTAR USER TERDAFTAR)
        // ----------------------------------------------------
        if (command === "!listuser") {
            const allUsers = getAllUsers();
            if (allUsers.length === 0) {
                await sock.sendMessage(
                    sender,
                    { text: "Belum ada user terdaftar." },
                    { quoted: msgObj }
                );
                return;
            }

            // Extract name from email (before @)
            const getName = (email) => {
                const namePart = email.split('@')[0];
                return namePart
                    .replace(/[._]/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
            };

            let userList = `*Daftar User Terdaftar (${allUsers.length})*\n\n`;
            const mentions = [];

            allUsers.forEach((user, index) => {
                const phone = user.phone;
                const name = getName(user.email);
                mentions.push(phone);
                userList += `${index + 1}. @${phone.split('@')[0]} - ${name}\n`;
            });

            await sock.sendMessage(sender, { text: userList, mentions }, { quoted: msgObj });
            return;
        }



        // ----------------------------------------------------
        // !HAPUS (HAPUS AKUN DARI SISTEM)
        // ----------------------------------------------------
        if (command === "!hapus") {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(
                    sender,
                    { text: "Akun tidak ditemukan. Anda belum terdaftar." },
                    { quoted: msgObj }
                );
                return;
            }

            const deleted = deleteUser(senderNumber);
            if (deleted) {
                await sock.sendMessage(
                    sender,
                    { text: "Akun berhasil dihapus dari sistem." },
                    { quoted: msgObj }
                );
            } else {
                await sock.sendMessage(
                    sender,
                    { text: "Gagal menghapus akun. Silakan coba lagi." },
                    { quoted: msgObj }
                );
            }
            return;
        }

        // ----------------------------------------------------
        // !INGATKAN (MANUAL / AUTO)
        // ----------------------------------------------------
        if (command === "!ingatkan") {
            if (!isGroup) {
                await sock.sendMessage(
                    sender,
                    { text: "Perintah ini hanya bisa digunakan di dalam grup." },
                    { quoted: msgObj }
                );
                return;
            }

            const allUsers = getAllUsers();
            if (allUsers.length === 0) {
                await sock.sendMessage(
                    sender,
                    { text: "Belum ada user terdaftar." },
                    { quoted: msgObj }
                );
                return;
            }

            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });

            let belumAbsen = [];
            let checked = 0;

            for (const user of allUsers) {
                try {
                    checked++;
                    const status = await cekStatusHarian(user.email, user.password);
                    if (status.success && !status.sudahAbsen) {
                        belumAbsen.push(user.phone);
                    } else if (!status.success) {
                        belumAbsen.push(user.phone);
                    }
                } catch (e) { }
            }

            if (belumAbsen.length > 0) {
                let msgAlert = `*PENGINGAT ABSENSI*\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\nPeserta yang belum absen:\n`;
                belumAbsen.forEach(
                    num => (msgAlert += `- @${num.split("@")[0]}\n`)
                );
                msgAlert += `\nSegera lengkapi laporan harian Anda.`;

                await sock.sendMessage(sender, { text: msgAlert, mentions: belumAbsen }, { ephemeralExpiration: 86400 });
            } else {
                await sock.sendMessage(
                    sender,
                    { text: `Semua peserta sudah menyelesaikan absensi hari ini.` },
                    { quoted: msgObj, ephemeralExpiration: 86400 }
                );
            }
            return;
        }

        // ----------------------------------------------------
        // !DAFTAR
        // ----------------------------------------------------
        if (command === '!daftar') {
            if (args.includes('emailmu@gmail.com')) return;

            // Get the original participant ID (before normalization) for sending private message
            const originalSenderId = isGroup
                ? (msgObj.key.participant || msgObj.participant)
                : sender;

            const existingUser = getUserByPhone(senderNumber);
            if (existingUser) {
                await sock.sendMessage(
                    sender,
                    {
                        text: "Anda sudah terdaftar. Gunakan !absen untuk mengirim laporan atau !cek untuk melihat status."
                    },
                    { quoted: msgObj, ephemeralExpiration: 86400 }
                );
                return;
            }

            // Generate auth URL with the original sender ID (could be LID or phone)
            const authUrl = await generateAuthUrl(originalSenderId, async (result) => {
                if (result.success) {
                    // Send confirmation to private chat
                    await sock.sendMessage(
                        originalSenderId,
                        {
                            text: "*REGISTRASI BERHASIL*\n\nAkun Anda telah terdaftar. Gunakan perintah !absen untuk mengirim laporan harian."
                        }
                    );
                } else {
                    await sock.sendMessage(
                        originalSenderId,
                        {
                            text: `*REGISTRASI GAGAL*\n${result.message || 'Terjadi kesalahan saat registrasi.'}`
                        }
                    );
                }
            });

            if (isGroup) {
                // Notify in group
                await sock.sendMessage(
                    sender,
                    { text: "Link pendaftaran sudah saya kirim ke Chat Pribadi (Japri) ya." },
                    { quoted: msgObj, ephemeralExpiration: 86400 }
                );
                // Send link to private chat
                await sock.sendMessage(
                    originalSenderId,
                    {
                        text: `*PENDADAFTARAN AKUN*\n\nKlik link di bawah ini untuk menghubungkan akun MagangHub kamu:\n\n${authUrl}\n\n(Link ini aman dan hanya berlaku 10 menit)`
                    }
                );
            } else {
                // Direct reply in private chat
                await sock.sendMessage(
                    sender,
                    {
                        text: `*PENDAFTARAN AKUN*\n\nKlik link di bawah ini untuk menghubungkan akun MagangHub kamu:\n\n${authUrl}\n\n(Link ini aman dan hanya berlaku 10 menit)`
                    },
                    { quoted: msgObj }
                );
            }
            return;
        }

        // ----------------------------------------------------
        // !ABSEN
        // ----------------------------------------------------
        if (command === "!absen" || isLaporanContent) {
            if (!textMessage.includes("Aktivitas:")) {
                const template = `!absen ${HEADER_LAPORAN}
(Salin, isi, dan kirim kembali di sini)

Aktivitas: 

Pembelajaran: 

Kendala: 

Catatan: Minimal 100 karakter per kolom.`;

                if (isGroup) {
                    // Jika di grup, arahkan ke PC
                    await sock.sendMessage(
                        sender,
                        { text: "Template laporan telah dikirim ke chat pribadi Anda. Silakan isi di sana agar tidak memenuhi grup." },
                        { quoted: msgObj, ephemeralExpiration: 86400 }
                    );
                    
                    // Kirim template ke PC
                    await sock.sendMessage(
                        senderNumber,
                        { text: template },
                        { ephemeralExpiration: 86400 }
                    );
                } else {
                    // Jika sudah di PC, langsung kirim template
                    await sock.sendMessage(
                        sender,
                        { text: template },
                        { quoted: msgObj, ephemeralExpiration: 86400 }
                    );
                }
                return;
            }

            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(
                    sender,
                    { text: `Anda belum terdaftar. Gunakan !daftar terlebih dahulu.` },
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
            if (kendala.includes("Catatan:"))
                kendala = kendala.split("Catatan:")[0].trim();

            if (
                aktivitas.length < 100 ||
                pembelajaran.length < 100 ||
                kendala.length < 100
            ) {
                await sock.sendMessage(
                    sender,
                    {
                        text: `*Laporan Ditolak*\nSemua kolom wajib diisi minimal 100 karakter.\n\nPengirim: @${senderNumber.split("@")[0]}`,
                        mentions: [senderNumber]
                    },
                    { quoted: msgObj }
                );
                return;
            }

            // React dengan jam pasir saat memproses
            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });

            prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas,
                pembelajaran,
                kendala
            }).then(async hasil => {
                if (hasil.success) {
                    // React sukses
                    await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
                    let reply = `*ABSENSI BERHASIL* ${hasil.pesan_tambahan || ''}\nNama: @${senderNumber.split("@")[0]}\nTanggal: ${new Date().toLocaleDateString('id-ID')}`;
                    if (hasil.foto && fs.existsSync(hasil.foto)) {
                        sock.sendMessage(sender, { image: { url: hasil.foto }, caption: reply, mentions: [senderNumber] }, { quoted: msgObj, ephemeralExpiration: 86400 });
                        try { fs.unlinkSync(hasil.foto); } catch (e) { }
                    } else {
                        sock.sendMessage(
                            sender,
                            { text: reply, mentions: [senderNumber] },
                            { quoted: msgObj, ephemeralExpiration: 86400 }
                        );
                    }
                } else {
                    // React gagal
                    await sock.sendMessage(sender, { react: { text: "❌", key: msgObj.key } });
                    sock.sendMessage(
                        sender,
                        { text: `*ABSENSI GAGAL*\n${hasil.pesan}` },
                        { quoted: msgObj, ephemeralExpiration: 86400 }
                    );
                }
            });
        }

        // ----------------------------------------------------
        // !CEKABSEN / !CEK
        // ----------------------------------------------------
        if (command === "!cekabsen" || command === "!cek") {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(
                    sender,
                    { text: "Anda belum terdaftar." },
                    { quoted: msgObj }
                );
                return;
            }

            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });
            const status = await cekStatusHarian(user.email, user.password);

            if (status.success) {
                await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
                if (status.sudahAbsen) {
                    const log = status.data;
                    let reply = `*STATUS: SUDAH ABSEN*\nTanggal: ${log.date}\nAktivitas: ${log.activity_log.substring(0, 50)}...`;
                    sock.sendMessage(
                        sender,
                        { text: reply },
                        { quoted: msgObj, ephemeralExpiration: 86400 }
                    );
                } else {
                    sock.sendMessage(
                        sender,
                        { text: `*STATUS: BELUM ABSEN*\nAnda belum mengirim laporan hari ini.` },
                        { quoted: msgObj, ephemeralExpiration: 86400 }
                    );
                }
            } else {
                await sock.sendMessage(sender, { react: { text: "❌", key: msgObj.key } });
                sock.sendMessage(
                    sender,
                    { text: `Terjadi kesalahan: ${status.pesan}` },
                    { quoted: msgObj, ephemeralExpiration: 86400 }
                );
            }
        }

        // ----------------------------------------------------
        // !RIWAYAT (CEK HISTORY)
        // ----------------------------------------------------
        if (command === "!riwayat") {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: "Anda belum terdaftar." }, { quoted: msgObj });
                return;
            }

            // Parse jumlah hari dari argumen (default: 1 = kemarin)
            let days = 1;
            if (args && !isNaN(parseInt(args))) {
                days = Math.min(Math.max(parseInt(args), 1), 30); // Min 1, Max 30 hari
            }

            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });

            const result = await getRiwayat(user.email, user.password, days);

            if (result.success && result.logs.length > 0) {
                await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });

                let historyText = `*RIWAYAT ABSENSI*\n(${days} hari terakhir)\n`;

                result.logs.forEach(log => {
                    const dateObj = new Date(log.date);
                    const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
                    const dateFormatted = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

                    historyText += `\n━━━━━━━━━━━━━━━━━━\n`;
                    historyText += `*${dayName}, ${dateFormatted}*\n`;

                    if (log.missing || !log.activity_log) {
                        historyText += `(Tidak ada data absen)\n`;
                    } else {
                        // Debug: log semua field yang ada
                        console.log('[RIWAYAT] Fields available:', Object.keys(log));

                        // Aktivitas
                        historyText += `\n*Aktivitas:*\n${log.activity_log || '-'}\n`;

                        // Pembelajaran (field: lesson_learned)
                        const pembelajaran = log.lesson_learned || log.learning || log.lesson || '';
                        if (pembelajaran) {
                            historyText += `\n*Pembelajaran:*\n${pembelajaran}\n`;
                        }

                        // Kendala (field: obstacles)
                        const kendala = log.obstacles || log.obstacle || '';
                        if (kendala) {
                            historyText += `\n*Kendala:*\n${kendala}\n`;
                        }
                    }
                });

                historyText += `\n━━━━━━━━━━━━━━━━━━\nGunakan !riwayat [jumlah] untuk melihat lebih banyak hari.`;

                await sock.sendMessage(sender, { text: historyText }, { quoted: msgObj, ephemeralExpiration: 86400 });
            } else {
                await sock.sendMessage(sender, { react: { text: "❌", key: msgObj.key } });
                await sock.sendMessage(sender, { text: `Gagal mengambil riwayat: ${result.pesan || 'Tidak ada data'}` }, { quoted: msgObj, ephemeralExpiration: 86400 });
            }
        }

        // ----------------------------------------------------
        // !BROADCAST (ADMIN ONLY)
        // ----------------------------------------------------
        if (command === '!broadcast') {
            // Cek apakah admin
            const senderBase = senderNumber.replace(/@.*/, '').replace(/:.*/, '');
            const isAdmin = ADMIN_NUMBERS.some(num => senderBase.includes(num) || num.includes(senderBase));

            if (!isAdmin) {
                await sock.sendMessage(sender, { text: "Command ini hanya untuk admin." }, { quoted: msgObj });
                return;
            }

            if (!args || args.trim() === '') {
                await sock.sendMessage(sender, { text: "Format: !broadcast [pesan]" }, { quoted: msgObj });
                return;
            }

            const allUsers = getAllUsers();
            if (allUsers.length === 0) {
                await sock.sendMessage(sender, { text: "Tidak ada user terdaftar." }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { react: { text: "📢", key: msgObj.key } });

            let sent = 0;
            for (const user of allUsers) {
                try {
                    await sock.sendMessage(user.phone, { text: args });
                    sent++;
                    await new Promise(r => setTimeout(r, 500)); // delay anti-spam
                } catch (e) {
                    console.error(`[BROADCAST] Gagal kirim ke ${user.phone}:`, e.message);
                }
            }

            await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
            await sock.sendMessage(sender, { text: `Broadcast terkirim ke ${sent}/${allUsers.length} user.` }, { quoted: msgObj });
        }

        // ----------------------------------------------------
        // !BUATKAN (SUBMIT DARI PREVIEW)
        // ----------------------------------------------------
        if (command === '!buatkan') {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: "Anda belum terdaftar." }, { quoted: msgObj });
                return;
            }

            // Cek apakah ada preview yang tersimpan
            const cachedPreview = pendingPreviews.get(senderNumber);
            if (!cachedPreview) {
                await sock.sendMessage(sender, {
                    text: "Belum ada preview tersimpan.\nGunakan *!preview* dulu untuk lihat hasil generate AI."
                }, { quoted: msgObj });
                return;
            }

            // Cek apakah sudah absen hari ini
            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });
            const statusCheck = await cekStatusHarian(user.email, user.password);

            if (statusCheck.success && statusCheck.sudahAbsen) {
                await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
                await sock.sendMessage(sender, { text: "Anda sudah absen hari ini." }, { quoted: msgObj });
                pendingPreviews.delete(senderNumber);
                return;
            }

            // Submit dari cache
            await sock.sendMessage(sender, { react: { text: "📤", key: msgObj.key } });
            const submitResult = await prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas: cachedPreview.aktivitas,
                pembelajaran: cachedPreview.pembelajaran,
                kendala: cachedPreview.kendala
            });

            // Hapus cache setelah submit
            pendingPreviews.delete(senderNumber);

            if (submitResult.success) {
                await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
                let reply = `*LAPORAN SUDAH TERKIRIM*\n\n`;
                reply += `*Isi Laporan:* \n${cachedPreview.aktivitas}\n\n`;
                reply += `Laporan sudah masuk ke web Kemnaker.`;
                await sock.sendMessage(sender, { text: reply }, { quoted: msgObj, ephemeralExpiration: 86400 });
            } else {
                await sock.sendMessage(sender, { react: { text: "❌", key: msgObj.key } });
                await sock.sendMessage(sender, { text: `Gagal submit: ${submitResult.pesan}` }, { quoted: msgObj, ephemeralExpiration: 86400 });
            }
        }

        // ----------------------------------------------------
        // !PREVIEW (AI GENERATE & SIMPAN SEMENTARA)
        // ----------------------------------------------------
        if (command === '!preview') {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: "Anda belum terdaftar." }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });

            // Ambil riwayat untuk konteks (30 hari)
            const riwayatResult = await getRiwayat(user.email, user.password, 30);
            const previousLogs = riwayatResult.success ? riwayatResult.logs : [];

            // Generate dengan AI
            const aiResult = await generateAttendanceReport(previousLogs);

            if (!aiResult.success) {
                await sock.sendMessage(sender, { react: { text: "❌", key: msgObj.key } });
                await sock.sendMessage(sender, { text: `Gagal generate: ${aiResult.error}` }, { quoted: msgObj });
                return;
            }

            // Simpan ke cache
            pendingPreviews.set(senderNumber, {
                aktivitas: aiResult.aktivitas,
                pembelajaran: aiResult.pembelajaran,
                kendala: aiResult.kendala,
                timestamp: Date.now()
            });

            await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
            let preview = `*DRAF LAPORAN AI*\n(Belum terkirim, baca dulu ya)\n\n`;
            preview += `----------------------------------\n`;
            preview += `*Aktivitas:*\n${aiResult.aktivitas}\n\n`;
            preview += `*Pembelajaran:*\n${aiResult.pembelajaran}\n\n`;
            preview += `*Kendala:*\n${aiResult.kendala}\n`;
            preview += `----------------------------------\n\n`;
            preview += `Ketik *!buatkan* untuk kirim.\nKetik *!preview* lagi untuk ganti laporan.`;

            await sock.sendMessage(sender, { text: preview }, { quoted: msgObj, ephemeralExpiration: 86400 });
        }

    } catch (e) {
        console.error(chalk.red("[HANDLER] Error:"), e);
    }
};
