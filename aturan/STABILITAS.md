# PANDUAN STABILITAS & STANDAR PROFESIONAL ABSENBOT

Dokumen ini adalah acuan utama untuk menjaga performa dan tampilan bot agar tetap stabil dan profesional. Setiap pengembang (termasuk AI) wajib mengikuti aturan ini.

## 1. STANDAR UI & PESAN
*   **Pesan Bersih:** Jangan pernah menyertakan daftar perintah fallback (misal: `• Perintah (Ketik: !cmd)`) di dalam badan pesan jika menggunakan tombol interaktif. Badan pesan harus fokus pada informasi inti.
*   **ViewOnce:** Semua pesan interaktif (tombol/list) **WAJIB** dibungkus dalam properti `viewOnce: true` di payload Baileys/Wileys agar tampilan tombol konsisten di berbagai perangkat.
*   **Link Terpisah:** Jangan memasukkan URL panjang di dalam badan pesan utama perintah `!cek`. Gunakan tombol "WEB" yang akan mengirimkan link secara terpisah via perintah `!webapp`.
*   **Footer Ringkas:** Hindari informasi ganda di footer jika sudah ada di header (misal: periode tanggal di `!cekapprove`).

## 2. ARSITEKTUR KODE & DEPENDENSI
*   **Library Utama:** Selalu gunakan `wileys` sebagai library WhatsApp socket, bukan `@adiwajshing/baileys` atau `@whiskeysockets/baileys`.
*   **Constructor Cache:** Gunakan library `node-cache` secara langsung: `new (require("node-cache"))()`.
*   **Modularitas Impor:** 
    *   `setBotSocket` diimpor dari `./services/scheduler`.
    *   `initAuthServer` diimpor dari `./services/secureAuth`.
    *   Jangan ada impor melingkar (*circular dependencies*).

## 3. IDENTIFIKASI USER (LID)
*   **Multi-Identifier:** Bot harus mendukung identifikasi user melalui nomor telepon asli (`628...`) dan **LID** (`185...`).
*   **Auto-Link:** Jika user mengirim pesan dengan ID baru (LID), bot harus mengecek kecocokan dengan data nomor telepon yang sudah ada dan menambahkannya ke array `identifiers` di database secara otomatis.
*   **Slugs:** Setiap user wajib memiliki `slug` yang unik (berdasarkan nama atau email) untuk keperluan integrasi Webapp.

## 4. PENANGANAN KONEKSI & ERROR
*   **Auto-Reconnect:** Jika koneksi terputus (Error 500 atau lainnya), bot harus mencoba melakukan koneksi ulang secara otomatis setiap 5 detik, kecuali jika statusnya adalah `loggedOut`.
*   **Detailed Logging:** Setiap *disconnect* harus mencetak alasan (*reason*) dan *stack trace* (jika ada) untuk memudahkan diagnosa.
*   **Admin Notification:** Error fatal harus dilaporkan ke nomor Admin yang terdaftar di `.env`.

## 5. FITUR KHUSUS
*   **Ramadan:** Fitur otomatis (Imsak/Subuh) harus dijalankan dengan hati-hati saat bot baru menyala agar tidak menyebabkan spam pesan lama.
*   **Countdown:** Perintah `!cek` harus selalu menyertakan hitung mundur hari gajian (Batch 2: tgl 24, Batch 3: tgl 15).

---
*Terakhir diperbarui: 3 Maret 2026*
