/**
 * Penangan Pesan — Dispatcher Utama
 * Meneruskan pesan masuk ke modul perintah yang sesuai
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { getCommand, getCommandKeys } = require('../commands');
const { findClosestMatch } = require('../utils/stringUtils');
const { cariUserHP, updateLidUser } = require('../services/database');
const { prosesLoginDanAbsen, getRiwayat } = require('../services/magang');
const { processFreeTextToReport } = require('../services/aiService');
const { getDraft, setDraft, deleteDraft, formatDraftPreview } = require('../services/previewService');
const botState = require('../services/botState');
const { getMessage } = require('../services/messageService');
const { BOT_PREFIX, VALIDATION, ADMIN_NUMBERS } = require('../config/constants');
const { parseDraftFromMessage, normalizeToStandard } = require('../utils/messageUtils');
const { ambilInfoGrup, tunjukkanSedangKetik } = require('../utils/whatsappUtils');
const { laporError } = require('../services/errorReporter');

// Cache user yang ditandai
let cacheUserTandai = null;
const FILE_USER_TANDAI = path.join(__dirname, '../../data/marked_users.json');

const muatUserTandai = () => {
    if (cacheUserTandai) return cacheUserTandai;
    try {
        if (fs.existsSync(FILE_USER_TANDAI)) {
            const data = JSON.parse(fs.readFileSync(FILE_USER_TANDAI, 'utf8'));
            cacheUserTandai = (data && Array.isArray(data.marked_users)) ? data.marked_users : [];
            return cacheUserTandai;
        }
    } catch (e) {
        console.error('[HANDLER] Gagal memuat user tandai:', e.message);
    }
    cacheUserTandai = [];
    return cacheUserTandai;
};

/**
 * Handler utama untuk semua pesan masuk
 */
const tanganiPesan = async (sock, msg) => {
    let noPengirim, teksPesan, pengirim;

    try {
        let objPesan = msg.messages ? msg.messages[0] : msg;
        if (!objPesan || !objPesan.message) return;

        // Abaikan pesan dari diri sendiri untuk mencegah loop
        if (objPesan.key.fromMe) return;

        const statusBot = botState.ambilStatusBot();
        pengirim = objPesan.key.remoteJid;
        const adalahGrup = pengirim.endsWith("@g.us");

        // Bot offline — abaikan semua
        if (statusBot === 'offline') return;

        // --- PROSES KONTEN PESAN ---
        const ambilTeks = (m) => {
            if (!m) return "";
            return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || "";
        };
        teksPesan = ambilTeks(objPesan.message);
        const perintah = teksPesan.trim().startsWith(BOT_PREFIX);
        const konfirmasi = teksPesan.toLowerCase().trim() === 'ya';

        // Resolusi nomor pengirim
        noPengirim = adalahGrup
            ? objPesan.key.participant || objPesan.participant
            : pengirim;

        noPengirim = normalizeToStandard(noPengirim);

        // --- ROUTING PERINTAH & USER TANDAI ---
        if (perintah) {
            const bagianPerintah = teksPesan.trim().split(/\s+/);
            const cmd = bagianPerintah[0].toLowerCase();
            const namaCmd = cmd.substring(BOT_PREFIX.length);
            const argumen = teksPesan.trim().substring(cmd.length).trim();

            // --- PERLAKUAN KHUSUS USER TANDAI (Hanya pada perintah) ---
            try {
                const userTandai = muatUserTandai();
                if (userTandai && userTandai.length > 0) {
                    const pengirimAsli = objPesan.key.participant || objPesan.participant || pengirim;
                    const cocok = userTandai.find(u =>
                        u && (u.lid === pengirimAsli ||
                            u.phone === pengirimAsli ||
                            (u.phone && normalizeToStandard(u.phone) === noPengirim))
                    );

                    if (cocok && !objPesan.key.fromMe) {
                        const pathStiker = path.join(__dirname, '../../', cocok.sticker_path);
                        if (fs.existsSync(pathStiker)) {
                            await sock.sendMessage(pengirim, {
                                sticker: fs.readFileSync(pathStiker)
                            }, { quoted: objPesan });
                        }
                        return;
                    }                }
            } catch (e) {
                console.error('[HANDLER] Error pada logika user tandai:', e.message);
            }

            const modulCmd = getCommand(namaCmd);
            if (modulCmd) {

                if (botState.cekCmdMaintenance(namaCmd)) {
                    await sock.sendMessage(pengirim, {
                        text: `⚠️ Perintah *!${namaCmd}* sedang dalam pemeliharaan (maintenance). Mohon coba lagi nanti.`
                    }, { quoted: objPesan });
                    return;
                }

                try {
                    // Daripada reaksi emot, gunakan typing status (lebih natural)
                    await tunjukkanSedangKetik(sock, pengirim, 3000);
                } catch (e) { }

                const idPengirimAsliRaw = adalahGrup ? (objPesan.key.participant || objPesan.participant) : pengirim;
                const idPengirimAsli = normalizeToStandard(idPengirimAsliRaw);

                // --- AUTH CHECKS ---
                const isOwner = ADMIN_NUMBERS.includes(idPengirimAsli) || ADMIN_NUMBERS.includes(noPengirim);
                console.log(`[AUTH DEBUG] idPengirimAsli: ${idPengirimAsli}, isOwner: ${isOwner}, ADMIN_LIST: ${JSON.stringify(ADMIN_NUMBERS)}`);

                let isAdmin = isOwner;

                if (adalahGrup && !isAdmin) {
                    try {
                        const metadata = await ambilInfoGrup(sock, pengirim);
                        const participants = metadata.participants || [];
                        const userPart = participants.find(p => p.id === idPengirimAsli);
                        isAdmin = userPart && (userPart.admin === 'admin' || userPart.admin === 'superadmin');
                    } catch (e) {
                        console.error('[HANDLER] Gagal cek admin grup:', e.message);
                    }
                }

                const argsArray = argumen ? argumen.split(/\s+/) : [];
                const konteks = {
                    sender: pengirim,
                    senderNumber: noPengirim,
                    isGroup: adalahGrup,
                    commandName: namaCmd,
                    args: argumen, // Kembali ke string untuk kompatibilitas
                    argsArray: argsArray, // Opsi baru untuk yang butuh array
                    textMessage: teksPesan,
                    originalSenderId: idPengirimAsli,
                    BOT_PREFIX,
                    isOwner,
                    isAdmin
                };

                await modulCmd.execute(sock, objPesan, konteks);
                return;
            } else {
                // --- PENANGAN TYPO ---
                const semuaCmd = getCommandKeys();
                const terdekat = findClosestMatch(namaCmd, semuaCmd, 2);
                if (terdekat) {
                    try {
                        await sock.sendMessage(pengirim, {
                            text: `⚠️ Perintah *!${namaCmd}* tidak ditemukan. Mungkin maksud Anda *!${terdekat}*?`
                        }, { quoted: objPesan });
                    } catch (e) { }
                }
            }
        }

        // --- ALUR KONFIRMASI: "ya" ---
        const draf = getDraft(noPengirim);
        if (konfirmasi && draf) {
            if (draf.type === 'simulation') {
                await tunjukkanSedangKetik(sock, pengirim, 3500);
                await sock.sendMessage(pengirim, {
                    text: `✅ *[SIMULASI BERHASIL]*\n\nDraft ini valid, tapi TIDAK dikirim ke server karena ini mode test.\n\n_Draft dihapus dari memori._`
                }, { quoted: objPesan });
                deleteDraft(noPengirim);
                return;
            }

            const user = cariUserHP(noPengirim);
            if (!user) return;

            await tunjukkanSedangKetik(sock, pengirim, 3000);

            const hasilLogin = await prosesLoginDanAbsen({
                email: user.email,
                password: user.password,
                aktivitas: draf.aktivitas,
                pembelajaran: draf.pembelajaran,
                kendala: draf.kendala
            });

            if (hasilLogin.success) {
                await sock.sendMessage(pengirim, { text: getMessage('!absen_submit_success', noPengirim) }, { quoted: objPesan });
                deleteDraft(noPengirim);
            } else {
                await sock.sendMessage(pengirim, { text: getMessage('!absen_submit_failed', noPengirim).replace('{error}', hasilLogin.pesan) }, { quoted: objPesan });
            }
            return;
        }

        // --- ALUR EDIT DRAF & REVISI AI ---
        const kontenDraf = teksPesan.includes("*DRAF LAPORAN ANDA*") ||
            teksPesan.includes("*DRAF LAPORAN OTOMATIS*") ||
            teksPesan.includes("Draf absen darurat") ||
            teksPesan.includes("*DRAF DIPERBARUI*");

        const adalahTemplate = teksPesan.includes("Aktivitas pada hari ini adalah") || teksPesan.includes("Isi dan kirim balik pesan ini");

        if ((draf || kontenDraf) && !perintah && !adalahTemplate) {
            const infoKonteks = objPesan.message.extendedTextMessage?.contextInfo;
            const jidBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const balasBot = infoKonteks?.participant === jidBot || infoKonteks?.participant === sock.user.id;

            if (kontenDraf || ((!adalahGrup || balasBot) && draf)) {
                const hasilParse = parseDraftFromMessage(teksPesan);

                if (hasilParse) {
                    const MIN_KARAKTER = VALIDATION.MANUAL_MIN_CHARS;
                    const errors = [];
                    if (hasilParse.aktivitas.length < MIN_KARAKTER) errors.push(`Aktivitas kurang (${hasilParse.aktivitas.length}/${MIN_KARAKTER})`);
                    if (hasilParse.pembelajaran.length < MIN_KARAKTER) errors.push(`Pembelajaran kurang (${hasilParse.pembelajaran.length}/${MIN_KARAKTER})`);
                    if (hasilParse.kendala !== 'Tidak ada kendala.' && hasilParse.kendala.length < MIN_KARAKTER) errors.push(`Kendala kurang (${hasilParse.kendala.length}/${MIN_KARAKTER})`);

                    if (errors.length > 0) {
                        await sock.sendMessage(pengirim, { text: getMessage('draft_format_error', noPengirim).replace('{errors}', errors.join('\n')) }, { quoted: objPesan });
                        return;
                    }

                    setDraft(noPengirim, hasilParse);
                    const teksPreview = formatDraftPreview(hasilParse, 'draft_updated');

                    if (adalahGrup) {
                        await sock.sendMessage(pengirim, { text: "✅ Draft berhasil diperbarui. Cek Chat Pribadi Anda." }, { quoted: objPesan });
                        const idAsli = objPesan.key.participant || objPesan.participant || pengirim;
                        await sock.sendMessage(idAsli, { text: teksPreview });
                    } else {
                        await sock.sendMessage(pengirim, { text: teksPreview }, { quoted: objPesan });
                    }
                } else if (!adalahGrup || balasBot) {
                    // Revisi AI (balasan teks bebas)
                    const user = cariUserHP(noPengirim);
                    if (!user) return;

                    await tunjukkanSedangKetik(sock, pengirim, 4500);
                    const riwayat = await getRiwayat(user.email, user.password, 3);
                    const konteksRevisi = (draf && draf.type === 'ai') ? 'Revisi dari draft AI sebelumnya: ' : 'Revisi manual/baru: ';
                    const hasilAI = await processFreeTextToReport(konteksRevisi + teksPesan, riwayat.success ? riwayat.logs : []);

                    if (hasilAI.success) {
                        const dataLaporan = { aktivitas: hasilAI.aktivitas, pembelajaran: hasilAI.pembelajaran, kendala: hasilAI.kendala, type: 'ai' };
                        setDraft(noPengirim, dataLaporan);
                        const teksPreview = formatDraftPreview(dataLaporan, 'draft_updated');

                        if (adalahGrup) {
                            await sock.sendMessage(pengirim, { text: "✅ Draft berhasil diperbarui. Cek Chat Pribadi Anda." }, { quoted: objPesan });
                            const idAsli = objPesan.key.participant || objPesan.participant || pengirim;
                            await sock.sendMessage(idAsli, { text: teksPreview });
                        } else {
                            await sock.sendMessage(pengirim, { text: teksPreview }, { quoted: objPesan });
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(chalk.red("[HANDLER] Error:"), e);

        // Notifikasi Admin
        if (!teksPesan?.includes('SYSTEM ERROR REPORT')) {
            laporError(e, 'messageHandler (Main)', {
                sender: pengirim,
                senderNumber: noPengirim,
                text: teksPesan ? teksPesan.substring(0, 100) : "N/A"
            });
        }

        // Notifikasi User (pesan ramah)
        try {
            const pesanError = "⚠️ *Terjadi Kesalahan Internal*\n\nMaaf, sistem sedang mengalami kendala teknis saat memproses pesan Anda. Admin telah dinotifikasi untuk pengecekan lebih lanjut.\n\nSilakan coba lagi beberapa saat lagi.";
            await sock.sendMessage(pengirim, { text: pesanError }, { quoted: objPesan });
        } catch (errKirim) {
            console.error(chalk.red("[HANDLER] Gagal mengirim pesan error ke user:"), errKirim.message);
        }
    }
};

module.exports = tanganiPesan;
