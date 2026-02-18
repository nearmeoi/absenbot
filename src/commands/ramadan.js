const { getPrayerTimes, getRandomContent } = require('../services/ramadanService');
const chalk = require('chalk');

module.exports = {
    name: 'ramadan',
    aliases: ['imsak', 'imsakiyah', 'buka', 'berbuka', 'sholat', 'jadwalsholat', 'sahur', 'puasa'],
    description: 'Fitur Ramadhan: Jadwal Imsak, Buka Puasa, dan Pengingat',
    async execute(sock, message, context) {
        const { remoteJid } = message.key;
        const { args } = context;
        const command = message.message.conversation || message.message.extendedTextMessage?.text || '';
        const cmdName = command.split(' ')[0].replace('!', '').toLowerCase();

        // Default City logic
        let city = args && args.length > 0 ? args.join(' ') : 'Makassar';

        try {
            // --- COMMAND: !imsakiyah / !jadwalsholat ---
            if (['imsak', 'imsakiyah', 'sholat', 'jadwalsholat'].includes(cmdName)) {
                const result = await getPrayerTimes(city);
                if (!result.success) {
                    await sock.sendMessage(remoteJid, { text: `⚠️ Gagal mengambil jadwal untuk kota *${city}*. Coba kota lain.` });
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
                text += `im *Isya:* ${t.Isha}\n\n`;

                text += `_Selamat Menunaikan Ibadah Puasa_ 🌙`;

                await sock.sendMessage(remoteJid, { text });
            }

            // --- COMMAND: !berbuka (Countdown) ---
            else if (['buka', 'berbuka', 'puasa'].includes(cmdName)) {
                const result = await getPrayerTimes(city);
                if (!result.success) {
                    await sock.sendMessage(remoteJid, { text: `⚠️ Gagal mengambil data untuk *${city}*.` });
                    return;
                }

                const now = new Date();
                const maghribTime = result.timings.Maghrib; // "18:15"
                const [h, m] = maghribTime.split(':').map(Number);

                const target = new Date();
                target.setHours(h, m, 0, 0);

                // Adjust timezone manually if needed, but for now assuming bot runs in WITA
                // If the input city is different timezone, this calculation might be slightly off relative to Server Time
                // But Aladhan API returns local time for that city.
                // We need to compare it to "Now" in that city's timezone.
                // This is tricky without a timezone key.
                // Simplified approach: Calculate difference based on SERVER time vs Target Time string.
                // Assuming user wants to know relative time.

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

                await sock.sendMessage(remoteJid, { text });
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

                await sock.sendMessage(remoteJid, { text });
            }

        } catch (e) {
            console.error(chalk.red('[RAMADAN] Command Error:'), e);
            await sock.sendMessage(remoteJid, { text: '⚠️ Terjadi kesalahan saat memproses data Ramadhan.' });
        }
    }
};
