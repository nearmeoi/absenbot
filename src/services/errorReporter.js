const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { ADMIN_NUMBERS } = require('../config/constants');
const { smartChat } = require('./aiService');

let socketBot = null;
const cacheReport = new Map();
const COOLDOWN_REPORT_MS = 60000; // 1 menit

function getSnippet(stack) {
    try {
        const lines = stack.split('\n');
        const match = lines[1]?.match(/\((.*):(\d+):(\d+)\)/) || lines[1]?.match(/at (.*):(\d+):(\d+)/);
        if (match) {
            const filePath = match[1];
            const lineNum = parseInt(match[2]);
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf-8').split('\n');
                const start = Math.max(0, lineNum - 5);
                const end = Math.min(fileContent.length, lineNum + 5);
                
                // Ambil kode asli tanpa nomor baris untuk dicocokkan nanti
                const rawSnippet = fileContent.slice(start, end).join('\n');
                
                let numberedSnippet = `File: ${filePath}\nLine: ${lineNum}\n\n`;
                for (let i = start; i < end; i++) {
                    numberedSnippet += `${i + 1}${i + 1 === lineNum ? ' >>> ' : ':    '}${fileContent[i]}\n`;
                }
                return { filePath, lineNum, start, end, numberedSnippet, rawSnippet };
            }
        }
    } catch (e) {}
    return null;
}

function initPelaporError(sock) {
    socketBot = sock;
}

async function laporError(error, konteks = 'Tidak diketahui', metadata = {}) {
    console.error(chalk.bgRed.white(' [LAPORAN ERROR] '), error);
    if (!socketBot || ADMIN_NUMBERS.length === 0) return;

    try {
        const pesanError = typeof error === 'string' ? error : error.message;
        const stack = error.stack || 'Tidak ada stack trace';

        const kunciCache = `${konteks}:${pesanError}`;
        if (cacheReport.has(kunciCache) && (Date.now() - cacheReport.get(kunciCache)) < COOLDOWN_REPORT_MS) return;
        cacheReport.set(kunciCache, Date.now());

        const codeData = getSnippet(stack);
        let aiDiagnosis = "_AI sedang menganalisis..._";
        let autoFixStatus = "❌ Tidak ada perbaikan otomatis yang diterapkan.";

        if (codeData) {
            try {
                const prompt = `Terjadi error pada sistem NodeJS.
ERROR: "${pesanError}"
LOKASI: ${codeData.filePath} (Baris ${codeData.lineNum})

KODE ASLI (Jangan ubah indentasi):
\`\`\`javascript
${codeData.rawSnippet}
\`\`\`

Tugas:
1. Temukan baris yang menyebabkan error.
2. Perbaiki HANYA bagian yang error (jangan merombak seluruh fungsi).
3. Berikan output dalam format JSON ketat (tanpa markdown atau teks lain di sekitarnya) dengan struktur:
{
  "penjelasan": "Penjelasan singkat",
  "kode_lama": "Baris kode spesifik yang error (harus sama persis)",
  "kode_baru": "Baris kode perbaikannya"
}`;
                
                const res = await smartChat(prompt, "Kamu adalah AI Debugger. Output HANYA JSON murni tanpa awalan/akhiran apapun.");
                
                if (res.success) {
                    try {
                        // Bersihkan response dari markdown JSON jika AI membandel
                        let jsonStr = res.content.replace(/```json/gi, '').replace(/```/g, '').trim();
                        const fixData = JSON.parse(jsonStr);
                        
                        aiDiagnosis = fixData.penjelasan;

                        // Terapkan Auto-Fix
                        if (fixData.kode_lama && fixData.kode_baru) {
                            const fileContent = fs.readFileSync(codeData.filePath, 'utf-8');
                            if (fileContent.includes(fixData.kode_lama)) {
                                const newContent = fileContent.replace(fixData.kode_lama, fixData.kode_baru);
                                fs.writeFileSync(codeData.filePath, newContent, 'utf-8');
                                autoFixStatus = `✅ *Auto-Fix Berhasil!* Kode telah ditambal.\n_Kode yang diubah:_ \`${fixData.kode_baru.trim()}\`\n\n🔄 *Bot akan merestart dalam 3 detik untuk menerapkan perubahan...*`;
                                console.log(chalk.bgGreen.white(' [AUTO-FIX] Berhasil menambal file! Merestart... '));
                                
                                // Trigger Restart setelah jeda agar pesan terkirim
                                setTimeout(() => {
                                    process.exit(1); // Exit dengan kode 1 agar PM2 merestart
                                }, 3000);
                            } else {
                                autoFixStatus = "⚠️ *Auto-Fix Gagal:* Kode lama dari AI tidak persis sama dengan file asli.";
                            }
                        }
                    } catch (parseError) {
                        aiDiagnosis = "Saran AI didapat, namun gagal mem-parsing format Auto-Fix JSON.";
                        console.error('[AUTO-FIX] Gagal parse JSON dari AI:', res.content);
                    }
                }
            } catch (e) {
                aiDiagnosis = "_Gagal mendapatkan diagnosis AI._";
            }
        }

        let teksLaporan = '🚨 *AI SYSTEM DOCTOR REPORT* 🚨\n\n';
        teksLaporan += `*Konteks:* ${konteks}\n`;
        teksLaporan += `*Error:* ${pesanError}\n\n`;

        if (codeData) {
            teksLaporan += `*Lokasi:* ${path.basename(codeData.filePath)} (Baris ${codeData.lineNum})\n\n`;
        }

        teksLaporan += `*🤖 DIAGNOSIS AI:*\n${aiDiagnosis}\n\n`;
        teksLaporan += `*🛠️ STATUS PERBAIKAN:*\n${autoFixStatus}\n\n`;
        teksLaporan += `_Jika bot crash parah, PM2 akan merestart otomatis dan memuat perbaikan ini._`;

        await socketBot.sendMessage(ADMIN_NUMBERS[0], { text: teksLaporan });
    } catch (e) {
        console.error(chalk.red('[PELAPOR ERROR] Gagal mengirim laporan:'), e.message);
    }
}

module.exports = {
    initPelaporError,
    laporError,
    initErrorReporter: initPelaporError,
    reportError: laporError
};
