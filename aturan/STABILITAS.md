# PANDUAN STABILITAS & STANDAR PROFESIONAL ABSENBOT

Dokumen ini adalah acuan utama untuk menjaga performa, tampilan, dan logika bot agar tetap stabil dan profesional. Setiap pengembang (termasuk AI) wajib mengikuti aturan ini dengan ketat.

## 1. STANDAR UI & FORMAT PESAN
*   **Pesan Bersih (Clean UI):** Jangan pernah menyertakan daftar perintah fallback (misal: `• Perintah (Ketik: !cmd)`) di dalam badan pesan jika menggunakan tombol interaktif. Badan pesan harus fokus pada informasi inti.
*   **ViewOnce:** Semua pesan interaktif (tombol/list) **WAJIB** dibungkus dalam properti `viewOnce: true` agar tampilan tombol konsisten di berbagai perangkat.
*   **Link Terpisah:** Jangan memasukkan URL panjang di dalam badan pesan utama perintah `!cek`. Gunakan tombol "WEB" yang akan mengirimkan link secara terpisah via perintah `!webapp`.
*   **Footer Ringkas:** Hindari informasi ganda di footer jika sudah ada di header (misal: periode tanggal di `!cekapprove`).
*   **Formatting Riwayat:** Gunakan garis pemisah `━━━━━━━━━━━━━━━━━━` dan cetak tebal tanggal serta label (Aktivitas, Pembelajaran, Kendala) untuk keterbacaan yang baik.
*   **Emoji:** Gunakan emoji secara proporsional di awal header atau poin penting untuk memberikan kesan ramah namun profesional.

## 2. STANDAR LOGIKA AI (Groq/Gemini)
*   **Multi-Engine Fallback:** Selalu prioritaskan Groq (Llama 3), gunakan Gemini 1.5 Flash sebagai cadangan pertama, dan Blackbox sebagai cadangan terakhir.
*   **Refinement & Expansion:**
    *   Setiap draf laporan harus melalui tahap *Refinement* untuk memastikan akurasi dan menghindari halusinasi.
    *   Jika input user terlalu pendek, gunakan instruksi *Expansion* untuk mencapai minimal 110-150 karakter per bagian (Aktivitas, Pembelajaran, Kendala).
    *   **DILARANG** menggunakan kalimat klise/lebay seperti "tidak menyurutkan semangat" atau "solusi terbaik". Gunakan gaya bahasa profesional, teknis, dan *to-the-point*.
*   **Parsing:** Gunakan regex yang aman (tanpa backslash berlebihan) dengan fallback pencarian baris demi baris jika regex gagal mengekstrak bagian laporan.

## 3. IDENTIFIKASI USER & DATABASE
*   **Multi-Identifier (LID Support):** Bot harus mengenali user lewat nomor telepon (`628...`) dan **LID** (`185...`). Keduanya disimpan dalam array `identifiers`.
*   **Auto-Link:** Saat pesan masuk dari ID baru, jika cocok dengan data user yang ada, tambahkan ID tersebut ke database secara otomatis.
*   **Slugs:** Setiap user wajib memiliki `slug` unik. URL Web App harus menggunakan format `?u=slug` demi keamanan dan estetika.
*   **Cycle Day:** Siklus absensi (24 atau 15) harus terdeteksi secara otomatis saat pertama kali user melakukan `!cekapprove` jika belum ada di DB.

## 4. PENANGANAN KONEKSI & KINERJA
*   **Library Utama:** Wajib gunakan `wileys` (Baileys Fork). Jangan gunakan library orisinal yang tidak kompatibel dengan fitur tombol saat ini.
*   **Queue Browser:** Gunakan `BrowserQueue` untuk memastikan hanya ada **SATU** instance Puppeteer yang berjalan di satu waktu demi menghemat RAM VPS.
*   **Caching:** Data dashboard (`getDashboardStats`) harus di-*cache* selama 2 jam untuk mempercepat respon perintah `!cekapprove`.
*   **Auto-Reconnect:** Jika koneksi terputus (Error 500), coba sambung ulang setiap 5 detik secara otomatis kecuali jika `loggedOut`.

## 5. KEAMANAN & PRIVASI
*   **Grup vs Japri:** 
    *   Instruksi pengisian (`!absen` tanpa argumen) dan draf laporan **WAJIB** dikirim lewat chat pribadi (Japri) meskipun dipicu dari grup.
    *   Jangan membocorkan email atau password user di dalam chat grup.
*   **Credential Protection:** Jangan pernah melakukan log pada password atau token sesi di console output.

---
*Terakhir diperbarui: 3 Maret 2026*
