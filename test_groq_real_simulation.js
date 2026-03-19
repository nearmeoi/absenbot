const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const chalk = require('chalk');

const API_KEY = process.env.GROQ_API_KEY;

// RIWAYAT ASLI AKMAL (Hasil Fetch Tadi)
const REAL_HISTORY = [
    { date: '2026-03-09', activity_log: 'Mengecek lab GO untuk memastikan bahwa semua peralatan dalam keadaan baik dan siap digunakan nantinya ketika dibutuhkan.' },
    { date: '2026-03-10', activity_log: 'Membantu di bagian lab karena akan digunakan, saya melakukan beberapa tugas untuk memastikan lab siap digunakan, termasuk memeriksa peralatan dan fasilitas lab.' },
    { date: '2026-03-11', activity_log: 'Memenuhi panggilan proyek website untuk visualisasi data SIGAP PKM, di mana deadline proyek adalah tanggal 13 April. Proyek ini bertujuan untuk mengembangkan sebuah web yang dapat menampilkan data secara efektif.' },
    { date: '2026-03-12', activity_log: 'Meberdiskusi dengan tim tentang implementasi fitur GIS pada web SIGAP dan melakukan serangkaian pengujian untuk memastikan fungsionalitas peta interaktif berjalan dengan baik.' }
];

const USER_CONTEXT = "Akmal: Web Developer (Fullstack). Fokus pada pengembangan WebVR dan proyek visualisasi data SIGAP PKM (Fase Awal/Research).";

async function testGroqRealSimulation() {
    console.log(chalk.cyan('🚀 SIMULASI GROQ DENGAN RIWAYAT ASLI AKMAL'));

    let contextText = 'RIWAYAT TERAKHIR:\n';
    REAL_HISTORY.forEach(log => { contextText += `- ${log.date}: ${log.activity_log}\n`; });

    const systemPrompt = `Kamu adalah Asisten Penulis Laporan Magang Profesional.
    TUGAS: Buatkan laporan yang merupakan KELANJUTAN LOGIS dari riwayat dan profil user.
    
    ANALISIS INPUT:
    1. PROFIL USER: ${USER_CONTEXT}
    2. RIWAYAT: (Lihat di bawah).
    
    PRINSIP PENULISAN:
    - Lanjutkan progress dari aktivitas terakhir secara bertahap dan logis.
    - FOKUS HARI INI: Melanjutkan pengembangan fitur GIS atau pengolahan data untuk SIGAP PKM.
    - Pastikan tone bahasa profesional dan deskriptif (minimal 110 karakter per bagian).
    - WAJIB MULAI SETIAP KALIMAT DENGAN KATA KERJA BERAWALAN 'Me-'.
    - Format HANYA:
    AKTIVITAS: [isi]
    PEMBELAJARAN: [isi]
    KENDALA: [isi]`;

    const userPrompt = `${contextText}\n\nBerdasarkan riwayat asli di atas, buatkan laporan untuk hari esok yang logis. Fokus pada tahap teknis GIS atau integrasi database untuk SIGAP.`;

    try {
        console.log(chalk.yellow('... Meminta respon dari Groq ...'));
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.65,
            max_tokens: 1000
        }, {
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
            timeout: 25000
        });

        const result = response.data.choices[0]?.message?.content;
        console.log(chalk.green('\n✨ HASIL GENERATE GROQ (DATA ASLI):'));
        console.log(chalk.white(result));

        console.log(chalk.cyan('\n📊 ANALISIS AKURASI:'));
        const resLower = result.toLowerCase();
        if (resLower.includes('sigap') || resLower.includes('gis') || resLower.includes('peta')) {
            console.log(chalk.blue('- [PASS] Sangat Akurat: AI tetap fokus pada proyek SIGAP PKM & GIS.'));
        } else {
            console.log(chalk.red('- [FAIL] Melamun: AI kehilangan konteks proyek SIGAP.'));
        }

    } catch (err) {
        console.error(chalk.red('❌ Gagal simulasi:'), err.message);
    }
}

testGroqRealSimulation();
