/**
 * Test Script for New APIs
 * Verifies if the extracted services actually work
 */
const { 
    chatWithShion, 
    textToSpeechNatural, 
    aiMultimedia 
} = require('./src/services/extraApiService');

const { 
    tiktokDl, 
    mediafireDl, 
    pinterestSearch 
} = require('./src/services/mediaDownloader');

const chalk = require('chalk');

async function runTests() {
    console.log(chalk.cyan('🚀 Memulai Pengetesan API Baru...\n'));

    // 1. Test Shion AI
    console.log(chalk.yellow('1. Testing Shion AI Chat...'));
    try {
        const shionRes = await chatWithShion('halo shion, siapa kamu?');
        console.log(chalk.green('✅ Shion Berhasil:'), shionRes.substring(0, 50) + '...');
    } catch (e) {
        console.log(chalk.red('❌ Shion Gagal:'), e.message);
    }

    // 2. Test TTS Natural (ElevenLabs)
    console.log(chalk.yellow('\n2. Testing TTS Natural (ElevenLabs)...'));
    try {
        const ttsRes = await textToSpeechNatural('Halo, ini adalah tes suara robot.');
        if (Buffer.isBuffer(ttsRes) && ttsRes.length > 1000) {
            console.log(chalk.green('✅ TTS Berhasil:'), `Menerima Buffer Audio (${ttsRes.length} bytes)`);
        } else {
            throw new Error("Respon bukan buffer audio yang valid");
        }
    } catch (e) {
        console.log(chalk.red('❌ TTS Gagal:'), e.message);
    }

    // 3. Test Pinterest Search
    console.log(chalk.yellow('\n3. Testing Pinterest Search...'));
    try {
        const pinRes = await pinterestSearch('cat aesthetic');
        if (pinRes && pinRes.length > 0) {
            console.log(chalk.green('✅ Pinterest Berhasil:'), `Menemukan ${pinRes.length} gambar. Contoh: ${pinRes[0].image}`);
        } else {
            throw new Error("Tidak ada hasil ditemukan");
        }
    } catch (e) {
        console.log(chalk.red('❌ Pinterest Gagal:'), e.message);
    }

    // 4. Test TikTok Downloader
    console.log(chalk.yellow('\n4. Testing TikTok Downloader...'));
    try {
        const ttUrl = 'https://vt.tiktok.com/ZS67LpUaK/'; // URL contoh (bisa mati sewaktu-waktu)
        const ttRes = await tiktokDl(ttUrl);
        if (ttRes.status && ttRes.data) {
            console.log(chalk.green('✅ TikTok Berhasil:'), `Judul: ${ttRes.title}`);
        } else {
            throw new Error("Gagal ambil data TikTok");
        }
    } catch (e) {
        console.log(chalk.red('❌ TikTok Gagal (Mungkin link mati/limit):'), e.message);
    }

    // 5. Test AI Image (Aritek)
    console.log(chalk.yellow('\n5. Testing AI Image...'));
    try {
        const imgRes = await aiMultimedia.generate('cyberpunk city neon lights', 'image');
        if (imgRes.success && imgRes.url) {
            console.log(chalk.green('✅ AI Image Berhasil:'), imgRes.url);
        } else {
            throw new Error(imgRes.error || "Gagal generate image");
        }
    } catch (e) {
        console.log(chalk.red('❌ AI Image Gagal:'), e.message);
    }

    console.log(chalk.cyan('\n🏁 Pengetesan Selesai.'));
}

runTests();
