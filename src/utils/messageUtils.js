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
        // Updated regex to be flexible with * markers and whitespace
        // Matches: *Aktivitas:*, Aktivitas:, * AKTIVITAS *, etc.
        const regex = new RegExp(`(?:\\*?\\s*${label}\\s*\\*?\\s*:?)\\s*(\\([\\d]+\\s*karakter\\))?\\s*([\\s\\S]*?)(?=\\n\\s*\\*?\\s*(?:Aktivitas|Pembelajaran|Kendala)\\s*\\*?\\s*:?|$)`, 'i');
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
    if (phone.includes('@lid')) {
        // Maintain LID as is (including the @lid suffix)
        return phone.split(':')[0];
    }
    
    let digits = phone.split('@')[0].split(':')[0].replace(/\D/g, '');
    return digits + '@s.whatsapp.net';
}

/**
 * Extract message content from various WhatsApp message types
 * @param {Object} m - The message object
 * @returns {string} The text content
 */
function getMessageContent(m) {
    if (!m || !m.message) return '';
    
    const message = m.message;
    const type = Object.keys(message)[0];

    // Handle standard text messages
    if (type === 'conversation') return message.conversation;
    if (type === 'extendedTextMessage') return message.extendedTextMessage.text;
    
    // Handle interactive messages (buttons/list)
    if (type === 'buttonsResponseMessage') return message.buttonsResponseMessage.selectedButtonId;
    if (type === 'listResponseMessage') return message.listResponseMessage.singleSelectReply.selectedRowId;
    if (type === 'templateButtonReplyMessage') return message.templateButtonReplyMessage.selectedId;

    // Handle media captions
    if (type === 'imageMessage') return message.imageMessage.caption || '';
    if (type === 'videoMessage') return message.videoMessage.caption || '';
    if (type === 'documentMessage') return message.documentMessage.caption || '';
    
    // Handle edited messages (protocolMessage)
    if (type === 'protocolMessage' && message.protocolMessage.editedMessage) {
        return getMessageContent({ message: message.protocolMessage.editedMessage });
    }

    return '';
}

export {
    parseDraftFromMessage,
    parseTagBasedReport,
    normalizeToStandard,
    getMessageContent
};
