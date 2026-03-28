import axios from 'axios';
import chalk from 'chalk';
import { summarizeIslamicContent } from './aiService.js';

// Default Location
const DEFAULT_CITY = 'Kota Makassar';
const DEFAULT_PROV = 'Sulawesi Selatan';

let provinceCache = null;
let cityCache = {}; // { provinceName: [cities] }

/**
 * Fetch and cache the list of provinces
 */
async function getProvinces() {
    if (provinceCache) return provinceCache;
    try {
        console.log(chalk.cyan('[RAMADAN] Fetching province list from EQuran.id...'));
        const provRes = await axios.get('https://equran.id/api/v2/shalat/provinsi');
        provinceCache = provRes.data.data;
        return provinceCache;
    } catch (e) {
        console.error(chalk.red('[RAMADAN] Province Fetch Error:'), e.message);
        return [];
    }
}

/**
 * Fetch and cache cities for a specific province
 */
async function getCitiesForProvince(prov) {
    if (cityCache[prov]) return cityCache[prov];
    try {
        console.log(chalk.cyan(`[RAMADAN] Fetching cities for ${prov}...`));
        const cityRes = await axios.post('https://equran.id/api/v2/shalat/kabkota', { provinsi: prov });
        cityCache[prov] = cityRes.data.data;
        return cityCache[prov];
    } catch (e) {
        console.error(chalk.red(`[RAMADAN] City Fetch Error for ${prov}:`), e.message);
        return [];
    }
}

/**
 * Try to find Province and City name from a search string
 */
async function resolveLocation(search) {
    const searchLower = search ? search.toLowerCase().trim() : '';
    
    if (!searchLower || searchLower === 'makassar') {
        return { provinsi: DEFAULT_PROV, kabkota: DEFAULT_CITY };
    }

    const provinces = await getProvinces();
    
    // Strategy: 
    // 1. Check if it's a province name first (e.g. "Jakarta")
    const provMatch = provinces.find(p => p.toLowerCase().includes(searchLower));
    if (provMatch) {
        const cities = await getCitiesForProvince(provMatch);
        // Return first city or capital (usually first)
        return { provinsi: provMatch, kabkota: cities[0] || provMatch };
    }

    // 2. Search in cities of likely provinces (or all if needed)
    // Priority provinces based on common usage
    const commonProvs = provinces.sort((a, b) => {
        const priority = ['Sulawesi Selatan', 'DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'Jawa Timur'];
        const aIdx = priority.indexOf(a);
        const bIdx = priority.indexOf(b);
        if (aIdx !== -1 && bIdx === -1) return -1;
        if (aIdx === -1 && bIdx !== -1) return 1;
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        return 0;
    });

    for (const prov of commonProvs) {
        const cities = await getCitiesForProvince(prov);
        const cityMatch = cities.find(c => c.toLowerCase().includes(searchLower));
        if (cityMatch) return { provinsi: prov, kabkota: cityMatch };
    }

    return { provinsi: DEFAULT_PROV, kabkota: DEFAULT_CITY };
}

/**
 * Get Prayer Times from EQuran.id API
 */
async function getPrayerTimes(search = 'Makassar') {
    try {
        const { provinsi, kabkota } = await resolveLocation(search);
        console.log(chalk.cyan(`[RAMADAN] Fetching prayer times for: ${kabkota}, ${provinsi}`));

        const date = new Date();
        const response = await axios.post('https://equran.id/api/v2/shalat', {
            provinsi,
            kabkota,
            bulan: date.getMonth() + 1,
            tahun: date.getFullYear()
        });

        if (response.data && response.data.code === 200) {
            const today = date.getDate();
            const monthlyJadwal = response.data.data.jadwal;
            const todayJadwal = monthlyJadwal.find(j => j.tanggal === today) || monthlyJadwal[0];

            // Map EQuran.id keys to Aladhan-style keys to maintain compatibility
            const timings = {
                Imsak: todayJadwal.imsak,
                Fajr: todayJadwal.subuh,
                Dhuhr: todayJadwal.dzuhur,
                Asr: todayJadwal.ashar,
                Maghrib: todayJadwal.maghrib,
                Isha: todayJadwal.isya,
                Sunrise: todayJadwal.terbit,
                Dhuha: todayJadwal.dhuha
            };

            return {
                success: true,
                timings,
                location: { provinsi, kabkota },
                meta: { timezone: 'Asia/Makassar' } // EQuran.id doesn't provide TZ, default to Makassar for now or derive from prov
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
        const surah = Math.floor(Math.random() * 114) + 1;
        const url = `https://equran.id/api/v2/surat/${surah}`;

        const response = await axios.get(url);
        if (response.data && response.data.code === 200) {
            const data = response.data.data;
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
                    terjemahan: await summarizeIslamicContent(ayat.teksIndonesia)
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
                        terjemahan: await summarizeIslamicContent(randomHadith.id)
                    }
                };
            }
        }
        throw new Error('API Error or Empty');
    } catch (e) {
        return getRandomAyat();
    }
}

async function getRandomContent() {
    if (Math.random() > 0.4) {
        return await getRandomAyat();
    } else {
        return await getRandomHadith();
    }
}

/**
 * Get Random Doa from EQuran.id
 */
async function getRandomDoa() {
    try {
        const response = await axios.get('https://equran.id/api/doa');
        if (response.status === 200 && response.data && response.data.data) {
            const doas = response.data.data;
            const randomDoa = doas[Math.floor(Math.random() * doas.length)];
            return {
                success: true,
                content: {
                    judul: randomDoa.nama,
                    arab: randomDoa.ar,
                    latin: randomDoa.tr,
                    terjemahan: randomDoa.idn
                }
            };
        }
        throw new Error('API Response Structure Error');
    } catch (e) {
        console.error(chalk.red('[RAMADAN] Doa API Error:'), e.message);
        return { success: false, error: e.message };
    }
}

export {
    getPrayerTimes,
    getRandomAyat,
    getRandomHadith,
    getRandomContent,
    getRandomDoa
};
