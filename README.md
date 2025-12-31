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

## 🗺️ Alur Penggunaan Lengkap (User Journey)

Jika kamu baru pertama kali menggunakan bot ini, ikuti langkah-langkah berikut:

### **Langkah 1: Registrasi Akun (`!daftar`)**
Ini adalah tahap awal agar bot mengenali akun MagangHub milikmu.
1.  **Ketik `!daftar`** di grup atau chat pribadi bot.
2.  Bot akan mengirimkan **Link Khusus** ke Chat Pribadi (PC) kamu.
3.  **Buka link tersebut** di browser HP/Laptop. Kamu akan melihat halaman login yang aman.
4.  Masukkan **Email** dan **Password** yang kamu gunakan di website MagangHub/SiapKerja.
5.  Klik **Login**. Bot akan memverifikasi akunmu. Jika berhasil, bot akan mengirim pesan: *"Registrasi Berhasil!"*

### **Langkah 2: Memilih Cara Absen**
Setelah terdaftar, kamu punya dua pilihan cara untuk absen setiap harinya:

#### **Opsi A: Cara Manual (Jika ingin menulis sendiri)**
1.  Ketik **`!absen`**.
2.  Bot akan mengirimkan **Template Laporan**.
3.  **Salin (Copy)** template tersebut, lalu isi bagian Aktivitas, Pembelajaran, dan Kendala.
4.  **Kirim (Send)** kembali template yang sudah diisi.
    *   *Penting:* Setiap kolom harus diisi minimal **100 karakter** (sekitar 2-3 kalimat panjang).
5.  Bot akan memproses. Jika sukses, bot akan mengirimkan tanda centang (✅) atau foto bukti screenshot.

#### **Opsi B: Cara AI (Jika sedang malas mikir/sibuk)**
1.  Ketik **`!preview`**.
2.  Bot akan berpikir sejenak (menggunakan AI) dan membuatkan draf laporan berdasarkan apa yang sering kamu kerjakan sebelumnya.
3.  **Baca drafnya.** Jika kamu merasa laporannya sudah pas:
4.  Ketik **`!buatkan`**.
5.  Bot akan langsung mengirimkan laporan tersebut ke website MagangHub secara otomatis.

### **Langkah 3: Memastikan Keberhasilan (`!cekabsen`)**
Untuk memastikan laporanmu benar-benar sudah masuk ke server Kemnaker:
1.  Ketik **`!cekabsen`**.
2.  Bot akan mengecek langsung ke website.
3.  Jika sudah masuk, bot akan menampilkan ringkasan laporanmu hari ini. Jika belum, bot akan memberitahu bahwa kamu belum absen.

### **Langkah 4: Melihat Riwayat (`!riwayat`)**
Jika kamu ingin melihat apa saja yang sudah kamu kerjakan di hari-hari sebelumnya:
1.  Ketik **`!riwayat 3`** (untuk melihat 3 hari terakhir).
2.  Bot akan menampilkan daftar aktivitasmu secara rapi.

### **Fitur Penyelamat: Jika Kamu Lupa Total**
Bot ini punya "Safety Net" (Jaring Pengaman):
*   **Jam 18:00, 20:00, & 22:00:** Bot akan men-tag namamu di grup jika kamu belum absen.
*   **Jam 23:50 (Emergency):** Jika sampai jam ini kamu masih belum absen, bot akan secara otomatis melakukan **Langkah 2 (Opsi B)** untukmu. Bot akan men-generate laporan AI dan men-submit-nya agar uang sakumu tidak terpotong. Kamu akan mendapat notifikasi bahwa bot telah "menyelamatkan" absenmu.

---

## 📱 Referensi Perintah Cepat

| Perintah | Fungsi |
| :--- | :--- |
| `!daftar` | Registrasi akun awal. |
| `!absen` | Minta template absen manual. |
| `!preview` | Minta AI buatkan draf laporan. |
| `!buatkan` | Setujui dan kirim draf dari AI. |
| `!cekabsen` | Cek status apakah laporan sudah masuk server. |
| `!riwayat [hari]` | Lihat riwayat laporan (contoh: `!riwayat 3`). |
| `!ingatkan` | (Grup Only) Men-tag semua peserta yang belum absen. |
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