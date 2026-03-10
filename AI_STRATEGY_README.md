# Dokumentasi Strategi AI - AbsenBot (Update Maret 2026)

Dokumen ini merangkum konfigurasi dan aturan gaya bahasa AI yang telah diimplementasikan untuk meningkatkan stabilitas dan kualitas laporan user.

## 1. Arsitektur Fallback AI
Sistem menggunakan tiga lapis penyedia AI untuk memastikan ketersediaan layanan 24/7:
1.  **Primary (OpenRouter):** Digunakan untuk kecerdasan maksimal dan pemahaman konteks yang dalam.
2.  **Secondary/Fallback (GitHub Models - GPT-4o-Mini):** Digunakan jika OpenRouter limit atau sibuk. Memiliki kuota harian besar (150-450 req/hari).
3.  **Tertiary (Groq):** Benteng terakhir jika kedua layanan di atas gagal.

## 2. Aturan Gaya Bahasa (Human-Like Prompting)
Laporan yang dihasilkan AI wajib mengikuti standar "Manusiawi" agar tidak terdeteksi sebagai bot dan mudah diterima oleh mentor:

### A. Penggunaan Kata Kerja (Me-)
- **Wajib:** Menggunakan awalan "Me-" untuk setiap aktivitas (contoh: *Melanjutkan*, *Mengecek*, *Menyusun*, *Membersihkan*).
- **Dilarang:** Menggunakan kata dasar atau perintah (contoh: *Lanjut*, *Cek*, *Susun*, *Bersihkan*).

### B. Daftar Larangan Kata (Anti AI-Isms)
Dilarang keras menggunakan kata-kata "template" AI berikut:
- "Guna memastikan..."
- "Demi meningkatkan..."
- "Langkah krusial..."
- "Sangat penting bagi saya..."
- "Optimal", "Efisien", "Efektif".
- "Berkomitmen untuk..."

### C. Tingkat Teknis (Luwes)
- Hindari jargon teknis yang terlalu dalam (seperti "glTF parser", "API logic").
- Gunakan bahasa kerja umum (contoh: "Memperbaiki tampilan objek 3D" lebih baik daripada "Debugging glTF rendering").

## 3. Fitur Auto-Context
AI akan secara otomatis mendeteksi bidang pekerjaan user (Tata Boga, Perhotelan, IT, Administrasi, dll) berdasarkan **Riwayat Laporan (History)**. AI akan menyesuaikan terminologi alat dan bahan sesuai dengan dunia kerja user tersebut.

## 4. Konfigurasi Karakter
- **Panjang Laporan:** Minimal 110 karakter, Maksimal 140 karakter per bagian (Aktivitas, Pembelajaran, Kendala).
- **Gaya:** To-the-point, Jujur, Teknis (ringan), dan Padat.

---
*Dokumen ini dibuat otomatis oleh Gemini CLI sebagai catatan permanen sistem AI AbsenBot.*
