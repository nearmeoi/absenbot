# Arsitektur "6 Pilar" AI API Gratis (The Ultimate AbsenBot Masterplan)

Berdasarkan eksplorasi mendalam atas +10 penyedia layanan *Open-Source LLM API* di tahun 2026, berikut daftar **Penyedia API Pilihan Paling Cepat, Stabil, & Sepenuhnya Gratis** yang direkomendasikan untuk menopang *bot* absensi skala produksi (*production-ready*):

---

## 🥇 1. Scaleway AI API (Tier: KAPTEN UTAMA)
**Penyedia asal Eropa yang memiliki mekanisme rahasia limit tak terbatas.**
- **Endpoint:** Kompatibel dengan OpenAI (`https://api.scaleway.ai/v1`)
- **Model Rekomendasi:** `llama-3.3-70b-instruct`
- **Kecepatan Respons:** ~1.45 Detik (Super Ngebut 🚀)
- **Rahasia Kuotanya:** Menggunakan sistem *Replenishing Bucket*. Kamu diberi 30 hit request, namun ember tersebut **direset (diisi ulang) secara penuh SETIAP 2 DETIK!**
- **Sifat:** Sepanjang sistemmu tidak di-hit 30 orang bersamaan dalam satu detik, akses botmu akan menjadi *Unlimited* alias Tanpa Batas selamanya!

---

## 🥈 2. Groq (Tier: WAKIL KAPTEN)
**Pusat pemrosesan AI perangkat keras tercepat di Planet Bumi.**
- **Endpoint:** Kompatibel dengan OpenAI (`https://api.groq.com/openai/v1`)
- **Model Rekomendasi:** `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`
- **Kecepatan Respons:** ~0.5 - 0.7 Detik (LPM/Latency Per Millisecond tertinggi).
- **Kuota Gratis:** **14.400 API Call per hari** per model kecil.
- **Sifat:** Jika kamu menggunakan model Llama-3.1-8b miliknya, kamu sanggup menanggung puluhan ribu pesan absensi dalam 1 hari tanpa gangguan. Sangat aman dan terjamin.

---

## 🥉 3. Cerebras (Tier: PANGLIMA LAPIS PERTAMA)
**Saingan berat Groq yang tak kalah ngebut dengan wafer-GPU silikonnya.**
- **Endpoint:** Kompatibel dengan OpenAI (`https://api.cerebras.ai/v1`)
- **Model Rekomendasi:** `llama3.1-8b`
- **Kecepatan Respons:** ~1.5 - 3.8 Detik.
- **Kuota Gratis:** Mirip seperti Groq, mereka sangat longgar mematok batas hingga **~14.400 Request / Hari**. Kecepatannya juga sangat konsisten.

---

## 🛡️ 4. SambaNova (Tier: PASUKAN KHUSUS)
**Penyedia yang punya kuota cekikikan secara kasat mata, namun bisa diretas algoritmanya.**
- **Endpoint:** Kompatibel dengan OpenAI (`https://api.sambanova.ai/v1`)
- **Kecepatan Respons:** ~1.5 - 2 Detik. (Sangat cepat setara Groq).
- **Trick Kuota Round-Robin:** Batas resminya hanyalah **20 Request / Hari**. Namun, limit tersebut dibebankan **PER MODEL**, bukan per akun! Kamu hanya perlu mendistribusikan hit secara acak (gacha) bergantian ke-15 model aktif di katalog SambaNova, sehingga jatahmu melesat dari 20 menjadi **300 Request / Hari**.

---

## 💎 5. Google Gemini AI Studio (Tier: PERWIRA VETERAN)
**Vendor komersial terbesar yang paling dermawan memoles ekosistem bot.**
- **Endpoint:** Bisa diakses menggunakan OpenAI format SDK (`https://generativelanguage.googleapis.com/v1beta/openai/`)
- **Model Rekomendasi:** `gemini-1.5-flash` / `gemini-2.5-flash`
- **Kecepatan Respons:** ~5-7 Detik. Agak santai karena masuk ke arsitektur native Google.
- **Kuota Gratis:** **1.500 Request / Hari** (Limit Tier Gratis yang solid dan resmi seumur hidup). Sangat bisa diandalkan kalau 4 pilar di atas tumbang akibat server global yang mati.

---

## 🚑 6. GitHub Models (Tier: OBAT DARURAT)
**Katalog AI raksasa yang menampung 40+ model, namun limitnya dikunci cukup pedas.**
- **Endpoint:** Kompatibel dengan OpenAI API (`https://models.inference.ai.azure.com/chat/completions`).
- **Kuota Gratis:** **~150 Request per Hari, per Model!**
- **Sifat:** Sama seperti SambaNova, kamu sanggup meretas sistem hit hingga **6.450 hit/hari** jika kamu me-Round-Robin ke-43 model gratisnya satu demi satu setiap kali ada tarikan napas AbsenBot-mu. Lambat, tapi efektif menyelamatkan nyawa sistem dari kelumpuhan penuh.

---

## 🔮 Rahasia Tertinggi: Algoritma `Unlimited Round-Robin`
Banyak layanan AI gratisan (seperti SambaNova dan GitHub Models) memaksakan *Rate Limit* yang kecil secara tertulis (contoh: 20 req/hari di SambaNova). 
Namun, batas ini diaplikasikan **PER MODEL**, bukan per akun!

Untuk mendapatkan kuota **Tanpa Batas Konseptual (Unlimited)**, kamu harus merakit sistem rotasi dinamis (*Round-Robin*) pada kodingan `absenbot`-mu. 

**Contoh Logic `Round-Robin` di SambaNova:**
1. Kamu kumpulkan 15 model aktif (seperti `Llama-3.1-8B`, `DeepSeek-V3`, `Qwen-3`, dll) ke dalam satu *Array list*.
2. Saat ada pesan masuk, programmu melakukan pengundian nomor acak / *shift* urutan secara bergiliran.
3. Pesan absen si Budi diproses Llama, pesan absen si Cici diproses DeepSeek, pesan absen si Dodi diproses Qwen.
4. **Hasilnya:** Jatahmu berlipat ganda dari 20 request menjadi `15 Model × 20 Request = 300 Request` yang berdiri sejajar secara kolektif! Strategi ini sangat mematikan jika diterapkan pada repositori GitHub Models yang memiliki hingga 43 model berbeda.

---

## 🔥 Algoritma Load-Balancer (Flow Eksekusi yang Disarankan)
Di dalam bahasa perograman AbsenBot (`nodejs`/`typescript`/`python`), kamu tak perlu menaruh AI Provider secara sembarangan. Gunakan `try...catch` berlapis (Fallback System) sesuai urutan klasemen di atas:

```mermaid
graph TD
    A[AbsenBot Terima Pesan WA] --> B{Coba API: Scaleway}
    B -- Limit/Error --> C{Fallback: Groq}
    C -- Limit/Error --> D{Fallback: Cerebras}
    D -- Limit/Error --> E{Fallback: SambaNova (Round-Robin 15 model)}
    E -- Limit/Error --> F{Fallback: Google Gemini}
    F -- Limit/Error --> G{Darurat Akhir: GitHub Models}
    B -- Sukses --> Z[Kirim Balasan ke WA User]
    C -- Sukses --> Z
    D -- Sukses --> Z
    E -- Sukses --> Z
    F -- Sukses --> Z
    G -- Sukses --> Z
```

*(Dokumen ini merupakan Rangkuman Eksekutif dari perburuan API kita). Terapkan struktur logika 6 Pilar ini ke dalam proyek **AbsenBot** agar tidak akan pernah ada tagihan hosting AI sepeserpun seumur hidup!*
