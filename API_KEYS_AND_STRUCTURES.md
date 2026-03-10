# Arsitektur "6 Pilar" AI API Gratis & Manajemen Kredensial

Dokumen ini adalah "Buku Suci" (*Masterplan*) untuk arsitektur *Artificial Intelligence Load Balancer* proyek **AbsenBot**. Semua rahasia *Rate Limits*, struktur *Endpoint*, dan **API Key** disimpan di sini sebagai *backup* agar mudah diakses langsung dari VPS.

---

## 🥇 1. Scaleway AI API (KAPTEN UTAMA)
**Rahasia:** Limit 30 request yang **direset penuh SETIAP 2 DETIK!** Akses konseptual tanpa batas seumur hidup.

- **API Key:** `REDACTED_SCALEWAY_KEY`
- **Base URL:** `https://api.scaleway.ai/v1`
- **Endpoint:** `/chat/completions` (OpenAI Compatible)
- **Model Andalan (Gunakan Arrays untuk Gacha):** 
  `["llama-3.3-70b-instruct", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instruct", "mistral-nemo-instruct-2407", "gemma-3-27b-it", "mistral-small-3.2-24b-instruct-2506", "pixtral-12b-2409"]`
- **Contoh Konfigurasi (JS/TS):**
  ```javascript
  const models = ["llama-3.3-70b-instruct", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instruct", "mistral-nemo-instruct-2407", "gemma-3-27b-it"];
  const randomModel = models[Math.floor(Math.random() * models.length)];
  const client = new OpenAI({
    apiKey: "REDACTED_SCALEWAY_KEY",
    baseURL: "https://api.scaleway.ai/v1"
  });
  ```

---

## 🥈 2. Groq (WAKIL KAPTEN)
**Rahasia:** Kecepatan paripurna (tercepat di dunia) dengan kuota harian super tangguh (14.400 Req/Hari).

- **API Key:** `REDACTED_GROQ_KEY`
- **Base URL:** `https://api.groq.com/openai/v1`
- **Endpoint:** `/chat/completions` (OpenAI Compatible)
- **Model Andalan (Gunakan Arrays untuk Gacha):** `["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "deepseek-r1-distill-llama-70b", "gemma2-9b-it"]`
- **Contoh Konfigurasi (JS/TS):**
  ```javascript
  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "deepseek-r1-distill-llama-70b", "gemma2-9b-it"];
  const randomModel = models[Math.floor(Math.random() * models.length)];
  const client = new OpenAI({
    apiKey: "REDACTED_GROQ_KEY",
    baseURL: "https://api.groq.com/openai/v1"
  });
  ```

---

## 🥉 3. SambaNova (PANGLIMA LAPIS PERTAMA)
**Rahasia:** Meretas limit 20 req/hari menjadi **300 req/hari** menggunakan metode *Rotasi Dinamis (Round-Robin)* memanggil 15 model bergantian. *Model 70B-grade* nya sangat cerdas dan manusiawi.

- **API Key:** `REDACTED_SAMBANOVA_KEY`
- **Base URL:** `https://api.sambanova.ai/v1`
- **Endpoint:** `/chat/completions` (OpenAI Compatible)
- **Model Andalan (Gunakan Arrays untuk Gacha):**
  `["Meta-Llama-3.1-8B-Instruct", "Meta-Llama-3.3-70B-Instruct", "DeepSeek-R1-Distill-Llama-70B"]`
- **Contoh Konfigurasi (JS/TS):**
  ```javascript
  const models = ["Meta-Llama-3.1-8B-Instruct", "Meta-Llama-3.3-70B-Instruct", "DeepSeek-R1-Distill-Llama-70B"];
  const randomModel = models[Math.floor(Math.random() * models.length)];
  const client = new OpenAI({
    apiKey: "REDACTED_SAMBANOVA_KEY",
    baseURL: "https://api.sambanova.ai/v1"
  });
  ```

---

## 🛡️ 4. GitHub Models (PASUKAN KHUSUS)
**Rahasia:** Memecah limit ~150 hit dengan me-rotasi 43 Model Gratisan dari Microsoft. Model GPT-4o-Mini di dalamnya sangat handal dan *human-like*.

- **API Key:** `(Isi dengan GitHub Personal Access Token milikmu)`
- **Base URL:** `https://models.inference.ai.azure.com`
- **Endpoint:** `/chat/completions` (OpenAI Compatible)
- **Model Andalan (Gunakan Arrays untuk Gacha):** `["gpt-4o-mini", "Cohere-command-r", "AI21-Jamba-1.5-Mini", "Mistral-small", "Llama-3.2-11B-Vision-Instruct"]`
- **Contoh Konfigurasi (JS/TS):**
  ```javascript
  const models = ["gpt-4o-mini", "Cohere-command-r", "AI21-Jamba-1.5-Mini", "Mistral-small", "Llama-3.2-11B-Vision-Instruct"];
  const randomModel = models[Math.floor(Math.random() * models.length)];
  const client = new OpenAI({
    apiKey: process.env.GITHUB_PAT,
    baseURL: "https://models.inference.ai.azure.com"
  });
  ```

---

## 💎 5. Google Gemini AI Studio (PERWIRA VETERAN)
**Rahasia:** Kuota pasti 1.500 Req/Hari. Menggunakan titik kumpul yang 100% kompatibel dengan *OpenAI SDK* secara tersembunyi.

- **API Key:** `REDACTED_GEMINI_KEY`
- **Base URL:** `https://generativelanguage.googleapis.com/v1beta/openai/`
- **Endpoint:** `/chat/completions` (Bisa pakai library OpenAI langsung)
- **Model Andalan (Gunakan Arrays untuk Gacha):** `["gemini-1.5-flash", "gemini-1.5-flash-8b"]`
- **Contoh Konfigurasi (JS/TS):**
  ```javascript
  const models = ["gemini-1.5-flash", "gemini-1.5-flash-8b"];
  const randomModel = models[Math.floor(Math.random() * models.length)];
  const client = new OpenAI({
    apiKey: "REDACTED_GEMINI_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  });
  ```

---

## 🚑 6. Cerebras (OBAT DARURAT TERAKHIR)
**Rahasia:** Berkecepatan dewa tapi modelnya (Llama 3.1 8B) bodoh dan kerap kali halusinasi/salah memformat jawaban panjang dibanding GPT/DeepSeek. Disimpan hanya jika kelima model jenius di atas mati.

- **API Key:** `REDACTED_CEREBRAS_KEY`
- **Base URL:** `https://api.cerebras.ai/v1`
- **Endpoint:** `/chat/completions` (OpenAI Compatible)
- **Model Andalan:** `llama3.1-8b`
- **Contoh Konfigurasi (JS/TS):**
  ```javascript
  const client = new OpenAI({
    apiKey: "REDACTED_CEREBRAS_KEY",
    baseURL: "https://api.cerebras.ai/v1"
  });
  ```

---

## 🔥 Algoritma Load-Balancer (Flow Eksekusi yang Disarankan)
Gunakan pendekatan `try...catch` berlapis (*Waterfall Fallback*) pada bahasa pemrograman *bot*-mu untuk menjamin stabilitas 100%:

```javascript
async function getAIResponse(prompt) {
  try {
    return await callScaleway(prompt); // 🥇 1. Llama-3.3-70B (Paling Sintesis & Manusiawi, 2.60s)
  } catch (e1) {
    try {
      return await callGroq(prompt); // 🥈 2. Llama-3.3-70B (Tercepat di dunia, 0.88s)
    } catch (e2) {
      try {
        return await callSambaNova(prompt); // 🥉 3. DeepSeek/Llama 70B (Sangat Organik, 6.93s)
      } catch (e3) {
        try {
          return await callGithub(prompt); // 🛡️ 4. GPT-4o-Mini (Jawaban sangat rapi ala ChatGPT, 4.51s)
        } catch (e4) {
          try {
             return await callGemini(prompt); // 💎 5. Gemini 2.5 Flash (Bagus tapi agak kaku, 6.93s)
          } catch (e5) {
             return await callCerebras(prompt); // 🚑 6. Llama-3.1-8B (Darurat - Cepat tapi sering halusinasi/mengulang prompt, 2.06s)
          }
        }
      }
    }
  }
}
```
*(Simpan dokumen ini baik-baik di VPS absenbot sebagai brankas utamamu!)*
