const { getPrayerTimes, getRandomContent } = require('../services/ramadanService');
const chalk = require('chalk');

module.exports = {
    name: 'ramadan',
    aliases: ['imsak', 'imsakiyah', 'buka', 'berbuka', 'sholat', 'jadwalsholat', 'sahur', 'puasa'],
    description: 'Fitur Ramadhan: Jadwal Imsak, Buka Puasa, dan Pengingat',
    async execute(sock, message, context) {
        const { remoteJid } = message.key;
        const { args, BOT_PREFIX } = context;
        const command = message.message.conversation || message.message.extendedTextMessage?.text || '';
        const cmdName = command.split(' ')[0].replace(BOT_PREFIX, '').toLowerCase();

        // Default City logic
        let city = args && args.length > 0 ? args.join(' ') : 'Makassar';

        try {
            const result = await getPrayerTimes(city);
            if (!result.success) {
                await sock.sendMessage(remoteJid, { text: `⚠️ Gagal mengambil data kota *${city}*.` }, { quoted: message });
                return;
            }

            const t = result.timings;
            const now = new Date();

            // Helper to parsing "HH:mm" to Date object for today
            const timeToDate = (timeStr) => {
                const [h, m] = timeStr.split(':').map(Number);
                const date = new Date();
                date.setHours(h, m, 0, 0);
                return date;
            };

            // --- COMMAND: !imsakiyah / !jadwalsholat (COUNTDOWN STYLE) ---
            if (['imsak', 'imsakiyah', 'sholat', 'jadwalsholat'].includes(cmdName)) {
                // Find next prayer
                const prayerList = [
                    { name: 'Subuh', time: t.Fajr },
                    { name: 'Dzuhur', time: t.Dhuhr },
                    { name: 'Ashar', time: t.Asr },
                    { name: 'Maghrib', time: t.Maghrib },
                    { name: 'Isya', time: t.Isha }
                ];

                let nextPrayer = null;
                let minDiff = Infinity;

                for (const p of prayerList) {
                    const pDate = timeToDate(p.time);
                    if (pDate > now) {
                        const diff = pDate - now;
                        if (diff < minDiff) {
                            minDiff = diff;
                            nextPrayer = p;
                        }
                    }
                }

                // If no prayer left today, next is Subuh tomorrow (logic simplified: just say "Besok")
                // Or just show full schedule if late night.

                let text = '';
                if (nextPrayer) {
                    const hours = Math.floor(minDiff / (1000 * 60 * 60));
                    const mins = Math.floor((minDiff % (1000 * 60 * 60)) / (1000 * 60));

                    text = `Menuju *${nextPrayer.name}* (${nextPrayer.time}) dalam:\n`;
                    text += `*${hours} jam ${mins} menit*\n\n`;
                    text += `_Lokasi: ${city}_`;
                } else {
                    text = `Jadwal sholat hari ini di *${city}* sudah selesai.\n`;
                    text += `Subuh besok: ${t.Fajr}`;
                }

                await sock.sendMessage(remoteJid, { text }, { quoted: message });
            }

            // --- COMMAND: !berbuka (MINIMALIST COUNTDOWN) ---
            else if (['buka', 'berbuka', 'puasa'].includes(cmdName)) {
                const maghribDate = timeToDate(t.Maghrib);

                if (maghribDate < now) {
                    await sock.sendMessage(remoteJid, {
                        text: `Waktu berbuka (${t.Maghrib}) sudah lewat.\nSelamat berbuka.`
                    }, { quoted: message });
                } else {
                    const diff = maghribDate - now;
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                    const text = `Berbuka dalam *${hours} jam ${mins} menit*.\n\nSemangat Puasanya`;
                    await sock.sendMessage(remoteJid, { text }, { quoted: message });
                }
            }

            // --- COMMAND: !sahur (AI SUMMARIZED CONTENT) ---
            else if (['sahur'].includes(cmdName)) {
                // Fetch random content (Ayat/Hadith) - Service will auto-summarize
                const contentRes = await getRandomContent();
                let text = `🥣 *Waktunya Sahur*\n\n`;

                if (contentRes.success) {
                    const c = contentRes.content;
                    if (contentRes.type === 'ayat') {
                        text += `QS. ${c.surah}: ${c.ayat}\n`;
                        text += `"${c.terjemahan}"`;
                    } else {
                        text += `HR. ${c.perawi}\n`;
                        text += `"${c.terjemahan}"`;
                    }
                } else {
                    text += `"Makan sahurlah kalian, karena pada sahur itu terdapat keberkahan."`;
                }

                await sock.sendMessage(remoteJid, { text }, { quoted: message });
            }

        } catch (e) {
            console.error(chalk.red('[RAMADAN] Command Error:'), e);
            await sock.sendMessage(remoteJid, { text: 'Error data ramadhan.' }, { quoted: message });
        }
    }
};
