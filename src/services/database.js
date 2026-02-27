const fs = require("fs");
const { USERS_FILE } = require('../config/constants');

// Write queue to prevent race conditions
let writeQueue = Promise.resolve();
const safeWriteFile = (path, data) => {
    writeQueue = writeQueue.then(() => {
        return new Promise((resolve, reject) => {
            fs.writeFile(path, data, 'utf8', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }).catch(err => {
        console.error('[DATABASE] Write error:', err.message);
    });
    return writeQueue;
};

// In-memory cache
let cachedUsers = null;

const loadUsers = () => {
    // 1. Return from memory if available
    if (cachedUsers) return [...cachedUsers];

    // 2. Otherwise load from disk
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify([]));
            cachedUsers = [];
            return [];
        }

        const data = fs.readFileSync(USERS_FILE, "utf8");
        cachedUsers = JSON.parse(data);
        return [...cachedUsers];
    } catch (e) {
        console.error('[DATABASE] Load error:', e.message);
        return [];
    }
};

/**
 * Update memory and persist to disk
 */
const updateUsers = (users) => {
    cachedUsers = [...users];
    return safeWriteFile(USERS_FILE, JSON.stringify(users, null, 2));
};

// ... replace all safeWriteFile(USERS_FILE, ...) with updateUsers(users) ...


// Helper: Normalisasi nomor telepon
const normalizePhone = (phone) => {
    if (!phone) return '';
    let normalized = phone.split('@')[0].split(':')[0];
    normalized = normalized.replace(/\D/g, '');
    return normalized;
};

// Cari user berdasarkan phone, LID, atau identifiers lainnya
const getUserByPhone = (id) => {
    const users = loadUsers();
    const normalizedId = normalizePhone(id);

    return users.find(u => {
        // Cek phone utama
        if (normalizePhone(u.phone) === normalizedId) return true;
        if (u.phone === id) return true;

        // Cek LID
        if (u.lid && (normalizePhone(u.lid) === normalizedId || u.lid === id)) return true;

        // Cek identifiers array
        if (u.identifiers && Array.isArray(u.identifiers)) {
            for (const identifier of u.identifiers) {
                if (normalizePhone(identifier) === normalizedId || identifier === id) return true;
            }
        }

        return false;
    });
};

// Cari user berdasarkan email
const getUserByEmail = (email) => {
    const users = loadUsers();
    return users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
};

// Cari user berdasarkan slug
const getUserBySlug = (slug) => {
    const users = loadUsers();
    return users.find(u => u.slug === slug);
};

// Ambil semua user (dengan deduplicate)
const getAllUsers = () => {
    const users = loadUsers();
    const uniqueUsers = [];
    const seenEmails = new Set();

    for (const user of users) {
        if (!user.email) continue;
        const emailKey = user.email.toLowerCase();
        if (!seenEmails.has(emailKey)) {
            seenEmails.add(emailKey);
            uniqueUsers.push(user);
        }
    }
    return uniqueUsers;
};

// Simpan atau update user
const saveUser = (phoneNumber, email, password) => {
    const users = loadUsers();

    // Normalisasi phone
    if (phoneNumber && !phoneNumber.includes("@")) {
        phoneNumber = phoneNumber + "@s.whatsapp.net";
    }

    // Cek apakah email sudah ada (untuk auto-link)
    const existingByEmail = users.findIndex(u =>
        u.email && u.email.toLowerCase() === email.toLowerCase()
    );

    if (existingByEmail !== -1) {
        // Email sudah ada - tambahkan identifier baru
        const user = users[existingByEmail];

        // Inisialisasi identifiers jika belum ada
        if (!user.identifiers) {
            user.identifiers = [];
            if (user.phone) user.identifiers.push(user.phone);
            if (user.lid) user.identifiers.push(user.lid);
        }

        // Tambahkan phone baru ke identifiers jika belum ada
        const normalizedNew = normalizePhone(phoneNumber);
        const alreadyExists = user.identifiers.some(id => normalizePhone(id) === normalizedNew);

        if (!alreadyExists) {
            user.identifiers.push(phoneNumber);
        }

        // Update phone utama jika yang baru adalah format yang lebih baik (bukan LID)
        if (user.phone.includes('@lid') && !phoneNumber.includes('@lid')) {
            user.phone = phoneNumber;
        }

        user.password = password;
        user.lastLogin = new Date().toISOString();

    } else {
        // User baru
        users.push({
            phone: phoneNumber,
            email,
            password,
            identifiers: [phoneNumber],
            registeredAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        });
    }

    updateUsers(users);
    return true;
};

const updateUserLid = (realPhoneNumber, lid) => {
    const users = loadUsers();
    const normalizedPhone = normalizePhone(realPhoneNumber);
    const index = users.findIndex(u => normalizePhone(u.phone) === normalizedPhone);

    if (index !== -1) {
        users[index].lid = lid;

        // Tambahkan LID ke identifiers
        if (!users[index].identifiers) users[index].identifiers = [users[index].phone];
        if (!users[index].identifiers.includes(lid)) {
            users[index].identifiers.push(lid);
        }

        updateUsers(users);
        return true;
    }
    return false;
};

const deleteUser = (phoneNumber) => {
    const users = loadUsers();
    const normalizedPhone = normalizePhone(phoneNumber);

    const index = users.findIndex(u => {
        if (normalizePhone(u.phone) === normalizedPhone) return true;
        if (u.lid && normalizePhone(u.lid) === normalizedPhone) return true;
        if (u.identifiers) {
            return u.identifiers.some(id => normalizePhone(id) === normalizedPhone);
        }
        return false;
    });

    if (index !== -1) {
        users.splice(index, 1);
        updateUsers(users);
        return true;
    }
    return false;
};

const saveUserTemplate = (phoneNumber, templateData) => {
    const users = loadUsers();
    const normalizedPhone = normalizePhone(phoneNumber);
    const index = users.findIndex(u => {
        if (normalizePhone(u.phone) === normalizedPhone) return true;
        if (u.lid && normalizePhone(u.lid) === normalizedPhone) return true;
        if (u.identifiers) {
            return u.identifiers.some(id => normalizePhone(id) === normalizedPhone);
        }
        return false;
    });

    if (index !== -1) {
        users[index].template = templateData;
        updateUsers(users);
        return true;
    }
    return false;
};

module.exports = { getUserByPhone, getUserByEmail, getUserBySlug, saveUser, updateUserLid, getAllUsers, deleteUser, saveUserTemplate };
