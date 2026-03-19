const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const chalk = require('chalk');

const API_KEY = process.env.GROQ_API_KEY;

// Simulasi Riwayat Nyata (Diambil dari memori bot tentang 'Mal' atau 'Kado')
const MOCK_HISTORY = [
    { date: '2026-03-08', activity_log: 'Melakukan riset dan analisis awal terhadap struktur dashboard Monev Poltekpar Makassar serta memetakan alur autentikasi SSO.' },
    { date: '2026-03-09', activity_log: 'Mengimplementasikan modul Direct Login untuk mempercepat proses autentikasi tanpa melalui Puppeteer secara penuh.' },
    { date: '2026-03-10', activity_log: 'Melakukan perbaikan pada logika penanganan session expired dan mengoptimalkan ekstraksi token dari URL hash dashboard.' },
    { date: '2026-03-11', activity_log: 'Mengintegrasikan Trinity Engine dari OpenRouter ke dalam sistem AbsenBot untuk meningkatkan stabilitas layanan AI.' }
];

const USER_CONTEXT = "Seorang Pengembang Perangkat Lunak (Software Engineer) yang sedang magang di Poltekpar Makassar, fokus pada otomatisasi bot absensi dan integrasi API AI.";

async function testGroqGeneration() {
    console.log(chalk.cyan('🚀 MEMULAI SIMULASI GENERATE LAPORAN DENGAN GROQ (LLAMA 3.3 70B)'));

    let contextText = 'RIWAYAT TERAKHIR:\n';
    MOCK_HISTORY.forEach(log => { contextText += `- ${log.date}: ${log.activity_log}\n`; });

    const systemPrompt = `Kamu adalah Asisten Penulis Laporan Magang Profesional.
    TUGAS: Buatkan laporan yang merupakan KELANJUTAN LOGIS dari riwayat dan profil user.
    
    ANALISIS INPUT:
    1. PROFIL USER: ${USER_CONTEXT}
    2. RIWAYAT: (Lihat di bawah).
    
    PRINSIP PENULISAN:
    - Lanjutkan progress dari aktivitas terakhir secara bertahap dan logis.
    - Pastikan tone bahasa profesional dan deskriptif (minimal 110 karakter per bagian).
    - WAJIB MULAI SETIAP KALIMAT DENGAN KATA KERJA BERAWALAN 'Me-'.
    - Format HANYA:
    AKTIVITAS: [isi]
    PEMBELAJARAN: [isi]
    KENDALA: [isi]`;

    const userPrompt = `${contextText}\n\nBerdasarkan riwayat di atas, buatkan laporan untuk langkah selanjutnya (hari ini) yang LOGIS. Fokus pada pengujian atau penyempurnaan fitur yang baru saja diintegrasikan.`;

    try {
        console.log(chalk.yellow('... Meminta respon dari Groq ...'));
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.6,
            max_tokens: 1000
        }, {
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
            timeout: 20000
        });

        const result = response.data.choices[0]?.message?.content;
        console.log(chalk.green('\n✨ HASIL GENERATE GROQ:'));
        console.log(chalk.white(result));

        // Analisis Sederhana
        console.log(chalk.cyan('\n📊 ANALISIS KUALITAS:'));
        if (result.includes('Me-')) console.log(chalk.blue('- [PASS] Menggunakan prefix "Me-".'));
        if (result.length > 300) console.log(chalk.blue('- [PASS] Panjang karakter memadai.'));
        if (result.toLowerCase().includes('trinity') || result.toLowerCase().includes('engine') || result.toLowerCase().includes('stabilitas')) {
            console.log(chalk.blue('- [PASS] Nyambung dengan riwayat terakhir (Context Awareness).'));
        } else {
            console.log(chalk.red('- [FAIL] Hasil "Melamun" (Tidak nyambung dengan riwayat terakhir).'));
        }

    } catch (err) {
        console.error(chalk.red('❌ Gagal simulasi:'), err.message);
    }
}

testGroqGeneration();
