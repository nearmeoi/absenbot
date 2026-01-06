const { prosesLoginDanAbsen, cekKredensial, cekStatusHarian, getRiwayat } = require('../services/magang');
const { saveUser, getUserByPhone, updateUserLid, getAllUsers, deleteUser } = require('../services/database');
const { GROUP_ID_FILE, ADMIN_NUMBERS } = require('../config/constants');
const { generateAuthUrl, initAuthServer } = require('../services/secureAuth');
const { generateAttendanceReport, processFreeTextToReport, transcribeAudio } = require('../services/groqService');
const { setDraft, getDraft, deleteDraft } = require('../services/previewService');
const { addHoliday, removeHoliday, isHoliday, getAllHolidays, addAllowedGroup, removeAllowedGroup, getAllowedGroups } = require('../config/holidays');
const { loadGroupSettings } = require('../services/groupSettings');
const { getBotStatus } = require('../routes/dashboardRoutes');
const { getMessage } = require('../services/messageService');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

module.exports = async (sock, msg) => {
    try {
        let msgObj = msg.messages ? msg.messages[0] : msg;
        if (!msgObj || !msgObj.message) return;

        // --- BOT STATUS CHECK ---
        const botStatus = getBotStatus();
        const sender = msgObj.key.remoteJid;

        // If bot is OFFLINE, ignore ALL messages completely
        if (botStatus === 'offline') {
            return;
        }

        // --- HANDLING VOICE NOTE / AUDIO (PRIVATE CHAT ONLY) ---
        const isAudio = msgObj.message.audioMessage || msgObj.message.pttMessage;
        const isGroup = sender.endsWith("@g.us");

        if (isAudio && !isGroup) {
            // Voice note feature temporarily disabled
            await sock.sendMessage(sender, {
                text: getMessage('voicenote_disabled')
            }, { quoted: msgObj });
            return;
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
        const isDraftContent = textMessage.includes("*DRAF LAPORAN ANDA*");
        const isConfirmation = textMessage.toLowerCase().trim() === 'ya';

        if (!isCommand && !isLaporanContent && !isDraftContent && !isConfirmation) return;

        // If bot is MAINTENANCE, respond with maintenance message
        if (botStatus === 'maintenance') {
            await sock.sendMessage(sender, {
                text: getMessage('maintenance_message')
            }, { quoted: msgObj });
            return;
        }

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
            const info = getMessage('menu');

            if (fs.existsSync(coverPath)) {
                await sock.sendMessage(sender, { image: { url: coverPath }, caption: info }, { quoted: msgObj });
            } else {
                await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
            }
            return;
        }

        if (command === '!help') {
            const helpText = getMessage('help');
            await sock.sendMessage(sender, { text: helpText }, { quoted: msgObj });
            return;
        }

        // ----------------------------------------------------
        // !SETGROUP (SETUP LOKASI ALARM OTOMATIS)
        // ----------------------------------------------------
        if (command === "!setgroup") {
            if (!isGroup) {
                await sock.sendMessage(
                    sender,
                    { text: getMessage('setgroup_not_group') },
                    { quoted: msgObj }
                );
                return;
            }

            fs.writeFileSync(GROUP_ID_FILE, sender);
            await sock.sendMessage(
                sender,
                {
                    text: getMessage('setgroup_success')
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
                    { text: getMessage('listuser_empty') },
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
                    { text: getMessage('hapus_not_found') },
                    { quoted: msgObj }
                );
                return;
            }

            const deleted = deleteUser(senderNumber);
            if (deleted) {
                await sock.sendMessage(
                    sender,
                    { text: getMessage('hapus_success') },
                    { quoted: msgObj }
                );
            } else {
                await sock.sendMessage(
                    sender,
                    { text: getMessage('hapus_failed') },
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
                let msgAlert = getMessage('siapa_header') + `\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
                belumAbsen.forEach(
                    num => (msgAlert += `- @${num.split("@")[0]}\n`)
                );
                msgAlert += `\nSegera lengkapi laporan harian Anda.`;

                await sock.sendMessage(sender, { text: msgAlert, mentions: belumAbsen }, { ephemeralExpiration: 86400 });
            } else {
                await sock.sendMessage(
                    sender,
                    { text: getMessage('siapa_all_done') },
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
                        text: getMessage('already_registered')
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
                            text: getMessage('registration_success')
                        }
                    );
                } else {
                    await sock.sendMessage(
                        originalSenderId,
                        {
                            text: getMessage('registration_failed').replace('{error}', result.message || 'Terjadi kesalahan saat registrasi.')
                        }
                    );
                }
            });

            if (isGroup) {
                // Notify in group
                await sock.sendMessage(
                    sender,
                    { text: getMessage('registration_link_group') },
                    { quoted: msgObj, ephemeralExpiration: 86400 }
                );
                // Send link to private chat
                await sock.sendMessage(
                    originalSenderId,
                    {
                        text: getMessage('registration_link_private').replace('{url}', authUrl)
                    }
                );
            } else {
                // Direct reply in private chat
                await sock.sendMessage(
                    sender,
                    {
                        text: getMessage('registration_link_private').replace('{url}', authUrl)
                    },
                    { quoted: msgObj }
                );
            }
            return;
        }

        // --- DEVELOPER COMMANDS (Hidden from !help) ---
        if (command === '!dev') {
            // Security: Only allow admin numbers
            // senderNumber is normalized to 628xxx@s.whatsapp.net, ADMIN_NUMBERS is just digits
            const senderDigits = senderNumber.split('@')[0];
            if (!ADMIN_NUMBERS.includes(senderDigits)) {
                // Silent fail - don't reveal the command exists
                return;
            }

            const args = textMessage.replace('!dev', '').trim();
            const [subCmd, ...params] = args.split(' ');

            // !dev showid - Get current chat ID (silent to group)
            if (subCmd === 'showid') {
                const chatId = sender;
                const isGroup = sender.endsWith('@g.us');
                const message = `*DEV: CHAT ID*\n\n` +
                    `Chat Type: ${isGroup ? 'Group' : 'Private'}\n` +
                    `ID: \`${chatId}\`\n\n` +
                    `${isGroup ? 'Kirim ke grup: `!dev grup add ' + chatId + '`' : ''}`;

                // Always DM to admin
                await sock.sendMessage(senderNumber, { text: message });
                return;
            }

            // !dev libur [tanggal] - Set holiday
            if (subCmd === 'libur') {
                const dateStr = params[0] || new Date().toISOString().split('T')[0];
                const added = addHoliday(dateStr);
                const reply = added
                    ? `✅ Tanggal ${dateStr} ditandai sebagai libur.`
                    : `⚠️ Tanggal ${dateStr} sudah ada di daftar libur.`;
                await sock.sendMessage(senderNumber, { text: reply });
                return;
            }

            // !dev hapus-libur [tanggal] - Remove holiday
            if (subCmd === 'hapus-libur') {
                const dateStr = params[0] || new Date().toISOString().split('T')[0];
                const removed = removeHoliday(dateStr);
                const reply = removed
                    ? `✅ Tanggal ${dateStr} dihapus dari daftar libur.`
                    : `⚠️ Tanggal ${dateStr} tidak ada di daftar libur.`;
                await sock.sendMessage(senderNumber, { text: reply });
                return;
            }

            // !dev status - Show system status
            if (subCmd === 'status') {
                const holidays = getAllHolidays();
                const groups = getAllowedGroups();
                const today = new Date().toISOString().split('T')[0];
                const todayIsHoliday = isHoliday();

                const statusMsg = `*DEV: SYSTEM STATUS*\n\n` +
                    `Hari ini: ${today}\n` +
                    `Status: ${todayIsHoliday ? '🔴 LIBUR' : '🟢 KERJA'}\n\n` +
                    `📅 Custom Holidays (${holidays.length}):\n${holidays.length > 0 ? holidays.map(d => `  • ${d}`).join('\n') : '  (kosong)'}\n\n` +
                    `👥 Allowed Groups (${groups.length}):\n${groups.length > 0 ? groups.map(g => `  • ${g}`).join('\n') : '  (kosong)'}`;

                await sock.sendMessage(senderNumber, { text: statusMsg });
                return;
            }

            // !dev grup add/remove [id] - Manage allowed groups
            if (subCmd === 'grup') {
                const action = params[0]; // 'add' or 'remove'
                const groupId = params[1];

                if (!action || !groupId) {
                    await sock.sendMessage(senderNumber, {
                        text: `⚠️ Format: !dev grup [add/remove] [groupId]`
                    });
                    return;
                }

                if (action === 'add') {
                    const added = addAllowedGroup(groupId);
                    const reply = added
                        ? `✅ Grup ${groupId} ditambahkan ke whitelist.`
                        : `⚠️ Grup ${groupId} sudah ada di whitelist.`;
                    await sock.sendMessage(senderNumber, { text: reply });
                } else if (action === 'remove') {
                    const removed = removeAllowedGroup(groupId);
                    const reply = removed
                        ? `✅ Grup ${groupId} dihapus dari whitelist.`
                        : `⚠️ Grup ${groupId} tidak ada di whitelist.`;
                    await sock.sendMessage(senderNumber, { text: reply });
                } else {
                    await sock.sendMessage(senderNumber, {
                        text: `⚠️ Action tidak valid. Gunakan 'add' atau 'remove'.`
                    });
                }
                return;
            }

            // Unknown subcommand
            await sock.sendMessage(senderNumber, {
                text: `*DEV COMMANDS*\n\n` +
                    `!dev showid - Get chat ID\n` +
                    `!dev libur [date] - Set holiday\n` +
                    `!dev hapus-libur [date] - Remove holiday\n` +
                    `!dev status - System status\n` +
                    `!dev grup add/remove [id] - Manage groups`
            });
            return;
        }

        // --- CORE LOGIC: !ABSEN ---
        if (command === '!absen') {
            // Check if today is a global holiday
            if (isHoliday()) {
                await sock.sendMessage(sender, {
                    text: getMessage('holiday_message')
                }, { quoted: msgObj });
                return;
            }

            // Check if this GROUP is on holiday today (per-group settings)
            if (isGroup) {
                const groupSettings = loadGroupSettings();
                const groupConfig = groupSettings[sender];
                if (groupConfig) {
                    // Check group-specific holidays
                    const today = new Date().toISOString().split('T')[0];
                    if (groupConfig.holidays && groupConfig.holidays.includes(today)) {
                        await sock.sendMessage(sender, {
                            text: getMessage('holiday_message')
                        }, { quoted: msgObj });
                        return;
                    }
                    // Check weekend skip
                    const dayOfWeek = new Date().getDay();
                    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                    if (isWeekend && groupConfig.skipWeekends !== false) {
                        await sock.sendMessage(sender, {
                            text: getMessage('holiday_message')
                        }, { quoted: msgObj });
                        return;
                    }
                }
            }

            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: getMessage('not_registered') }, { quoted: msgObj });
                return;
            }

            if (!args || args.trim() === '') {
                // Zero-input mode: Auto-generate from history
                await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });
                await sock.sendMessage(sender, { text: getMessage('absen_loading') }, { quoted: msgObj });

                const history = await getRiwayat(user.email, user.password, 3);
                const aiResult = await generateAttendanceReport(history.success ? history.logs : []);

                if (!aiResult.success) {
                    await sock.sendMessage(sender, {
                        text: getMessage('absen_failed_auto')
                    }, { quoted: msgObj });
                    return;
                }

                const reportData = {
                    aktivitas: aiResult.aktivitas,
                    pembelajaran: aiResult.pembelajaran,
                    kendala: aiResult.kendala,
                    type: 'ai'
                };

                setDraft(senderNumber, reportData);

                const previewText = `*DRAF LAPORAN OTOMATIS* 🤖\n\n` +
                    `*Aktivitas:* (${reportData.aktivitas.length} karakter)\n${reportData.aktivitas}\n\n` +
                    `*Pembelajaran:* (${reportData.pembelajaran.length} karakter)\n${reportData.pembelajaran}\n\n` +
                    `*Kendala:* (${reportData.kendala.length} karakter)\n${reportData.kendala}\n\n` +
                    `Ketik *ya* untuk kirim, atau ceritakan aktivitas Anda untuk laporan baru:\n` +
                    `_Contoh: !absen belajar database_`;

                await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });

            let reportData = { aktivitas: '', pembelajaran: '', kendala: '', type: '' };

            if (args.includes('#aktivitas') || args.includes('#pembelajaran')) {
                const parseTag = (tag) => {
                    const regex = new RegExp(`#${tag}\\s*([\\s\\S]*?)(?=#|$)`, 'i');
                    const match = args.match(regex);
                    return match ? match[1].trim() : '';
                };

                reportData = {
                    aktivitas: parseTag('aktivitas'),
                    pembelajaran: parseTag('pembelajaran'),
                    kendala: parseTag('kendala') || "Tidak ada kendala.",
                    type: 'manual'
                };

                // For manual tag input (!absen #aktivitas #pembelajaran), validate minimum 100 characters
                const errors = [];
                const MIN_CHARS = 100;
                const MAX_CHARS = 10000; // Very high maximum to effectively remove limit

                if (reportData.aktivitas.length < MIN_CHARS) {
                    errors.push(`Aktivitas: ${reportData.aktivitas.length} karakter (minimal ${MIN_CHARS})`);
                }
                if (reportData.pembelajaran.length < MIN_CHARS) {
                    errors.push(`Pembelajaran: ${reportData.pembelajaran.length} karakter (minimal ${MIN_CHARS})`);
                }
                if (reportData.kendala.length < MIN_CHARS && reportData.kendala !== "Tidak ada kendala.") {
                    errors.push(`Kendala: ${reportData.kendala.length} karakter (minimal ${MIN_CHARS})`);
                }

                if (errors.length > 0) {
                    const errorMsg = getMessage('absen_too_short').replace('{errors}', errors.join('\n'));
                    await sock.sendMessage(sender, { text: errorMsg }, { quoted: msgObj });
                    return;
                }
            } else {
                const history = await getRiwayat(user.email, user.password, 3);
                const aiResult = await processFreeTextToReport(args, history.success ? history.logs : []);

                if (!aiResult.success) {
                    await sock.sendMessage(sender, { text: getMessage('absen_failed_ai').replace('{error}', aiResult.error) }, { quoted: msgObj });
                    return;
                }

                reportData = {
                    aktivitas: aiResult.aktivitas,
                    pembelajaran: aiResult.pembelajaran,
                    kendala: aiResult.kendala,
                    type: 'ai'
                };
            }

            setDraft(senderNumber, reportData);

            const previewText = getMessage('draft_preview')
                .replace('{aktivitas_len}', reportData.aktivitas.length)
                .replace('{aktivitas}', reportData.aktivitas)
                .replace('{pembelajaran_len}', reportData.pembelajaran.length)
                .replace('{pembelajaran}', reportData.pembelajaran)
                .replace('{kendala_len}', reportData.kendala.length)
                .replace('{kendala}', reportData.kendala);

            await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
            return;
        }

        // --- CORE LOGIC: YA (CONFIRMATION) ---
        if (textMessage.toLowerCase().trim() === 'ya') {
            const cachedDraft = getDraft(senderNumber);
            if (!cachedDraft) return;

            const user = getUserByPhone(senderNumber);
            if (!user) return;

            await sock.sendMessage(sender, { react: { text: "🚀", key: msgObj.key } });

            const loginResult = await prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas: cachedDraft.aktivitas,
                pembelajaran: cachedDraft.pembelajaran,
                kendala: cachedDraft.kendala
            });

            if (loginResult.success) {
                await sock.sendMessage(sender, { text: getMessage('submit_success') }, { quoted: msgObj });
                deleteDraft(senderNumber);
            } else {
                await sock.sendMessage(sender, { text: getMessage('submit_failed').replace('{error}', loginResult.pesan) }, { quoted: msgObj });
            }
            return;
        }

        // --- CORE LOGIC: EDIT BY COPY-PASTE ---
        const pendingDraft = getDraft(senderNumber);
        if (pendingDraft && !isCommand) { // If there is a draft and message is not a command
            const parsedEdit = parseDraftFromMessage(textMessage);

            // OPTION 1: USER COPIED & EDITED THE DRAFT MANUALLY (FORMATTED)
            if (parsedEdit) {
                const MIN_CHARS = 100; // Minimum 100 characters for manual edits
                const MAX_CHARS = 10000; // Very high maximum to effectively remove limit
                const errors = [];

                if (parsedEdit.aktivitas.length < MIN_CHARS) errors.push(`Aktivitas kurang (${parsedEdit.aktivitas.length}/${MIN_CHARS})`);
                if (parsedEdit.aktivitas.length > MAX_CHARS) errors.push(`Aktivitas lebih (${parsedEdit.aktivitas.length}/${MAX_CHARS})`);

                if (parsedEdit.pembelajaran.length < MIN_CHARS) errors.push(`Pembelajaran kurang (${parsedEdit.pembelajaran.length}/${MIN_CHARS})`);
                if (parsedEdit.pembelajaran.length > MAX_CHARS) errors.push(`Pembelajaran lebih (${parsedEdit.pembelajaran.length}/${MAX_CHARS})`);

                if (parsedEdit.kendala !== 'Tidak ada kendala.') {
                    if (parsedEdit.kendala.length < MIN_CHARS) errors.push(`Kendala kurang (${parsedEdit.kendala.length}/${MIN_CHARS})`);
                    if (parsedEdit.kendala.length > MAX_CHARS) errors.push(`Kendala lebih (${parsedEdit.kendala.length}/${MAX_CHARS})`);
                }

                if (errors.length > 0) {
                    await sock.sendMessage(sender, { text: getMessage('draft_format_error').replace('{errors}', errors.join('\n')) }, { quoted: msgObj });
                    return;
                }

                setDraft(senderNumber, parsedEdit);

                const previewText = getMessage('draft_updated')
                    .replace('{aktivitas_len}', parsedEdit.aktivitas.length)
                    .replace('{aktivitas}', parsedEdit.aktivitas)
                    .replace('{pembelajaran_len}', parsedEdit.pembelajaran.length)
                    .replace('{pembelajaran}', parsedEdit.pembelajaran)
                    .replace('{kendala_len}', parsedEdit.kendala.length)
                    .replace('{kendala}', parsedEdit.kendala);

                await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                return;
            }
            // OPTION 2: USER SENT FREE TEXT REVISION (AUTO UPDATE WITH AI)
            else {
                await sock.sendMessage(sender, { react: { text: "✍️", key: msgObj.key } });
                await sock.sendMessage(sender, { text: getMessage('draft_update_loading') }, { quoted: msgObj });

                const user = getUserByPhone(senderNumber);
                const history = await getRiwayat(user.email, user.password, 3);

                // Combine previous context (draft type) + new text
                const revisionContext = pendingDraft.type === 'ai' ? 'Revisi dari draft AI sebelumnya: ' : 'Revisi manual: ';
                const aiResult = await processFreeTextToReport(revisionContext + textMessage, history.success ? history.logs : []);

                if (!aiResult.success) {
                    await sock.sendMessage(sender, { text: getMessage('draft_update_failed') }, { quoted: msgObj });
                    return;
                }

                const reportData = {
                    aktivitas: aiResult.aktivitas,
                    pembelajaran: aiResult.pembelajaran,
                    kendala: aiResult.kendala,
                    type: 'ai'
                };

                setDraft(senderNumber, reportData);

                const previewText = getMessage('draft_updated')
                    .replace('{aktivitas_len}', reportData.aktivitas.length)
                    .replace('{aktivitas}', reportData.aktivitas)
                    .replace('{pembelajaran_len}', reportData.pembelajaran.length)
                    .replace('{pembelajaran}', reportData.pembelajaran)
                    .replace('{kendala_len}', reportData.kendala.length)
                    .replace('{kendala}', reportData.kendala);

                await sock.sendMessage(sender, { text: previewText }, { quoted: msgObj });
                return;
            }
        }

        // --- CORE LOGIC: !CEK ---
        if (command === "!cek") {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: "Anda belum terdaftar." }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });
            const status = await cekStatusHarian(user.email, user.password);

            if (status.success) {
                await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
                if (status.sudahAbsen) {
                    const log = status.data;
                    let reply = getMessage('cek_sudah_absen')
                        .replace('{date}', log.date)
                        .replace('{activity}', log.activity_log.substring(0, 100));
                    await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });
                } else {
                    await sock.sendMessage(sender, { text: getMessage('cek_belum_absen') }, { quoted: msgObj });
                }
            } else {
                await sock.sendMessage(sender, { react: { text: "❌", key: msgObj.key } });
                await sock.sendMessage(sender, { text: getMessage('cek_error').replace('{error}', status.pesan) }, { quoted: msgObj });
            }
            return;
        }

        // --- CORE LOGIC: !RIWAYAT ---
        if (command === "!riwayat") {
            const user = getUserByPhone(senderNumber);
            if (!user) {
                await sock.sendMessage(sender, { text: "Anda belum terdaftar." }, { quoted: msgObj });
                return;
            }
            let days = 1;
            if (args && !isNaN(parseInt(args))) {
                days = Math.min(Math.max(parseInt(args), 1), 7);
            }
            await sock.sendMessage(sender, { react: { text: "⏳", key: msgObj.key } });
            const result = await getRiwayat(user.email, user.password, days);

            if (result.success && result.logs.length > 0) {
                await sock.sendMessage(sender, { react: { text: "✅", key: msgObj.key } });
                let historyText = getMessage('riwayat_header') + '\n';
                result.logs.forEach(log => {
                    historyText += `\n━━━━━━━━━━━━━━━━━━\n`;
                    historyText += `*${log.date}*\n`;
                    if (log.missing || !log.activity_log) {
                        historyText += getMessage('riwayat_no_data') + '\n';
                    } else {
                        historyText += `*Aktivitas:*\n${log.activity_log}\n\n`;
                        if (log.lesson_learned) {
                            historyText += `*Pembelajaran:*\n${log.lesson_learned}\n\n`;
                        }
                        if (log.obstacles) {
                            historyText += `*Kendala:*\n${log.obstacles}\n`;
                        }
                    }
                });
                const targetJid = isGroup ? (msgObj.key.participant || msgObj.participant) : sender;
                if (isGroup) await sock.sendMessage(sender, { text: getMessage('riwayat_sent_to_private') }, { quoted: msgObj });
                await sock.sendMessage(targetJid, { text: historyText });
            } else {
                await sock.sendMessage(sender, { text: getMessage('riwayat_failed') }, { quoted: msgObj });
            }
            return;
        }

        // --- ADMIN LOGIC: !BROADCAST ---
        if (command === '!broadcast') {
            const ADMIN_NUMBERS = ['6285657025300', '6289517153324', '117948895244409'];
            let isAdmin = false;
            const senderBase = senderNumber.replace(/@.*/, '').replace(/:.*/, '');
            if (ADMIN_NUMBERS.some(num => senderBase.includes(num))) isAdmin = true;

            if (!isAdmin) {
                await sock.sendMessage(sender, { text: "Hanya untuk admin." }, { quoted: msgObj });
                return;
            }

            if (!args) {
                await sock.sendMessage(sender, { text: "Format: !broadcast [pesan]" }, { quoted: msgObj });
                return;
            }

            const allUsers = getAllUsers();
            await sock.sendMessage(sender, { react: { text: "📢", key: msgObj.key } });
            for (const u of allUsers) {
                try {
                    await sock.sendMessage(u.phone, { text: args });
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) { }
            }
            await sock.sendMessage(sender, { text: "Broadcast selesai." }, { quoted: msgObj });
            return;
        }

    } catch (e) {
        console.error(chalk.red("[HANDLER] Error:"), e);
    }
};

function parseDraftFromMessage(text) {
    let cleanText = text;

    // 1. Remove Header
    cleanText = cleanText.replace(/\*DRAF LAPORAN ANDA\*/i, '');
    cleanText = cleanText.replace(/\*DRAF DIPERBARUI\*[^\n]*/i, ''); // Remove DRAF DIPERBARUI and any following chars (like emoji) on that line

    // 2. Remove Footer Instructions (Strict Regex)
    const instructionPatterns = [
        /(\n\s*)?_Ketik\s+\*ya\*\s+untuk\s+kirim\._.*$/i,
        /(\n\s*)?_Ketik\s+\*ya\*\s+untuk\s+mengirim\s+laporan\s+ini\s+ke\s+web\s+MagangHub\._.*$/i,
        /(\n\s*)?Ketik\s+\*ya\*\s+untuk\s+mengirim\s+laporan\s+ini\s+ke\s+web\s+MagangHub.*$/i,
        /(\n\s*)?_Ketik\s+\*ya\*\s+untuk\s+kirim.*$/i,
        /(\n\s*)?\(ketik\s+ya\s+untuk\s+kirim\).*$/i,
        /(\n\s*)?_Ketik\s+\*ya\*\s+untuk\s+kirim,\s+atau\s+revisi\s+lagi.*$/i
    ];

    for (const pattern of instructionPatterns) {
        cleanText = cleanText.replace(pattern, '');
    }

    // 3. Remove standalone "ya" command
    cleanText = cleanText.replace(/(?<!\w)\*ya\*(?!\w)/g, '');

    // 4. Parse Sections
    const parseSection = (label) => {
        // Regex to capture content between *Label:* and the next *Label:* or end of string
        // Handles optional (xxx karakter) count which user might delete or keep
        const regex = new RegExp(`\\*${label}:\\*\\s*(\\([\\d]+\\s*karakter\\))?\\s*([\\s\\S]*?)(?=\\*\\w+:|$)`, 'i');
        const match = cleanText.match(regex);
        return match ? match[2].trim() : '';
    };

    const aktivitas = parseSection('Aktivitas');
    const pembelajaran = parseSection('Pembelajaran');
    const kendala = parseSection('Kendala');

    if (!aktivitas && !pembelajaran) return null;

    return {
        aktivitas: aktivitas || '',
        pembelajaran: pembelajaran || '',
        kendala: kendala || 'Tidak ada kendala.',
        type: 'manual'
    };
}

