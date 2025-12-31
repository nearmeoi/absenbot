const { prosesLoginDanAbsen, cekKredensial, cekStatusHarian, getRiwayat } = require('../services/magang');
const { saveUser, getUserByPhone, updateUserLid, getAllUsers, deleteUser } = require('../services/database');
const { GROUP_ID_FILE } = require('../config/constants');
const { generateAuthUrl, initAuthServer } = require('../services/secureAuth');
const { generateAttendanceReport, processFreeTextToReport, transcribeAudio } = require('../services/groqService');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { TEMP_DIR } = require('../config/constants');

// ... (kode lainnya tetap sama)

module.exports = async (sock, msg) => {
    try {
        let msgObj = msg.messages ? msg.messages[0] : msg;
        if (!msgObj || !msgObj.message) return;

        // --- HANDLING VOICE NOTE / AUDIO (PRIVATE CHAT ONLY) ---
        const isAudio = msgObj.message.audioMessage || msgObj.message.pttMessage;
        const sender = msgObj.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");

        if (isAudio && !isGroup) {
            await sock.sendMessage(sender, { react: { text: "🎧", key: msgObj.key } });
            
            // Download audio
            const buffer = await downloadMediaMessage(msgObj, 'buffer', {});
            const fileName = path.join(TEMP_DIR, `audio_${Date.now()}.ogg`);
            fs.writeFileSync(fileName, buffer);

            // Transcribe
            const transcription = await transcribeAudio(fileName);
            
            // Hapus file audio (Cleanup)
            try { fs.unlinkSync(fileName); } catch (e) {}

            if (transcription.success && transcription.text.length > 5) {
                await sock.sendMessage(sender, { text: `_Saya mendengar:_ "${transcription.text}"\n\n_Sedang merapikan laporan Anda..._` });
                
                // Teruskan ke logika !absen (panggil ulang handler dengan teks hasil VN)
                msgObj.message = { conversation: `!absen ${transcription.text}` };
                return module.exports(sock, msgObj);
            } else {
                await sock.sendMessage(sender, { text: "Maaf, saya kurang jelas mendengar suara Anda. Bisa ulangi lagi?" });
                return;
            }
        }

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
            const coverPath = require('path').join(__dirname, '../../public/img/cover.png');

            const info = `*BOT MAGANGHUB v7.0 (AI Edition)*

Daftar Perintah:
1️⃣ *!daftar* - Sambungkan akun dulu (Wajib)
2️⃣ *!preview* - Minta dibuatin laporan otomatis
3️⃣ *!buatkan* - Kirim laporan otomatis ke web
4️⃣ *!absen* - Tulis laporan sendiri (Manual)
5️⃣ *!cek* - Cek laporan sudah masuk belum
6️⃣ *!riwayat* - Lihat laporan hari kemarin
7️⃣ *!ingatkan* - Tag teman yang belum lapor
8️⃣ *!hapus* - Hapus akun dari bot
🔔 *!broadcast* - Kirim info ke semua (Admin)

Bot ini membantu absensi harian MagangHub.`;

            if (fs.existsSync(coverPath)) {
                await sock.sendMessage(sender, { image: { url: coverPath }, caption: info }, { quoted: msgObj, ephemeralExpiration: 86400 });
            } else {
                await sock.sendMessage(sender, { text: info }, { quoted: msgObj, ephemeralExpiration: 86400 });
            }
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
                mentions.push(phone);
                userList += `${index + 1}. @${phone.split('@')[0]}\n`;
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
        // !ABSEN (Sistem Ketik Bebas / AI Power)
        // ----------------------------------------------------
        if (command === "!absen") {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: "Anda belum terdaftar. Ketik !daftar dulu ya." }, { quoted: msgObj });
                return;
            }

            // Jika cuma ketik !absen tanpa isi
            if (!args || args.trim().length < 5) {
                const guide = `*CARA LAPOR CEPAT*\n\nKetik *!absen* diikuti cerita singkat kegiatanmu hari ini.\n\nContoh:\n_!absen tadi saya bantu instalasi windows di lab dan belajar setting mikrotik._\n\nNanti saya yang rapikan laporannya otomatis!`;
                
                // Kirim ke PC agar tidak nyepam grup
                const targetJid = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;
                if (isGroup) await sock.sendMessage(sender, { text: "Instruksi sudah saya kirim ke Chat Pribadi ya." }, { quoted: msgObj, ephemeralExpiration: 86400 });
                await sock.sendMessage(targetJid, { text: guide }, { ephemeralExpiration: 86400 });
                return;
            }

            // React loading
            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });

            // 1. Cek status dulu agar tidak double
            const statusCheck = await cekStatusHarian(user.email, user.password);
            if (statusCheck.success && statusCheck.sudahAbsen) {
                await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
                await sock.sendMessage(sender, { text: "Anda sudah absen hari ini. Tidak perlu lapor lagi." }, { quoted: msgObj, ephemeralExpiration: 86400 });
                return;
            }

            // 2. Proses cerita user lewat AI
            const riwayatResult = await getRiwayat(user.email, user.password, 5);
            const aiResult = await processFreeTextToReport(args, riwayatResult.success ? riwayatResult.logs : []);

            if (!aiResult.success) {
                await sock.sendMessage(sender, { react: { text: "❌", key: msgObj.key } });
                await sock.sendMessage(sender, { text: "Gagal memproses cerita Anda. Coba lagi nanti." }, { quoted: msgObj });
                return;
            }

            // 3. Submit ke MagangHub
            prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas: aiResult.aktivitas,
                pembelajaran: aiResult.pembelajaran,
                kendala: aiResult.kendala
            }).then(async hasil => {
                if (hasil.success) {
                    await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
                    let reply = `✅ *LAPORAN SUKSES TERKIRIM*\n\n`;
                    reply += `*Hasil Olahan AI:*\n${aiResult.aktivitas}\n\n`;
                    reply += `_Laporan sudah rapi & masuk ke web Kemnaker._`;
                    
                    // Kirim ke target (PC jika dari grup)
                    const targetJid = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;
                    await sock.sendMessage(targetJid, { text: reply }, { ephemeralExpiration: 86400 });
                } else {
                    await sock.sendMessage(sender, { react: { text: "❌", key: msgObj.key } });
                    await sock.sendMessage(sender, { text: `Gagal mengirim: ${hasil.pesan}` }, { quoted: msgObj });
                }
            });
            return;
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

                // Tentukan target pengiriman (PC)
                const targetJid = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;

                if (isGroup) {
                    await sock.sendMessage(sender, { text: "📩 Riwayat absensi dikirim ke chat pribadi." }, { quoted: msgObj, ephemeralExpiration: 86400 });
                }
                
                await sock.sendMessage(targetJid, { text: historyText }, { ephemeralExpiration: 86400 });

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
            preview += `Ketik *!buatkan* untuk kirim.\nKetik *!preview* lagi untuk ganti laporan.\n\n`;
            preview += `✏️ *Mau Edit?* Copy teks di atas, ubah sesukamu, lalu kirim pakai format *!absen*.`;

            // Tentukan target pengiriman (PC)
            const targetJid = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;

            if (isGroup) {
                await sock.sendMessage(sender, { text: "📩 Draf laporan AI dikirim ke chat pribadi." }, { quoted: msgObj, ephemeralExpiration: 86400 });
            }

            await sock.sendMessage(targetJid, { text: preview }, { ephemeralExpiration: 86400 });
        }

    } catch (e) {
        console.error(chalk.red("[HANDLER] Error:"), e);
    }
};
