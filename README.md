# 🤖 MagangHub AbsenBot v7.0 (AI Edition)

![Status](https://img.shields.io/badge/Status-Active-brightgreen) ![Version](https://img.shields.io/badge/Version-7.0.0-blue) ![Engine](https://img.shields.io/badge/Engine-Hybrid%20(Puppeteer%20%2B%20API)-orange) ![AI](https://img.shields.io/badge/AI-Groq%20Llama3-purple)

**Asisten pribadi otomatis untuk peserta MagangHub (Kemnaker).**
Bot ini dirancang untuk memastikan Anda **tidak pernah lupa absen**, bahkan saat Anda sangat sibuk atau ketiduran sekalipun.

---

## ✨ Fitur Unggulan (Killer Features)

### 🧠 1. AI Auto-Generate
Tidak tahu mau nulis laporan apa? Bot terintegrasi dengan **Groq AI (Llama-3)**. Cukup ketik `!preview`, bot akan membaca riwayat aktivitasmu selama 30 hari ke belakang dan membuatkan laporan baru yang relevan, profesional, dan lolos validasi karakter (min 100 char).

### 🛡️ 2. Emergency Auto-Submit (Penyelamat Nyawa)
Lupa absen sampai malam? Tenang.
Pada pukul **23:50 WIB**, sistem akan mengecek siapa yang belum absen. Jika Anda belum absen, bot akan **secara otomatis** membuatkan laporan menggunakan AI dan mengirimkannya ke web MagangHub demi menyelamatkan uang saku Anda.

### 🚀 3. Hybrid Engine
Menggunakan kombinasi cerdas:
- **API Mode:** Super cepat (detik) untuk submit laporan rutin.
- **Browser Mode (Puppeteer):** Fallback otomatis jika sesi habis, bot akan membuka browser di latar belakang, login ulang, dan mengambil sesi baru.

### 🔐 4. Keamanan Data
- Login dilakukan via Web Portal aman (tidak kirim password di chat WA).
- Support **LID (Linked Device)** WhatsApp.

---

## 📱 Panduan Pengguna (User Guide)

### 1️⃣ Registrasi (Pertama Kali)
Sebelum menggunakan bot, Anda wajib mendaftarkan akun SiapKerja Anda.

1.  Ketik **`!daftar`** di chat pribadi bot atau grup.
2.  Bot akan mengirimkan **Link Registrasi Aman** ke chat pribadi Anda.
3.  Buka link tersebut, masukkan **Email** dan **Password** (Akun SiapKerja/MagangHub).
4.  Jika sukses, Anda akan mendapat notifikasi di WhatsApp.

> **Catatan:** Password Anda disimpan hanya untuk keperluan login otomatis bot ke website MagangHub.

### 2️⃣ Cara Absen Harian
Ada dua cara untuk melakukan absen:

#### 🅰️ Cara Manual (Ketik Sendiri)
Gunakan format berikut (Copy-Paste dari pesan bot):
```text
!absen [LAPORAN MAGANGHUB]

Aktivitas: 
(Isi detail aktivitas hari ini, minimal 100 karakter)

Pembelajaran: 
(Apa yang dipelajari, minimal 100 karakter)

Kendala: 
(Jika ada kendala, atau tulis tidak ada, minimal 100 karakter)
```
⚠️ **Penting:** Pastikan setiap kolom berisi minimal **100 karakter** agar tidak ditolak sistem MagangHub.

#### 🅱️ Cara AI (Otomatis & Santai)
Biarkan AI yang berpikir untuk Anda.
1. Ketik **`!preview`**
   Bot akan membuatkan draf laporan berdasarkan riwayat kerja Anda.
2. Baca drafnya. Jika sudah oke, ketik **`!buatkan`**
3. Selesai! Laporan terkirim.

### 3️⃣ Perintah Lainnya
| Perintah | Fungsi |
| :--- | :--- |
| `!cekabsen` | Mengecek apakah hari ini sudah absen atau belum (langsung ke server). |
| `!riwayat [hari]` | Melihat riwayat laporan Anda (contoh: `!riwayat 3` untuk 3 hari terakhir). |
| `!ingatkan` | (Grup Only) Men-tag semua peserta yang belum absen hari ini. |
| `!listuser` | Melihat daftar peserta yang terdaftar di bot ini. |
| `!hapus` | Menghapus akun Anda dari database bot. |

---

## ⚙️ Instalasi & Deployment (Untuk Admin)

Bot ini mendukung **Termux (Android)**, **Windows**, **Linux**, dan **macOS** secara native.

### Persyaratan
- Node.js v18+
- Koneksi Internet Stabil
- Akun Google Chrome (untuk Puppeteer)
- **Groq API Key** (Gratis, ambil di [console.groq.com](https://console.groq.com))

### Cara Install

1. **Clone Repository**
   ```bash
   git clone https://github.com/username/absenbot.git
   cd absenbot
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment**
   Salin file `.env.example` menjadi `.env` dan isi data:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Isi variabel penting:
   ```env
   GROQ_API_KEY=gsk_your_key_here...
   SESSION_TIMEOUT_MS=86400000
   ```

4. **Jalankan Bot**
   ```bash
   npm start
   ```
   Atau untuk deployment background (PM2/Screen):
   ```bash
   # Opsi 1: Menggunakan Script Deploy (Auto Restart)
   bash deploy.sh

   # Opsi 2: Manual
   node index.js
   ```

5. **Scan QR Code**
   Scan QR code yang muncul di terminal menggunakan WhatsApp Anda (Tautkan Perangkat).

### Struktur Folder Penting
- `SesiWA/` : Menyimpan sesi login WhatsApp (JANGAN DIHAPUS jika tidak ingin scan ulang).
- `sessions/` : Menyimpan cookies login MagangHub user.
- `users.json` : Database user (Email/Pass). **Jaga kerahasiaan file ini.**
- `logs/` : Log aktivitas harian user hasil scraping.

---

## ⚠️ Troubleshooting

**Q: Bot tidak merespon `!absen` saya?**
A: Cek format teks. Pastikan tulisan "Aktivitas:", "Pembelajaran:", dan "Kendala:" ada dan menggunakan titik dua. Jangan lupa minimal 100 karakter.

**Q: `!preview` error atau gagal?**
A: Pastikan API Key Groq di `.env` valid dan kuota API belum habis.

**Q: Bot sering mati di Termux?**
A: Android sering mematikan proses background. Gunakan aplikasi "Termux:Boot" atau matikan optimasi baterai untuk Termux.

---

**Dibuat dengan ❤️ oleh Tim MagangHub**
*Disclaimer: Bot ini adalah alat bantu. Pengguna tetap bertanggung jawab atas kebenaran isi laporan mereka.*
