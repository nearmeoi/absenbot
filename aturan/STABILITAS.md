# ABSENBOT — PROJECT CONSTITUTION
### Dokumen Aturan Teknis Mutlak · v2.0 · 4 Maret 2026

> **STATUS: BERLAKU MUTLAK**
> Dokumen ini adalah **satu-satunya sumber kebenaran** untuk seluruh pengembangan AbsenBot. Setiap perubahan kode — baik oleh manusia maupun AI — **WAJIB** mematuhi seluruh aturan di bawah ini tanpa pengecualian.

---

## DAFTAR ISI

| # | Bagian | Cakupan |
|---|--------|---------|
| 1 | [Identitas & Stack Teknologi](#1-identitas--stack-teknologi) | Runtime, library wajib, versi |
| 2 | [Arsitektur & Struktur Direktori](#2-arsitektur--struktur-direktori) | Layer separation, batas modul |
| 3 | [Command Module Contract](#3-command-module-contract) | Format ekspor, auto-loader, context |
| 4 | [UI & Format Pesan](#4-ui--format-pesan) | Tombol, viewOnce, footer, emoji |
| 5 | [Identifikasi User & Database](#5-identifikasi-user--database) | Multi-identifier, slug, JSON storage |
| 6 | [State Machine & Draft Flow](#6-state-machine--draft-flow) | State lifecycle, confirmation, expiry |
| 7 | [AI Engine](#7-ai-engine) | Model priority, refinement, parsing |
| 8 | [Sistem Template Pesan](#8-sistem-template-pesan) | Modular JSON, placeholder, getMessage |
| 9 | [Koneksi & Performa](#9-koneksi--performa) | Library WA, reconnect, caching, queue |
| 10 | [Keamanan & Privasi](#10-keamanan--privasi) | Credential, grup vs japri, gitignore |
| 11 | [Environment & Konfigurasi](#11-environment--konfigurasi) | .env, constants.js, env detection |
| 12 | [Gaya Kode & Konvensi](#12-gaya-kode--konvensi) | CommonJS, JSDoc, logging, error handling |
| 13 | [Git & Deployment](#13-git--deployment) | Branch, gitignore, PM2, deploy |
| 14 | [DAFTAR LARANGAN MUTLAK](#14-daftar-larangan-mutlak) | Hal-hal yang dilarang keras |

---

## 1. IDENTITAS & STACK TEKNOLOGI

| Komponen | Spesifikasi | Catatan |
|----------|------------|---------|
| **Runtime** | Node.js (CommonJS) | `require()` — **BUKAN** ES Modules |
| **WhatsApp Library** | `wileys` (Baileys Fork) | **DILARANG** menggunakan `@whiskeysockets/baileys` original |
| **HTTP Framework** | Express 5 | Untuk dashboard & API |
| **AI Primary** | Groq (`llama-3.3-70b-versatile`) | Via REST API |
| **AI Fallback 1** | Google Gemini 1.5 Flash | Via REST API |
| **AI Fallback 2** | Blackbox AI | Cadangan terakhir |
| **Browser Engine** | Puppeteer Core | Untuk scraping dashboard |
| **Process Manager** | PM2 | `ecosystem.config.js` |
| **Package Manager** | npm | `package-lock.json` wajib di-commit |
| **Entry Point** | `index.js` | Tidak boleh diganti |

**Aturan Dependensi:**
- Setiap penambahan dependency baru **WAJIB** memiliki justifikasi kuat
- **DILARANG** menambahkan library yang fungsinya sudah di-cover oleh library yang ada
- Semua dependency harus menggunakan versi spesifik di `package.json` (dengan caret `^`)

---

## 2. ARSITEKTUR & STRUKTUR DIREKTORI

```
absenbot/
├── index.js                  # Entry point — JANGAN UBAH STRUKTUR
├── package.json              # v6.1.0 — versi harus di-bump saat rilis
├── ecosystem.config.js       # PM2 config
├── deploy.sh                 # Deployment script
├── .env                      # Konfigurasi sensitif (TIDAK DI-COMMIT)
├── .gitignore                # WAJIB dipatuhi
│
├── aturan/                   # Dokumentasi aturan project
│   └── STABILITAS.md         # FILE INI — konstitusi project
│
├── src/                      # SELURUH kode aplikasi
│   ├── app.js                # WhatsApp socket, sendMessage override
│   ├── handlers/
│   │   └── messageHandler.js # Dispatcher utama — routing semua pesan
│   ├── commands/             # Satu file = satu command
│   │   ├── index.js          # Auto-loader (JANGAN UBAH)
│   │   └── *.js              # Command modules
│   ├── services/             # Business logic & external API
│   ├── utils/                # Helper functions (stateless)
│   ├── config/
│   │   ├── constants.js      # Semua konfigurasi & environment
│   │   ├── holidays.js       # Data hari libur
│   │   └── messages/         # Template pesan (JSON files)
│   └── routes/               # Express API routes
│       ├── appRoutes.js      # User-facing API
│       └── dashboardRoutes.js # Admin dashboard API
│
├── client/                   # React frontend (dashboard)
├── data/                     # Runtime data (cache, etc.)
├── public/                   # Static assets
├── sessions/                 # WhatsApp auth state (TIDAK DI-COMMIT)
├── logs/                     # Log files (TIDAK DI-COMMIT)
└── temp/                     # File sementara (TIDAK DI-COMMIT)
```

**Aturan Layer:**

| Layer | Boleh Mengakses | Tidak Boleh Mengakses |
|-------|----------------|----------------------|
| `commands/` | `services/`, `utils/`, `config/` | `handlers/`, `routes/`, `app.js` |
| `handlers/` | `commands/`, `services/`, `utils/`, `config/` | `routes/`, `app.js` |
| `services/` | `services/` lain, `utils/`, `config/` | `commands/`, `handlers/` |
| `utils/` | `config/` saja | `commands/`, `services/`, `handlers/` |
| `routes/` | `services/`, `utils/`, `config/` | `commands/`, `handlers/` |

**Aturan Mutlak:**
- **DILARANG** membuat folder baru di dalam `src/` tanpa persetujuan eksplisit
- **DILARANG** memindahkan file antar folder tanpa refaktor semua `require()` terkait
- **DILARANG** menulis logika bisnis di `utils/` — gunakan `services/`
- **DILARANG** mengakses `sock` (socket WhatsApp) dari `services/` secara langsung — socket hanya diteruskan sebagai parameter dari `commands/` atau `handlers/`

---

## 3. COMMAND MODULE CONTRACT

Setiap file di `src/commands/` **WAJIB** mengikuti kontrak berikut:

```javascript
// Format WAJIB untuk setiap command module
module.exports = {
    name: 'namacommand',           // string | string[] — WAJIB
    description: 'Deskripsi singkat', // string — WAJIB
    aliases: ['alias1', 'alias2'],    // string[] — OPSIONAL

    async execute(sock, msgObj, context) {
        // Implementasi command
    }
};
```

**Objek `context` (disediakan oleh messageHandler):**

```javascript
{
    sender,           // string — JID pengirim (remoteJid)
    senderNumber,     // string — Normalized sender ID (via normalizeToStandard)
    isGroup,          // boolean — true jika dari grup
    args,             // string — Teks setelah command (tanpa prefix+command)
    textMessage,      // string — Full text message
    originalSenderId, // string — Raw sender JID (sebelum normalisasi)
    BOT_PREFIX,       // string — Prefix command (default: "!")
    user,             // object|null — Data user dari database
    msgObj            // object — Raw WhatsApp message object
}
```

**Aturan Command:**
- Satu file = satu command (dengan aliases opsional)
- Nama file = nama command utama → `absen.js` untuk `!absen`
- Auto-loader di `commands/index.js` akan membaca semua `.js` kecuali `index.js`
- **DILARANG** mengubah `commands/index.js` — auto-loader harus tetap generik
- Setiap command **WAJIB** mengecek registrasi user di awal (kecuali `!daftar`, `!menu`, `!help`)
- Pengecekan registrasi: `getUserByPhone(senderNumber)` → jika null, kirim `getMessage('!daftar_not_registered')`
- `sock.sendMessage()` untuk pesan teks biasa, `sendInteractiveMessage()` untuk pesan dengan tombol

---

## 4. UI & FORMAT PESAN

### 4.1 Prinsip Clean UI

- **DILARANG** menyertakan daftar perintah fallback di badan pesan jika menggunakan tombol
- Badan pesan harus fokus pada informasi inti saja
- Tidak boleh ada duplikasi informasi antara body dan footer

### 4.2 Tombol Interaktif (Interactive Buttons)

**Semua pesan dengan tombol WAJIB menggunakan `sendInteractiveMessage()`:**

```javascript
const { sendInteractiveMessage } = require('../utils/interactiveMessage');

await sendInteractiveMessage(sock, targetJid, {
    body: "Teks utama pesan",
    footer: "Footer opsional",
    buttons: [
        { name: 'quick_reply', params: JSON.stringify({ display_text: 'LABEL', id: '!command' }) },
        { name: 'cta_url', params: JSON.stringify({ display_text: 'LABEL', url: 'https://...', merchant_url: 'https://...' }) },
        { name: 'single_select', params: JSON.stringify({ title: 'Pilih', sections: [...] }) }
    ]
}, { quoted: msgObj });
```

### 4.3 ViewOnce & Ephemeral

- Semua pesan interaktif otomatis dibungkus `viewOnce: true` oleh smart override di `app.js`
- **DILARANG** menambahkan `viewOnce` manual — sudah di-handle otomatis
- Pesan grup otomatis mendapat `ephemeralExpiration: 86400` (24 jam) oleh override

### 4.4 Format Teks

| Elemen | Aturan |
|--------|--------|
| **Header** | Gunakan `*CAPS BOLD*` untuk judul utama |
| **Label** | Cetak tebal: `*Aktivitas:*`, `*Pembelajaran:*`, `*Kendala:*` |
| **Separator** | `━━━━━━━━━━━━━━━━━━` (garis penuh) untuk pemisah visual |
| **Emoji** | Proporsional di awal header/poin penting — jangan berlebihan |
| **Link** | **DILARANG** memasukkan URL panjang di body — gunakan tombol `cta_url` atau command `!webapp` |
| **Footer** | Ringkas, tidak boleh mengulang info dari header/body |

---

## 5. IDENTIFIKASI USER & DATABASE

### 5.1 Penyimpanan Data

- Database utama: file JSON (`data/users.json`)
- In-memory cache: `cachedUsers` di `database.js`
- Semua operasi tulis **WAJIB** melalui `updateUsers(users)` → menangani write queue
- **DILARANG** menulis langsung ke file — selalu gunakan `safeWriteFile()` via `updateUsers()`

### 5.2 Multi-Identifier (Phone + LID)

```javascript
// Struktur user di database
{
    phone: "628xxx@s.whatsapp.net",    // ID utama (phone)
    identifiers: [                      // Semua identifier yang dikenali
        "628xxx@s.whatsapp.net",
        "185xxx@lid"
    ],
    email: "user@example.com",
    password: "...",                    // ⚠️ Disimpan plain — lihat Bagian 10
    slug: "unique-slug",               // URL-safe identifier
    template: "...",                    // Template absensi opsional
    cycleDay: 24                        // Siklus approve (24 atau 15)
}
```

**Aturan Identifikasi:**
- `getUserByPhone(id)` adalah **satu-satunya** fungsi untuk mencari user — cocokkan dengan `phone`, LID, atau `identifiers[]`
- Saat pesan masuk dari ID baru, jika cocok dengan user existing, **WAJIB** auto-link via `updateUserLid()`
- `normalizeToStandard(phone)` **WAJIB** digunakan sebelum lookup — menangani normalisasi `@s.whatsapp.net` dan `@lid`
- Setiap user **WAJIB** memiliki `slug` unik — URL Web App menggunakan format `?u=slug`
- `internalId` (untuk state & draft tracking) = `user.phone` jika user ditemukan, fallback ke `senderNumber`
- **DILARANG** membuat fungsi pencarian user baru — extend `getUserByPhone()` jika perlu

---

## 6. STATE MACHINE & DRAFT FLOW

### 6.1 State Service (`stateService.js`)

| State | Trigger | Resolusi | Timeout |
|-------|---------|----------|---------|
| `AWAITING_ACTIVITY` | `!absen` tanpa argumen | User mengirim teks aktivitas | 10 menit |
| `AWAITING_CONFIRMATION` | Draft selesai di-generate | User mengirim `"ya"` atau klik tombol | 10 menit |

**Aturan State:**
- Key state = `internalId` (bukan `senderNumber` mentah)
- User mengirim command baru (`!xxx`) → state lama **otomatis di-clear**
- State **WAJIB** di-clear setelah resolusi (sukses maupun gagal)
- **DILARANG** membuat state baru tanpa menambahkan handler-nya di `messageHandler.js`

### 6.2 Draft Service (`previewService.js`)

- Draft disimpan di memory (Map) dengan key = normalized sender
- Expiry: **30 menit** — setelah itu otomatis dihapus
- Auto-cleanup: setiap 1 jam
- `setDraft()` → `getDraft()` → `deleteDraft()` — lifecycle **WAJIB** diikuti
- `formatDraftPreview(reportData, messageKey)` untuk format pesan preview

### 6.3 Flow Lengkap Absensi

```
User: !absen <teks>
  │
  ├─ [Punya teks] → AI/Manual parse → setDraft() → Preview + tombol
  │                                                     │
  │                  ┌─────────────────────────────────┘
  │                  ▼
  │         User: "ya" atau klik KIRIM
  │                  │
  │                  ▼
  │         prosesLoginDanAbsen() → deleteDraft() + clearState()
  │
  └─ [Tanpa teks + punya template] → Gunakan template → (flow sama)
  │
  └─ [Tanpa teks + tanpa template] → setUserState('AWAITING_ACTIVITY')
                                       │
                                       ▼
                                User kirim teks biasa → execute absen dengan teks
```

**Aturan Flow:**
- Jika user sudah absen hari ini (cek `cekStatusHarian`), **WAJIB** blokir dan informasikan
- Semua draf dan instruksi pengisian **WAJIB** dikirim ke japri jika dipicu dari grup
- Di grup, kirim konfirmasi singkat ke grup + detail ke japri
- Konfirmasi `"ya"` bersifat case-insensitive tapi harus **exact match** (bukan substring)

---

## 7. AI ENGINE

### 7.1 Prioritas Model

```
1. Groq (llama-3.3-70b-versatile) ← Primary
2. Google Gemini 1.5 Flash        ← Fallback pertama
3. Blackbox AI                    ← Cadangan terakhir (jika dua lainnya gagal)
```

- **DILARANG** mengubah urutan prioritas tanpa persetujuan eksplisit
- Setiap engine **WAJIB** memiliki try-catch terpisah dengan logging fallback
- API key diambil dari `.env` → `GROQ_API_KEY`, `GEMINI_API_KEY`

### 7.2 Pipeline AI

| Tahapan | Fungsi | Catatan |
|---------|--------|---------|
| Generation | `runGroqGeneration()` | Buat draf awal dari input user |
| Refinement | `runGroqRefinement()` | Koreksi halusinasi, validasi akurasi |
| Expansion | Terintegrasi di prompt | Input pendek → minimal 110-150 karakter/bagian |
| Parsing | `parseAndClamp()` | Ekstrak & clamp: Aktivitas, Pembelajaran, Kendala |

### 7.3 Constraint Karakter

| Parameter | Nilai | Sumber |
|-----------|-------|--------|
| `AI_CONFIG.REPORT.MIN_CHARS` | 110 | `constants.js` |
| `AI_CONFIG.REPORT.MAX_CHARS` | 300 | `constants.js` |
| `VALIDATION.MANUAL_MIN_CHARS` | 100 | `constants.js` |
| `AI_CONFIG.REPORT.TRUNCATE_BUFFER` | 50 | `constants.js` |

### 7.4 Aturan Bahasa AI

**DILARANG KERAS** menghasilkan kalimat dengan pola berikut:
- ❌ Kalimat klise/lebay: *"tidak menyurutkan semangat"*, *"solusi terbaik"*, *"langkah strategis"*
- ❌ Kalimat motivasional berlebihan
- ❌ Pengulangan kata yang tidak perlu

**WAJIB** menggunakan:
- ✅ Gaya bahasa profesional, teknis, *to-the-point*
- ✅ Deskripsi konkret dan spesifik tentang aktivitas yang dilakukan
- ✅ Bahasa formal tapi tidak kaku

### 7.5 Parsing Aman

- Gunakan regex sederhana — **DILARANG** regex kompleks dengan backslash berlebihan
- Setiap regex **WAJIB** memiliki fallback pencarian baris-demi-baris
- Fungsi `parseAndClamp()` adalah parser resmi — extend, jangan duplikasi

---

## 8. SISTEM TEMPLATE PESAN

### 8.1 Struktur File

```
src/config/messages/
├── ai.json            # Pesan terkait AI
├── ai_prompts.json    # System & user prompts untuk AI
├── auth.json          # Pesan autentikasi
├── custom.json        # Key custom/baru (fallback target)
├── dev.json           # Pesan developer commands
├── draft.json         # Format draft preview
├── general.json       # Pesan umum
├── group.json         # Pesan khusus grup
├── scheduler.json     # Pesan scheduler & cron
├── status.json        # Pesan status cek
├── submission.json    # Pesan submit absensi
└── system.json        # Pesan sistem internal
```

### 8.2 Aturan Template

- Semua teks yang ditampilkan ke user **WAJIB** ada di file JSON — **DILARANG** hardcode string di kode
- Gunakan `getMessage(key, phone)` untuk mengambil pesan
- Placeholder `{app_url}` otomatis di-resolve oleh `getMessage()`
- Placeholder custom (mis. `{error}`, `{date}`) di-replace manual dengan `.replace()`
- Key baru yang tidak ditemukan di file manapun → otomatis masuk ke `custom.json`
- **DILARANG** membuat file JSON baru di `messages/` tanpa justifikasi (gunakan file yang sudah ada)

**Contoh Penggunaan:**
```javascript
const { getMessage } = require('../services/messageService');

// Basic
await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') });

// Dengan phone (untuk URL resolusi)
const reply = getMessage('!absen_submit_success', senderNumber);

// Dengan placeholder manual
const reply = getMessage('!cek_error', senderNumber).replace('{error}', status.pesan);
```

---

## 9. KONEKSI & PERFORMA

### 9.1 Library WhatsApp

- **WAJIB** gunakan `wileys` (Baileys Fork) — **DILARANG** menggunakan `@whiskeysockets/baileys` original
- Alasan: `wileys` memiliki kompatibilitas tombol interaktif yang tidak ada di versi original
- Import via `require("wileys")` — sudah di-alias di `package.json`

### 9.2 Smart sendMessage Override

`app.js` memiliki override pada `sock.sendMessage()` yang:
1. Mendeteksi properti `interactiveButtons` dalam content
2. Mengkonversi ke format `buttons[]` yang kompatibel (viewOnce automatic)
3. Menerapkan `ephemeralExpiration: 86400` untuk semua pesan grup
4. **DILARANG** memodifikasi override ini tanpa testing menyeluruh pada Android, iOS, dan PC

### 9.3 Auto-Reconnect

```
Koneksi terputus?
  ├─ Reason = loggedOut → process.exit(1) — PM2 akan restart
  └─ Reason ≠ loggedOut → setTimeout(connectToWhatsApp, 5000) — coba lagi 5 detik
```

### 9.4 Caching & Queue

| Mekanisme | Detail |
|-----------|--------|
| **Dashboard Cache** | `getDashboardStats` di-cache 2 jam via `dashboardCache.js` |
| **Browser Queue** | Maksimal **1 instance** Puppeteer berjalan bersamaan — untuk hemat RAM VPS |
| **Message Dedup** | `processedMessages` Set — max 1000 ID — FIFO cleanup |
| **User Cache** | `cachedUsers` in-memory — di-invalidate saat `updateUsers()` |
| **Draft Cleanup** | Auto setiap 1 jam, expiry 30 menit |
| **Log Cleanup** | Auto setiap 24 jam, batas 10MB per file |

---

## 10. KEAMANAN & PRIVASI

### 10.1 Routing Grup vs Japri

| Konten | Dikirim ke |
|--------|-----------|
| Instruksi pengisian (`!absen` tanpa args) | **Japri** (walaupun dipicu dari grup) |
| Draft preview & tombol konfirmasi | **Japri** |
| Konfirmasi singkat bahwa draft sudah dikirim | Grup (pesan pendek saja) |
| Email, password, data sensitif | **DILARANG** di grup — japri only |
| Status umum (sudah/belum absen) | Boleh di grup |

### 10.2 Credential Protection

- **DILARANG** melakukan `console.log()` pada password atau token sesi
- **DILARANG** mencantumkan email/password di pesan WhatsApp (kecuali konfirmasi registrasi ke japri)
- Session WhatsApp (`SesiWA/`) dan `users.json` **TIDAK BOLEH** di-commit ke Git
- API key di `.env` — **TIDAK BOLEH** hardcode di source code

### 10.3 GitIgnore Enforcement

File dan folder berikut **WAJIB** tetap di `.gitignore`:
```
SesiWA/        sessions/       users.json      .env
logs/          temp/           *.log           *.bak
node_modules/  data/backups/   debug_*
```

---

## 11. ENVIRONMENT & KONFIGURASI

### 11.1 .env sebagai Single Source of Truth

Semua variabel konfigurasi dibaca dari `.env` via `dotenv`:
```
GROQ_API_KEY=           # API key Groq
GEMINI_API_KEY=         # API key Gemini
BOT_PREFIX=!            # Prefix command (default: !)
APP_URL=                # URL web app
ADMIN_NUMBERS=          # Nomor admin (comma-separated)
DASHBOARD_PORT=3000     # Port Express server
USE_PAIRING_CODE=       # true/false
PHONE_NUMBER=           # Nomor untuk pairing
DEBUG=                  # true/false
```

### 11.2 constants.js sebagai Config Hub

- **Semua** konfigurasi yang dibutuhkan modul lain **WAJIB** diekspor dari `src/config/constants.js`
- **DILARANG** membaca `.env` langsung di file lain — gunakan import dari `constants.js`
- Environment detection otomatis: termux / windows / vps / linux / macos
- Chromium path resolution otomatis berdasarkan environment

### 11.3 Aturan Konfigurasi

- Konfigurasi AI (model, URL, karakter limit) → `AI_CONFIG` di `constants.js`
- Konfigurasi validasi → `VALIDATION` di `constants.js`
- Path resolution → `PROJECT_ROOT`, `SESSION_DIR`, dll. di `constants.js`
- **DILARANG** mendefinisikan magic number di luar `constants.js` — semua angka penting harus bernama

---

## 12. GAYA KODE & KONVENSI

### 12.1 Module System

```javascript
// ✅ BENAR — CommonJS
const { functionA } = require('../services/myService');
module.exports = { ... };

// ❌ SALAH — ES Modules
import { functionA } from '../services/myService';
export default { ... };
```

### 12.2 Async/Await

```javascript
// ✅ BENAR
async function myFunction() {
    try {
        const result = await someAsyncOp();
        return result;
    } catch (e) {
        console.error(chalk.red('[MODULE] Error:'), e.message);
        throw e;
    }
}

// ❌ SALAH — raw Promise chain
function myFunction() {
    return someAsyncOp()
        .then(result => { ... })
        .catch(err => { ... });
}
```

### 12.3 Console Logging

| Warna | Penggunaan | Contoh |
|-------|-----------|--------|
| `chalk.green()` | Sukses, koneksi berhasil | `✅ Bot Terhubung` |
| `chalk.red()` | Error, kegagalan | `❌ Koneksi Terputus` |
| `chalk.yellow()` | Warning, user belum terdaftar | `[UNREGISTERED]` |
| `chalk.cyan()` | Info command, preview | `[CMD:ABSEN]` |
| `chalk.blue.bold()` | Label bot dalam log pesan | `BOT` |
| `chalk.gray()` | Debug, info minor | `[STATE] cleared` |

**Format log wajib:** `[TAG] Pesan` — TAG dalam CAPS, di dalam bracket.

### 12.4 JSDoc

Setiap fungsi yang diekspor **WAJIB** memiliki JSDoc minimal:

```javascript
/**
 * Deskripsi singkat fungsi
 * @param {string} paramName - Penjelasan parameter
 * @returns {Object|null} Penjelasan return value
 */
```

### 12.5 Error Handling

- Setiap `async execute()` di command **WAJIB** dibungkus try-catch
- Error kritis dilaporkan via `reportError(error, context)` dari `errorReporter.js`
- Error yang visible ke user → kirim pesan error yang ramah, bukan stack trace
- **DILARANG** membiarkan unhandled promise rejection — semua Promise harus di-await atau `.catch()`

### 12.6 Penamaan

| Entitas | Konvensi | Contoh |
|---------|----------|--------|
| File | `camelCase.js` | `messageHandler.js`, `aiService.js` |
| Fungsi | `camelCase` | `getUserByPhone()`, `sendInteractiveMessage()` |
| Konstanta | `SCREAMING_SNAKE_CASE` | `BOT_PREFIX`, `PROJECT_ROOT` |
| Command | `lowercase` | `absen`, `cek`, `cekapprove` |
| JSON key | `snake_case` dengan prefix `!` untuk command | `!absen_submit_success` |
| State name | `SCREAMING_SNAKE_CASE` | `AWAITING_ACTIVITY` |

---

## 13. GIT & DEPLOYMENT

### 13.1 Branch

- `main` = branch produksi — kode yang sudah di-test
- Development langsung di `main` (single contributor workflow)
- Setiap commit harus memiliki pesan yang deskriptif

### 13.2 Commit Message

```
Format: <emoji> <area>: <deskripsi singkat>

Contoh:
✨ commands: tambah command !webapp
🐛 handler: fix draft detection logic
🔧 config: update AI character limits
📝 aturan: update STABILITAS.md
🚀 deploy: bump version ke 6.2.0
```

### 13.3 Deployment

- Deploy via `deploy.sh` ke VPS
- PM2 mengelola proses via `ecosystem.config.js`
- **WAJIB** test di local sebelum deploy ke VPS
- **WAJIB** backup `data/users.json` sebelum deploy besar

---

## 14. DAFTAR LARANGAN MUTLAK

> **Setiap pelanggaran terhadap daftar ini akan menyebabkan kode di-revert.**

| # | Larangan | Alasan |
|---|----------|--------|
| 1 | **DILARANG** menggunakan ES Modules (`import`/`export`) | Seluruh codebase adalah CommonJS |
| 2 | **DILARANG** mengganti `wileys` dengan library WA lain | Kompatibilitas tombol interaktif |
| 3 | **DILARANG** mengubah `commands/index.js` auto-loader | Bisa merusak semua command |
| 4 | **DILARANG** mengubah `sock.sendMessage` override di `app.js` tanpa test menyeluruh | Bisa merusak semua pesan |
| 5 | **DILARANG** hardcode string pesan di kode | Gunakan `messages/*.json` + `getMessage()` |
| 6 | **DILARANG** menyimpan credential di source code | Gunakan `.env` |
| 7 | **DILARANG** melakukan `console.log()` pada password/token | Risiko kebocoran |
| 8 | **DILARANG** commit `SesiWA/`, `users.json`, `.env`, `node_modules/` | Data sensitif |
| 9 | **DILARANG** membuat fungsi pencarian user baru (duplikasi `getUserByPhone`) | Satu sumber pencarian |
| 10 | **DILARANG** mengakses `sock` dari `services/` secara langsung | Violasi layer boundary |
| 11 | **DILARANG** menulis ke database tanpa melalui `updateUsers()` | Race condition |
| 12 | **DILARANG** mengirim data sensitif ke grup WhatsApp | Privasi user |
| 13 | **DILARANG** menggunakan magic number tanpa nama di `constants.js` | Maintainability |
| 14 | **DILARANG** membuat state baru tanpa handler di `messageHandler.js` | State zombie |
| 15 | **DILARANG** promise tanpa `.catch()` atau `await` | Unhandled rejection |

---

## CHANGELOG

| Tanggal | Versi | Perubahan |
|---------|-------|-----------|
| 3 Maret 2026 | v1.0 | Versi awal — panduan informal |
| 4 Maret 2026 | v2.0 | Rewrite total — konstitusi project dengan aturan ketat |

---

*Dokumen ini adalah living document. Update hanya boleh dilakukan dengan persetujuan pemilik project. Setiap AI assistant yang bekerja pada project ini **WAJIB** membaca dan mematuhi dokumen ini sebelum membuat perubahan apapun.*
