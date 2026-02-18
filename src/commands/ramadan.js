const { getPrayerTimes, getRandomContent } = require('../services/ramadanService');
const chalk = require('chalk');

module.exports = {
    name: 'ramadan',
    aliases: ['imsak', 'imsakiyah', 'buka', 'berbuka', 'sholat', 'jadwalsholat', 'sahur', 'puasa'],
    description: 'Fitur Ramadhan: Jadwal Imsak, Buka Puasa, dan Pengingat',
    async execute(sock, msgObj, context) {
        const { sender: remoteJid, args, textMessage, BOT_PREFIX } = context;
        const commandParts = textMessage.trim().split(/\s+/);
        const cmdName = commandParts[0].toLowerCase().substring(BOT_PREFIX.length);

        // Default City logic
        let city = args && args.trim() !== '' ? args : 'Makassar';

        try {
            // --- COMMAND: !imsakiyah / !jadwalsholat ---
            if (['imsak', 'imsakiyah', 'sholat', 'jadwalsholat'].includes(cmdName)) {
                const result = await getPrayerTimes(city);
                if (!result.success) {
                    await sock.sendMessage(remoteJid, { text: `⚠️ Gagal mengambil jadwal untuk kota *${city}*. Coba kota lain.` }, { quoted: msgObj });
                    return;
                }

                const t = result.timings;
                const d = result.date;
                const hijri = d.hijri ? `${d.hijri.day} ${d.hijri.month.en} ${d.hijri.year}` : '';

                let text = `🕌 *Jadwal Sholat & Imsakiyah*\n`;
                text += `📍 *${city.toUpperCase()}*\n`;
                text += `📅 ${d.readable} | ${hijri}\n\n`;

                text += `🌌 *Imsak:* ${t.Imsak}\n`;
                text += `🌅 *Subuh:* ${t.Fajr}\n`;
                text += `🌞 *Terbit:* ${t.Sunrise}\n`;
                text += `☀️ *Dzuhur:* ${t.Dhuhr}\n`;
                text += `🌤️ *Ashar:* ${t.Asr}\n`;
                text += `🌇 *Maghrib (Buka):* ${t.Maghrib}\n`;
                text += `🏙️ *Isya:* ${t.Isha}\n\n`;

                text += `_Selamat Menunaikan Ibadah Puasa_ 🌙`;

                await sock.sendMessage(remoteJid, { text }, { quoted: msgObj });
            }

            // --- COMMAND: !berbuka (Countdown) ---
            else if (['buka', 'berbuka', 'puasa'].includes(cmdName)) {
                const result = await getPrayerTimes(city);
                if (!result.success) {
                    await sock.sendMessage(remoteJid, { text: `⚠️ Gagal mengambil data untuk *${city}*.` }, { quoted: msgObj });
                    return;
                }

                const now = new Date();
                const maghribTime = result.timings.Maghrib; // "18:15"
                const [h, m] = maghribTime.split(':').map(Number);

                const target = new Date();
                target.setHours(h, m, 0, 0);

                let text = '';
                if (target < now) {
                    text = `✅ Waktu berbuka untuk *${city}* (${maghribTime}) sudah lewat hari ini.\nSelamat berbuka puasa! 🍵`;
                } else {
                    const diff = target - now;
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                    text = `⏳ *Hitung Mundur Berbuka di ${city}*\n`;
                    text += `⏰ Waktu Maghrib: *${maghribTime}*\n`;
                    text += `⏱️ Kurang: *${hours} jam ${mins} menit* lagi\n\n`;
                    text += `_Semangat puasanya!_ 💪`;
                }

                await sock.sendMessage(remoteJid, { text }, { quoted: msgObj });
            }

            // --- COMMAND: !sahur (Quote/Ayat/Hadith) ---
            else if (['sahur'].includes(cmdName)) {
                const contentRes = await getRandomContent();
                let text = `🥣 *Waktunya Sahur!* Jangan lupa makan dan niat ya.\n\n`;

                if (contentRes.success) {
                    if (contentRes.type === 'ayat') {
                        const c = contentRes.content;
                        text += `📖 *QS. ${c.surah}: ${c.ayat}*\n`;
                        text += `_${c.arab}_\n`;
                        text += `"${c.terjemahan}"\n`;
                    } else {
                        const c = contentRes.content;
                        text += `📜 *Hadits Riwayat ${c.perawi} No. ${c.nomor}*\n`;
                        text += `"${c.terjemahan}"\n`;
                    }
                } else {
                    text += `_"Makan sahurlah kalian, karena pada sahur itu terdapat keberkahan." (HR. Bukhari & Muslim)_`;
                }

                await sock.sendMessage(remoteJid, { text }, { quoted: msgObj });
            }

        } catch (e) {
            console.error(chalk.red('[RAMADAN] Command Error:'), e);
            await sock.sendMessage(remoteJid, { text: '⚠️ Terjadi kesalahan saat memproses data Ramadhan.' }, { quoted: msgObj });
        }
    }
};
