const axios = require('axios');
const chalk = require('chalk');

// Default Location: Makassar
const DEFAULT_CITY = 'Makassar';
const DEFAULT_COUNTRY = 'Indonesia';

/**
 * Get Prayer Times from Aladhan API
 * @param {string} city 
 * @param {string} country 
 */
async function getPrayerTimes(city = DEFAULT_CITY, country = DEFAULT_COUNTRY) {
    try {
        const date = new Date();
        const url = `https://api.aladhan.com/v1/timingsByCity/${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}?city=${city}&country=${country}&method=20`; // Method 20: Kemenag RI

        const response = await axios.get(url);
        if (response.data && response.data.code === 200) {
            const data = response.data.data;
            return {
                success: true,
                timings: data.timings,
                date: data.date,
                meta: data.meta
            };
        }
        throw new Error('API Error');
    } catch (e) {
        console.error(chalk.red('[RAMADAN] Prayer API Error:'), e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Get Random Ayat from EQuran.id
 */
async function getRandomAyat() {
    try {
        // Total Surah: 114
        const surah = Math.floor(Math.random() * 114) + 1;
        const url = `https://equran.id/api/v2/surat/${surah}`;

        const response = await axios.get(url);
        if (response.data && response.data.code === 200) {
            const data = response.data.data;
            // Pick random ayat from this surah
            const ayatCount = data.ayat.length;
            const ayatIndex = Math.floor(Math.random() * ayatCount);
            const ayat = data.ayat[ayatIndex];

            return {
                success: true,
                type: 'ayat',
                content: {
                    surah: data.namaLatin,
                    nomor: data.nomor,
                    ayat: ayat.nomorAyat,
                    arab: ayat.teksArab,
                    latin: ayat.teksLatin,
                    terjemahan: ayat.teksIndonesia
                }
            };
        }
        throw new Error('API Error');
    } catch (e) {
        console.error(chalk.red('[RAMADAN] Ayat API Error:'), e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Get Random Hadith from GadingDev
 */
async function getRandomHadith() {
    try {
        const books = ['muslim', 'bukhari', 'tirmidzi', 'nasai', 'abu-daud', 'ibnu-majah', 'ahmad', 'malik'];
        const book = books[Math.floor(Math.random() * books.length)];

        // We typically don't know the max range for each book dynamically without querying first, 
        // but let's try a safe range or use a specific endpoint if available.
        // GadingDev API structure: /books/{book}?range=1-300 is safer to get a list then pick one
        // actually /books/{book}/{number}

        // Use range query to get a valid list (1-150 is usually safe for all books)
        // Then pick random from that list
        const rangeStart = Math.floor(Math.random() * 100) + 1;
        const rangeEnd = rangeStart + 10;
        const url = `https://api.hadith.gading.dev/books/${book}?range=${rangeStart}-${rangeEnd}`;

        const response = await axios.get(url);

        if (response.data && response.data.code === 200) {
            const data = response.data.data;
            const hadiths = data.hadiths;
            if (hadiths.length > 0) {
                const randomHadith = hadiths[Math.floor(Math.random() * hadiths.length)];
                return {
                    success: true,
                    type: 'hadith',
                    content: {
                        perawi: data.name,
                        nomor: randomHadith.number,
                        arab: randomHadith.arab,
                        terjemahan: randomHadith.id
                    }
                };
            }
        }
        throw new Error('API Error or Empty');
    } catch (e) {
        // Fallback to Ayat if Hadith fails
        return getRandomAyat();
    }
}

async function getRandomContent() {
    // 60% Ayat, 40% Hadith
    if (Math.random() > 0.4) {
        return await getRandomAyat();
    } else {
        return await getRandomHadith();
    }
}

module.exports = {
    getPrayerTimes,
    getRandomAyat,
    getRandomHadith,
    getRandomContent
};
