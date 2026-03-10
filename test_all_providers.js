/**
 * MASSIVE BATCH TEST FOR ALL EXTRACTED APIS
 */
const axios = require('axios');
const chalk = require('chalk');

async function test(name, fn) {
    process.stdout.write(chalk.yellow(`Testing ${name}... `));
    try {
        await fn();
        console.log(chalk.green('✅ BERHASIL'));
    } catch (e) {
        console.log(chalk.red('❌ GAGAL:'), e.message);
    }
}

async function runAllTests() {
    console.log(chalk.cyan('🚀 MEMULAI PENGETESAN MASSAL SEMUA API\n'));

    // --- KATEGORI AI ---
    await test('AI Shion (Roleplay)', async () => {
        const res = await axios.get('https://zelapioffciall.koyeb.app/ai/shion?text=halo');
        if (!res.data.status) throw new Error("Status False");
    });

    await test('AI Lyrra (Custom AI)', async () => {
        const res = await axios.get('https://api.lyrra.my.id/api/ai/lyrra?q=halo');
        if (res.status !== 200) throw new Error(res.status);
    });

    await test('AI Zelapi (General)', async () => {
        const res = await axios.get('https://zelapioffciall.koyeb.app/ai/gpt?text=halo');
        if (!res.data.status) throw new Error("Status False");
    });

    await test('AI Image (Aritek v3)', async () => {
        // Menggunakan token yang didekripsi tadi
        const token = 'hbMcgZLlzvghRlLbPcTbCpfcQKM0PcU0zhPcTlOFMxBZ1oLmruzlVp9remPgi0QWP0QW'
            .split('').map(c => /[a-z]/.test(c) ? String.fromCharCode((c.charCodeAt(0) - 97 - 3 + 26) % 26 + 97) : /[A-Z]/.test(c) ? String.fromCharCode((c.charCodeAt(0) - 65 - 3 + 26) % 26 + 65) : c).join('');
        const res = await axios.post('https://text2video.aritek.app/text2img', `prompt=cat&token=${token}`, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (!res.data.url) throw new Error("No URL returned");
    });

    // --- KATEGORI DOWNLOADER ---
    await test('Pinterest Scraper (V2)', async () => {
        const res = await axios.get('https://www.pinterest.com/resource/BaseSearchResource/get/', {
            params: { source_url: '/search/pins/?q=anime', data: JSON.stringify({ options: { query: 'anime', scope: 'pins' }, context: {} }) }
        });
        if (!res.data.resource_response) throw new Error("No response body");
    });

    await test('TikTok Downloader (TikWM)', async () => {
        const res = await axios.post('https://www.tikwm.com/api/', null, {
            params: { url: 'https://www.tiktok.com/@neardev/video/1', web: 1 }
        });
        if (res.status !== 200) throw new Error(res.status);
    });

    await test('YouTube Search (YT-Search)', async () => {
        const yts = require('yt-search');
        const res = await yts('sholawat');
        if (!res.videos || res.videos.length === 0) throw new Error("No videos found");
    });

    // --- KATEGORI UPLOADER ---
    await test('Catbox Moe API', async () => {
        const res = await axios.get('https://catbox.moe/');
        if (res.status !== 200) throw new Error("Site Down");
    });

    await test('Uguu.se API', async () => {
        const res = await axios.get('https://uguu.se/');
        if (res.status !== 200) throw new Error("Site Down");
    });

    // --- KATEGORI TOOLS & INFO ---
    await test('Jadwal Sholat API', async () => {
        const res = await axios.get('https://api.myquran.com/v2/sholat/jadwal/1638/2026/03/09');
        if (res.status !== 200) throw new Error(res.status);
    });

    await test('News CNN (Dhn-Api)', async () => {
        const res = await axios.get('https://news-api-zhirrr.vercel.app/api/cnn-news');
        if (res.status !== 200) throw new Error(res.status);
    });

    console.log(chalk.cyan('\n🏁 SEMUA PENGETESAN SELESAI.'));
}

runAllTests();
