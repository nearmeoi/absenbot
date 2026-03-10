/**
 * Message Utils
 * Common utilities for message parsing and handling
 */

/**
 * Parse draft from user-edited message
 * @param {string} text - Message text
 * @returns {Object|null} Parsed draft object or null
 */
function parseDraftFromMessage(text) {
    let cleanText = text;

    // Pre-processing: Strip terminal/chat prefixes like "[15.05.27] ME:" or "[15.05.27] +62 812..."
    // This allows users to copy-paste directly from logs/terminals
    cleanText = cleanText.replace(/^\[\d{2}\.\d{2}\.\d{2}\] \w+: /g, ''); // Single line
    cleanText = cleanText.replace(/\n\[\d{2}\.\d{2}\.\d{2}\] \w+: /g, '\n'); // Multi line occurrences

    // Remove headers
    cleanText = cleanText.replace(/\*DRAF LAPORAN ANDA\*/i, '');
    cleanText = cleanText.replace(/\*DRAF LAPORAN OTOMATIS\*/i, '');
    cleanText = cleanText.replace(/Draf absen darurat/i, '');
    cleanText = cleanText.replace(/\*DRAF DIPERBARUI\*[^\n]*/i, '');

    // Remove footer instructions
    const instructionPatterns = [
        /(\n\s*)?_?Ketik\s+(\*ya\*)?\s*untuk\s+kirim\.?_?[\s\S]*$/i,
        /(\n\s*)?_?Ketik\s+(\*ya\*)?\s*untuk\s+mengirim\s+laporan[\s\S]*$/i,
        /(\n\s*)?\(ketik\s+ya\s+untuk\s+kirim\)[\s\S]*$/i,
        /(\n\s*)?_?Ketik\s+(\*ya\*)?\s*untuk\s+kirim,\s+atau[\s\S]*$/i,
        /(\n\s*)?_?Silakan\s+salin\s+pesan\s+di\s+atas[\s\S]*$/i, // Template instruction
        /(\n\s*)?_?Salin\s+pesan\s+ini[\s\S]*$/i // Generic copy instruction
    ];

    for (const pattern of instructionPatterns) {
        cleanText = cleanText.replace(pattern, '');
    }

    cleanText = cleanText.replace(/(?<!\w)\*ya\*(?!\w)/g, '');

    // Parse sections
    const parseSection = (label) => {
        const regex = new RegExp(`\\*${label}:\\*\\s*(\\([\\d]+\\s*karakter\\))?\\s*([\\s\\S]*?)(?=\\*\\w+:|$)`, 'i');
        const match = cleanText.match(regex);
        return match ? match[2].trim() : '';
    };

    const aktivitas = parseSection('Aktivitas');
    const pembelajaran = parseSection('Pembelajaran');
    const kendala = parseSection('Kendala');

    if (!aktivitas && !pembelajaran) return null;

    return {
        aktivitas: aktivitas || '',
        pembelajaran: pembelajaran || '',
        kendala: kendala || 'Tidak ada kendala.',
        type: 'manual'
    };
}

/**
 * Parse report from hashtag format (#aktivitas ... #pembelajaran ...)
 * @param {string} text - Message text
 * @returns {Object|null} Parsed report object or null
 */
function parseTagBasedReport(text) {
    if (!text) return null;
    
    // Check if at least one tag exists
    if (!text.includes('#aktivitas') && !text.includes('#pembelajaran')) {
        return null;
    }

    const parseTag = (tag) => {
        const regex = new RegExp(`#${tag}\\s*([\\s\\S]*?)(?=#|$)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    };

    const aktivitas = parseTag('aktivitas');
    const pembelajaran = parseTag('pembelajaran');
    const kendala = parseTag('kendala');

    return {
        aktivitas,
        pembelajaran,
        kendala: kendala || "Tidak ada kendala.",
        type: 'manual'
    };
}

/**
 * Normalize phone number to standard format, maintaining @lid if present
 * @param {string} phone 
 * @returns {string} Normalized identifier
 */
function normalizeToStandard(phone) {
    if (!phone) return '';
    // Jika LID, ambil bagian sebelum @lid dan tambahkan kembali @lid (buang :device jika ada)
    if (phone.includes('@lid')) {
        return phone.split('@')[0] + '@lid';
    }
    
    let digits = phone.split('@')[0].split(':')[0].replace(/\D/g, '');
    return digits + '@s.whatsapp.net';
}

module.exports = {
    parseDraftFromMessage,
    parseTagBasedReport,
    normalizeToStandard
};
