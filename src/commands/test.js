/**
 * Command: !test
 * System testing commands
 */
const fs = require('fs');
const path = require('path');
const { getUserByPhone } = require('../services/database');
const { cekStatusHarian, getRiwayat } = require('../services/magang');
const { processFreeTextToReport } = require('../services/aiService');
const { setDraft } = require('../services/previewService');
const { getMessage } = require('../services/messageService');

// Import utils
const { parseDraftFromMessage } = require('../utils/messageUtils');

module.exports = {
    name: 'test',
    description: 'System testing menu',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args } = context;

        const subCommand = args.split(' ')[0].toLowerCase();
        const content = args.substring(subCommand.length).trim();

        // 1. !TEST (Dashboard)
        if (!subCommand) {
            const menu = `*🛠️ SYSTEM TEST MENU (ALL FEATURES)*\n\n` +
                `1. *!test menu* - Cek tampilan menu utama\n` +
                `2. *!test daftar* - Coba generate link registrasi\n` +
                `3. *!test absen* - Simulasi flow absen (Tanpa parameter)\n` +
                `4. *!test absen [cerita]* - Simulasi absen dengan cerita AI\n` +
                `5. *!test absen manual #aktivitas...* - Simulasi absen manual full\n` +
                `6. *!test cek* - Cek status harian (Real)\n` +
                `7. *!test riwayat* - Cek riwayat (Real)\n\n` +
                `_Semua perintah !test aman: Transaksi 'submit' hanya simulasi._`;
            await sock.sendMessage(sender, { text: menu }, { quoted: msgObj });
            return;
        }

        // 2. !TEST MENU
        if (subCommand === 'menu') {
            const coverPath = path.join(__dirname, '../../public/img/cover.png');
            const info = `*[TEST MODE] MAIN MENU*\n\n` + getMessage('GENERAL_MENU');

            if (fs.existsSync(coverPath)) {
                await sock.sendMessage(sender, { image: { url: coverPath }, caption: info }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
            }
            return;
        }

        // 3. !TEST DAFTAR
        if (subCommand === 'daftar') {
            const { generateAuthUrl } = require('../services/secureAuth');
            await sock.sendMessage(sender, { text: "🔄 *[TEST]* Generating Registration Link..." }, { quoted: msgObj });
            const authUrl = await generateAuthUrl(senderNumber, async () => { });
            const response = getMessage('AUTH_REG_LINK_PRIVATE').replace('{url}', authUrl);
            await sock.sendMessage(sender, { text: `*[TEST MODE]*\n${response}` }, { quoted: msgObj });
            return;
        }

        // 4. !TEST ABSEN (No args)
        if (subCommand === 'absen' && !content) {
            const user = getUserByPhone(senderNumber);
            if (!user) return sock.sendMessage(sender, { text: getMessage('AUTH_NOT_REGISTERED') });

            await sock.sendMessage(sender, { text: `🔄 *[TEST]* Menjalankan flow '!absen' (tanpa cerita)...` }, { quoted: msgObj });
            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });
            await new Promise(r => setTimeout(r, 1000));
            await sock.sendMessage(sender, { text: getMessage('ABSEN_LOADING') }, { quoted: msgObj });
            await new Promise(r => setTimeout(r, 1500));
            await sock.sendMessage(sender, { text: "✅ *[TEST]* Data riwayat (pura-pura) diambil.\nBot menunggu cerita Anda... (Reply pesan ini untuk lanjut test)" }, { quoted: msgObj });
            return;
        }

        // 5. !TEST ABSEN [CERITA]
        if (subCommand === 'absen' && content && !content.startsWith('manual')) {
            const user = getUserByPhone(senderNumber);
            if (!user) return sock.sendMessage(sender, { text: getMessage('AUTH_NOT_REGISTERED') });

            await sock.sendMessage(sender, { text: "🔄 *[SIMULASI]* Memproses laporan dengan AI..." }, { quoted: msgObj });

            const aiResult = await processFreeTextToReport(content);
            if (!aiResult.success) {
                return sock.sendMessage(sender, { text: "Gagal memproses AI." });
            }

            const mockDraft = {
                aktivitas: aiResult.aktivitas,
                pembelajaran: aiResult.pembelajaran,
                kendala: aiResult.kendala,
                type: 'simulation'
            };
            setDraft(senderNumber, mockDraft);

            const draftMsg = `*🛠️ [SIMULASI] DRAF LAPORAN*\n\n` +
                `*Aktivitas:* (${aiResult.aktivitas.length} char)\n${aiResult.aktivitas}\n\n` +
                `*Pembelajaran:* (${aiResult.pembelajaran.length} char)\n${aiResult.pembelajaran}\n\n` +
                `*Kendala:* (${aiResult.kendala.length} char)\n${aiResult.kendala}\n\n` +
                `_Ketik *ya* untuk lanjut (Simulasi Submit)._`;

            await sock.sendMessage(sender, { text: draftMsg }, { quoted: msgObj });
            return;
        }

        // 6. !TEST MANUAL
        if (subCommand === 'manual' || (subCommand === 'absen' && content.startsWith('manual'))) {
            let rawText = content;
            if (subCommand === 'absen' && content.startsWith('manual')) {
                rawText = content.substring(6).trim();
            }

            const fakeMessage = "!absen " + (rawText || "#aktivitas test #pembelajaran test #kendala test");
            const parsed = parseDraftFromMessage(fakeMessage);

            if (!parsed || !parsed.aktivitas) {
                return sock.sendMessage(sender, { text: "❌ *[TEST]* Gagal parse format manual. Pastikan format: `!test manual #aktivitas isi #pembelajaran isi...`" });
            }

            const mockDraft = { ...parsed, type: 'simulation' };
            setDraft(senderNumber, mockDraft);

            const draftMsg = `*🛠️ [SIMULASI MANUAL] DRAF TERBACA*\n\n` +
                `*Aktivitas:* (${parsed.aktivitas.length})\n${parsed.aktivitas}\n\n` +
                `*Pembelajaran:* (${parsed.pembelajaran.length})\n${parsed.pembelajaran}\n\n` +
                `*Kendala:* (${parsed.kendala.length})\n${parsed.kendala}\n\n` +
                `_Ketik *ya* untuk lanjut (Simulasi Submit)._`;
            await sock.sendMessage(sender, { text: draftMsg }, { quoted: msgObj });
            return;
        }

        // 7. !TEST CEK
        if (subCommand === 'cek') {
            const user = getUserByPhone(senderNumber);
            if (!user) return sock.sendMessage(sender, { text: "Belum daftar." });
            await sock.sendMessage(sender, { text: "🔄 *[TEST]* Menjalankan !cek (Real Mode)..." });

            const status = await cekStatusHarian(user.email, user.password);
            await sock.sendMessage(sender, { text: `*[TEST RESULT]*\nJSON: ${JSON.stringify(status, null, 2)}` });
            return;
        }

        // 8. !TEST RIWAYAT
        if (subCommand === 'riwayat') {
            const user = getUserByPhone(senderNumber);
            if (!user) return sock.sendMessage(sender, { text: "Belum daftar." });
            await sock.sendMessage(sender, { text: "🔄 *[TEST]* Menjalankan !riwayat (Real Mode)..." });

            const result = await getRiwayat(user.email, user.password, 1);
            await sock.sendMessage(sender, { text: `*[TEST RESULT]*\nSuccess: ${result.success}\nLogs Found: ${result.logs?.length || 0}` });
            return;
        }
    }
};
