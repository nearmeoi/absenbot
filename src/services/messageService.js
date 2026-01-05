const fs = require('fs');
const path = require('path');

const MESSAGES_FILE = path.join(__dirname, '../config/messages.json');

// Ensure file exists
if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify({
        "morning_reminder": "Selamat pagi! ☀️",
        "afternoon_reminder": "Markipul! 🏠"
    }, null, 2));
}

function loadMessages() {
    try {
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

function saveMessages(messages) {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function getMessage(key) {
    const messages = loadMessages();
    return messages[key] || '';
}

function updateMessage(key, content) {
    const messages = loadMessages();
    messages[key] = content;
    saveMessages(messages);
    return messages;
}

module.exports = { loadMessages, saveMessages, getMessage, updateMessage };
