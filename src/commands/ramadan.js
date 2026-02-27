const { getPrayerTimes, getRandomContent } = require('../services/ramadanService');
const chalk = require('chalk');

module.exports = {
    name: 'ramadan',
    aliases: ['imsak', 'imsakiyah', 'buka', 'berbuka', 'sholat', 'jadwalsholat', 'sahur', 'puasa', 'jadwal', 'doa'],
    description: 'Fitur Ramadhan: Jadwal Imsak, Buka Puasa, Doa, dan Pengingat',
    async execute(sock, message, context) {
        const { remoteJid } = message.key;
        const { args, BOT_PREFIX } = context;
        const command = message.message.conversation || message.message.extendedTextMessage?.text || '';
        const cmdName = command.split(' ')[0].replace(BOT_PREFIX, '').toLowerCase();

        // --- COMMAND: !doa ---
        if (cmdName === 'doa') {
            const { getRandomDoa } = require('../services/ramadanService');
            const res = await getRandomDoa();
            if (res.success) {
                const d = res.content;
                const text = `🤲 *${d.judul}*\n\n${d.arab}\n\n_(${d.latin})_\n\n*Artinya:* "${d.terjemahan}"`;
                await sock.sendMessage(remoteJid, { text }, { quoted: message });
            } else {
                await sock.sendMessage(remoteJid, { text: '⚠️ Gagal mengambil doa. Coba lagi nanti.' }, { quoted: message });
            }
            return;
        }

        // Default City logic
        let city = args && args.length > 0 ? args.join(' ') : 'Makassar';

        try {
            const result = await getPrayerTimes(city);
            if (!result.success) {
                await sock.sendMessage(remoteJid, { text: `⚠️ Gagal mengambil data kota *${city}*.` }, { quoted: message });
                return;
            }

            const t = result.timings;
            const timezone = result.meta.timezone;

            // Helper to parsing "HH:mm" to Date object for today in the target city's timezone
            const timeToDate = (timeStr, tz) => {
                const [h, m] = timeStr.split(':').map(val => parseInt(val));
                const nowInCity = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
                nowInCity.setHours(h, m, 0, 0);
                return nowInCity;
            };

            const nowInCity = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));

            const prayerList = [
                { name: 'Imsak', time: t.Imsak },
                { name: 'Subuh', time: t.Fajr },
                { name: 'Dzuhur', time: t.Dhuhr },
                { name: 'Ashar', time: t.Asr },
                { name: 'Maghrib', time: t.Maghrib },
                { name: 'Isya', time: t.Isha }
            ];

            // --- COMMAND: !jadwal / !imsakiyah / !jadwalsholat ---
            if (['jadwal', 'imsakiyah', 'jadwalsholat'].includes(cmdName)) {
                let text = `📅 *Jadwal Imsakiyah & Sholat*\n📍 *${city}*\n\n`;
                
                prayerList.forEach(p => {
                    text += `• ${p.name.padEnd(8)} : *${p.time}*\n`;
                });

                // Find next event
                let nextEvent = null;
                let minDiff = Infinity;

                for (const p of prayerList) {
                    const pDate = timeToDate(p.time, timezone);
                    if (pDate > nowInCity) {
                        const diff = pDate - nowInCity;
                        if (diff < minDiff) {
                            minDiff = diff;
                            nextEvent = p;
                        }
                    }
                }

                if (nextEvent) {
                    const hours = Math.floor(minDiff / (1000 * 60 * 60));
                    const mins = Math.floor((minDiff % (1000 * 60 * 60)) / (1000 * 60));
                    
                    let timeStr = '';
                    if (hours > 0) timeStr += `${hours} jam `;
                    if (mins > 0 || hours === 0) timeStr += `${mins} menit`;

                    text += `\n⏳ Menuju *${nextEvent.name}* dalam:\n*${timeStr.trim()} lagi*`;
                }

                await sock.sendMessage(remoteJid, { text }, { quoted: message });
            }

            // --- COMMAND: !buka / !berbuka ---
            else if (['buka', 'berbuka', 'puasa'].includes(cmdName)) {
                const maghribDate = timeToDate(t.Maghrib, timezone);

                if (maghribDate < nowInCity) {
                    await sock.sendMessage(remoteJid, {
                        text: `✅ Waktu berbuka untuk *${city}* (${t.Maghrib}) sudah lewat.\nSelamat berbuka puasa!`
                    }, { quoted: message });
                } else {
                    const diff = maghribDate - nowInCity;
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                    let timeStr = '';
                    if (hours > 0) timeStr += `${hours} jam `;
                    if (mins > 0 || hours === 0) timeStr += `${mins} menit`;

                    const text = `🌇 *Buka Puasa (${city})*\nJam: *${t.Maghrib}*\n\nBuka puasa dalam:\n*${timeStr.trim()} lagi*.\n\nSemangat puasanya! 💪`;
                    await sock.sendMessage(remoteJid, { text }, { quoted: message });
                }
            }

            // --- COMMAND: !imsak ---
            else if (['imsak'].includes(cmdName)) {
                const imsakDate = timeToDate(t.Imsak, timezone);
                
                if (imsakDate < nowInCity) {
                    await sock.sendMessage(remoteJid, {
                        text: `⚠️ Waktu Imsak untuk *${city}* (${t.Imsak}) sudah lewat.\nSelamat menjalankan ibadah puasa!`
                    }, { quoted: message });
                } else {
                    const diff = imsakDate - nowInCity;
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                    let timeStr = '';
                    if (hours > 0) timeStr += `${hours} jam `;
                    if (mins > 0 || hours === 0) timeStr += `${mins} menit`;

                    const text = `⏳ *Imsak (${city})*\nJam: *${t.Imsak}*\n\nImsak dalam:\n*${timeStr.trim()} lagi*.\nJangan lupa niat puasa ya! ✨`;
                    await sock.sendMessage(remoteJid, { text }, { quoted: message });
                }
            }

            // --- COMMAND: !sahur ---
            else if (['sahur'].includes(cmdName)) {
                // For Sahur, we target the Imsak time as the limit
                const imsakDate = timeToDate(t.Imsak, timezone);
                
                if (imsakDate < nowInCity) {
                    await sock.sendMessage(remoteJid, {
                        text: `🥣 Waktu sahur untuk *${city}* sudah lewat (Imsak: ${t.Imsak}).\nSelamat berpuasa!`
                    }, { quoted: message });
                } else {
                    const diff = imsakDate - nowInCity;
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                    let timeStr = '';
                    if (hours > 0) timeStr += `${hours} jam `;
                    if (mins > 0 || hours === 0) timeStr += `${mins} menit`;

                    let text = `🥣 *Persiapan Sahur (${city})*\nBatas Imsak: *${t.Imsak}*\n\nWaktu sahur tersisa:\n*${timeStr.trim()} lagi*.\n\n`;
                    
                    // Add random content for encouragement
                    const contentRes = await getRandomContent();
                    if (contentRes.success) {
                        const c = contentRes.content;
                        if (contentRes.type === 'ayat') {
                            text += `📖 *QS. ${c.surah}: ${c.ayat}*\n"${c.terjemahan}"`;
                        } else {
                            text += `📜 *HR. ${c.perawi}*\n"${c.terjemahan}"`;
                        }
                    }

                    await sock.sendMessage(remoteJid, { text }, { quoted: message });
                }
            }

            // --- COMMAND: !solat / !sholat ---
            else if (['sholat', 'solat'].includes(cmdName)) {
                const sPrayers = [
                    { name: 'Subuh', time: t.Fajr },
                    { name: 'Dzuhur', time: t.Dhuhr },
                    { name: 'Ashar', time: t.Asr },
                    { name: 'Maghrib', time: t.Maghrib },
                    { name: 'Isya', time: t.Isha }
                ];

                let nextP = null;
                let minD = Infinity;

                for (const p of sPrayers) {
                    const pDate = timeToDate(p.time, timezone);
                    if (pDate > nowInCity) {
                        const diff = pDate - nowInCity;
                        if (diff < minD) {
                            minD = diff;
                            nextP = p;
                        }
                    }
                }

                                if (nextP) {
                                    const hours = Math.floor(minD / (1000 * 60 * 60));
                                    const mins = Math.floor((minD % (1000 * 60 * 60)) / (1000 * 60));
                
                                    let timeStr = '';
                                    if (hours > 0) timeStr += `${hours} jam `;
                                    if (mins > 0 || hours === 0) timeStr += `${mins} menit`;
                
                                    const text = `🕌 *Jadwal Sholat Berikutnya*\n📍 *${city}*\n\n*${nextP.name}* : ${nextP.time}\nDalam: *${timeStr.trim()} lagi*.\n\n"Sesungguhnya sholat itu adalah fardhu yang ditentukan waktunya atas orang-orang yang beriman." (QS. An-Nisa: 103)`;
                                    await sock.sendMessage(remoteJid, { text }, { quoted: message });
                                }
                 else {
                    await sock.sendMessage(remoteJid, { text: `✅ Semua jadwal sholat hari ini di *${city}* sudah selesai.` }, { quoted: message });
                }
            }

        } catch (e) {
            console.error(chalk.red('[RAMADAN] Command Error:'), e);
            await sock.sendMessage(remoteJid, { text: '⚠️ Terjadi kesalahan saat mengambil data Ramadan.' }, { quoted: message });
        }
    }
};
