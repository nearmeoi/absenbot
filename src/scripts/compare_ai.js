const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();

const GEMINI_API_KEY = 'AIzaSyDRLqq5E8GBcNSXHtx-RGuyvjiL5pwT0NU';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const fs = require('fs');
const path = require('path');

// 7-DAY HISTORY (Real User Data via fetch_history.js)
let MOCK_HISTORY = [];
try {
    const historyPath = path.join(__dirname, 'real_history.json');
    if (fs.existsSync(historyPath)) {
        MOCK_HISTORY = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        console.log(chalk.green(`Loaded ${MOCK_HISTORY.length} real logs.`));
    } else {
        console.warn(chalk.yellow("Real history not found, using empty."));
    }
} catch (e) {
    console.error("Error loading history:", e.message);
}

// Format history for prompt
const HISTORY_TEXT = MOCK_HISTORY.map((h, i) =>
    `--- Log ${i + 1} (${h.date}) ---\nAktivitas: ${h.A}\nPembelajaran: ${h.P}\nKendala: ${h.K}`
).join('\n\n');

const SYSTEM_PROMPT = `Kamu adalah asisten yang MENIRU GAYA BAHASA user.

RIWAYAT LAPORAN USER (7 HARI TERAKHIR):
${HISTORY_TEXT}

TUGAS:
1. Analisis gaya bahasa user dari riwayat di atas (kosakata, tone, struktur).
2. Ubah cerita baru user menjadi laporan dengan GAYA YANG SAMA PERSIS.
3. Gunakan pilihan kata yang mirip dengan kebiasaan user di riwayat.
4. PANJANG: 100-170 karakter per bagian.

Format:
AKTIVITAS: [isi]
PEMBELAJARAN: [isi]
KENDALA: [isi]`;

const TEST_INPUT = "Hari ini belajar React Basic, bikin components header sama footer. Awalnya bingung props, tapi lama-lama paham.";
const USER_PROMPT = `Cerita User (SIMULASI): "${TEST_INPUT}"\n\nBuat laporan dengan gaya saya!`;

// --- HELPERS ---
function cleanOutput(text) {
    if (!text) return "";
    // Remove <think> blocks (DeepSeek/Qwen style)
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function parseSections(text) {
    const parse = (label) => {
        // Regex robustly finds Label + Colon + Content until next label or end
        const regex = new RegExp(`${label}:?\\s*([\\s\\S]*?)(?=(?:AKTIVITAS|PEMBELAJARAN|KENDALA):|$)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };
    return {
        A: parse('AKTIVITAS'),
        P: parse('PEMBELAJARAN'),
        K: parse('KENDALA')
    };
}

function analyzeQuality(modelName, sections) {
    console.log(chalk.bold(`\n📝 ANALISIS KUALITAS: ${modelName} `));
    console.log("-".repeat(60));

    let totalScore = 0;
    const rules = { min: 100, max: 170 };

    ['A', 'P', 'K'].forEach(type => {
        const text = sections[type];
        const len = text.length;
        const sub = type === 'A' ? 'Aktivitas' : type === 'P' ? 'Pembelajaran' : 'Kendala';

        let status = chalk.green("PASS ✅");
        if (len < rules.min) { status = chalk.red(`FAIL(Too Short: ${len}) ❌`); }
        else if (len > rules.max) { status = chalk.yellow(`WARN(Too Long: ${len}) ⚠️`); }
        else { totalScore++; }

        // Robot check
        if (text.toLowerCase().includes("komprehensif") || text.toLowerCase().includes("intensif")) {
            status += chalk.red(" [ROBOT WORD DETECTED!]");
            totalScore -= 0.5;
        }

        console.log(chalk.cyan(`[${sub}]`) + status);
        console.log(chalk.white(`"${text}"`));
        console.log("");
    });

    return totalScore;
}

function analyzeStyle(modelName, sections) {
    console.log(chalk.bold(`\n🕵️ ANALISIS GAYA(Persona Check): ${modelName} `));

    // Keywords form history
    const keywords = ["ngulik", "aman jaya", "solving", "kelar", "connect", "pusing", "ngoding"];
    let hitCount = 0;
    const fullText = (sections.A + " " + sections.P + " " + sections.K).toLowerCase();

    console.log(chalk.gray(`Text: "${fullText.substring(0, 100)}..."`));

    keywords.forEach(kw => {
        if (fullText.includes(kw)) {
            hitCount++;
            process.stdout.write(chalk.green(`[HIT: ${kw}]`));
        }
    });

    if (hitCount === 0) console.log(chalk.red("No signature keywords found."));
    else console.log(chalk.yellow(`\nTotal Style Matches: ${hitCount} `));
    console.log("");
}

// --- CALLERS ---
async function runTest() {
    console.log(chalk.blue.bold("🧪 RUNNING 7-DAY HISTORY STYLE TEST...\n"));

    // 1. GEMINI 2.0 FLASH (Newer/Advanced)
    let proText = "";
    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${USER_PROMPT}` }] }]
        });
        proText = res.data.candidates[0]?.content?.parts[0]?.text;
    } catch (e) {
        console.error("Gemini 2.0 Error:", e.response?.data || e.message);
        proText = "Error: Model not available.";
    }

    // 2. GEMINI 1.5 FLASH (Current)
    let flashText = "";
    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
            contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${USER_PROMPT}` }] }]
        });
        flashText = res.data.candidates[0]?.content?.parts[0]?.text;
    } catch (e) { console.error("Gemini Flash Error:", e.message); }

    // --- ANALYSIS ---
    const cleanPro = cleanOutput(proText);
    const proSections = parseSections(cleanPro);
    const flashSections = parseSections(flashText || "");

    console.log(chalk.bgBlue.white(" === GEMINI 2.0 FLASH (Newer) === "));
    console.log(`A: ${proSections.A}`);
    analyzeStyle("GEMINI 2.0", proSections);

    console.log("\n" + chalk.bgMagenta.black(" === GEMINI 1.5 FLASH (Current) === "));
    console.log(`A: ${flashSections.A}`);
    analyzeStyle("GEMINI 1.5", flashSections);
}

runTest();
