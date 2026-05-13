const fs = require("fs");
const { USERS_FILE } = require('../config/constants');

// Antrian tulis untuk mencegah race condition
let antrianTulis = Promise.resolve();
const tulisFileAman = (path, data) => {
    antrianTulis = antrianTulis.then(() => {
        return new Promise((resolve, reject) => {
            fs.writeFile(path, data, 'utf8', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }).catch(err => {
        console.error('[DATABASE] Gagal menulis:', err.message);
    });
    return antrianTulis;
};

// Cache di memori
let cacheUser = null;

const muatUser = () => {
    if (cacheUser) return structuredClone(cacheUser);

    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify([]));
            cacheUser = [];
            return [];
        }

        const data = fs.readFileSync(USERS_FILE, "utf8");
        const parsed = JSON.parse(data);
        
        // Validasi data: Pastikan tidak ada path file yang masuk sebagai phone/lid
        cacheUser = parsed.filter(u => {
            if (!u.email) return false;
            // Jika phone/lid mengandung path atau ekstensi file, abaikan
            const isPath = (str) => {
                if (!str) return false;
                const s = str.toLowerCase();
                return s.includes('/') || s.includes('\\') || s.endsWith('.json') || 
                       s.includes('sesiwa') || s.includes('sessions') || 
                       s.includes('sender-key') || s.includes('device-list');
            };

            if (isPath(u.phone)) {
                console.warn(`[DATABASE] Menghapus user dengan phone tidak valid: ${u.phone}`);
                return false;
            }
            if (isPath(u.lid)) {
                console.warn(`[DATABASE] Menghapus user dengan LID tidak valid: ${u.lid}`);
                return false;
            }
            if (u.identifiers && Array.isArray(u.identifiers)) {
                if (u.identifiers.some(id => isPath(id))) {
                    console.warn(`[DATABASE] Menghapus user dengan identifiers tidak valid: ${u.email}`);
                    return false;
                }
            }
            return true;
        });

        return [...cacheUser];
    } catch (e) {
        console.error('[DATABASE] Gagal memuat:', e.message);
        return [];
    }
};

/**
 * Update memori dan simpan ke disk
 */
const perbaruiUser = (users) => {
    cacheUser = [...users];
    return tulisFileAman(USERS_FILE, JSON.stringify(users, null, 2));
};

// Helper: Normalisasi nomor HP
const normalisasiHP = (phone) => {
    if (!phone) return '';
    let hasil = phone.split('@')[0].split(':')[0];
    hasil = hasil.replace(/\D/g, '');
    return hasil;
};

// Cari user berdasarkan phone, LID, atau identifiers
const cariUserHP = (id) => {
    const users = muatUser();
    const idNormal = normalisasiHP(id);

    return users.find(u => {
        if (normalisasiHP(u.phone) === idNormal) return true;
        if (u.phone === id) return true;
        if (u.lid && (normalisasiHP(u.lid) === idNormal || u.lid === id)) return true;
        if (u.identifiers && Array.isArray(u.identifiers)) {
            for (const identifier of u.identifiers) {
                if (normalisasiHP(identifier) === idNormal || identifier === id) return true;
            }
        }
        return false;
    });
};

// Cari user berdasarkan email
const cariUserEmail = (email) => {
    const users = muatUser();
    return users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
};

// Cari user berdasarkan slug
const cariUserSlug = (slug) => {
    const users = muatUser();
    return users.find(u => u.slug === slug);
};

// Ambil semua user (deduplicate berdasarkan email)
const semuaUser = () => {
    const users = muatUser();
    const unik = [];
    const emailSudah = new Set();

    for (const user of users) {
        if (!user.email) continue;
        const kunci = user.email.toLowerCase();
        if (!emailSudah.has(kunci)) {
            emailSudah.add(kunci);
            unik.push(user);
        }
    }
    return unik;
};

// Simpan atau update user
const simpanUser = (nomorHP, email, password) => {
    // Validasi input: Jangan simpan jika nomorHP terlihat seperti path file
    if (!nomorHP || nomorHP.includes('/') || nomorHP.includes('\\')) {
        console.error(`[DATABASE] Mencoba menyimpan nomor HP tidak valid: ${nomorHP}`);
        return false;
    }

    const users = muatUser();

    // Normalisasi phone
    if (nomorHP && !nomorHP.includes("@")) {
        nomorHP = nomorHP + "@s.whatsapp.net";
    }

    // Cek apakah email sudah ada (untuk auto-link)
    const idxEmail = users.findIndex(u =>
        u.email && u.email.toLowerCase() === email.toLowerCase()
    );

    if (idxEmail !== -1) {
        const user = users[idxEmail];

        // Inisialisasi identifiers jika belum ada
        if (!user.identifiers) {
            user.identifiers = [];
            if (user.phone) user.identifiers.push(user.phone);
            if (user.lid) user.identifiers.push(user.lid);
        }

        // Tambahkan phone baru ke identifiers jika belum ada
        const hpNormal = normalisasiHP(nomorHP);
        const sudahAda = user.identifiers.some(id => normalisasiHP(id) === hpNormal);

        if (!sudahAda) {
            user.identifiers.push(nomorHP);
        }

        // Update phone utama jika yang baru bukan LID
        if (user.phone.includes('@lid') && !nomorHP.includes('@lid')) {
            user.phone = nomorHP;
        }

        user.password = password;
        user.lastLogin = new Date().toISOString();

    } else {
        // User baru
        users.push({
            phone: nomorHP,
            email,
            password,
            identifiers: [nomorHP],
            registeredAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        });
    }

    perbaruiUser(users);
    return true;
};

const updateLidUser = (nomorAsli, lid) => {
    // Validasi input
    if (!lid || lid.includes('/') || lid.includes('\\')) {
        console.error(`[DATABASE] Mencoba update LID tidak valid: ${lid}`);
        return false;
    }

    const users = muatUser();
    const hpNormal = normalisasiHP(nomorAsli);
    const idx = users.findIndex(u => normalisasiHP(u.phone) === hpNormal);

    if (idx !== -1) {
        users[idx].lid = lid;

        if (!users[idx].identifiers) users[idx].identifiers = [users[idx].phone];
        if (!users[idx].identifiers.includes(lid)) {
            users[idx].identifiers.push(lid);
        }

        perbaruiUser(users);
        return true;
    }
    return false;
};

const hapusUser = (nomorHP) => {
    const users = muatUser();
    const hpNormal = normalisasiHP(nomorHP);

    const idx = users.findIndex(u => {
        if (normalisasiHP(u.phone) === hpNormal) return true;
        if (u.lid && normalisasiHP(u.lid) === hpNormal) return true;
        if (u.identifiers) {
            return u.identifiers.some(id => normalisasiHP(id) === hpNormal);
        }
        return false;
    });

    if (idx !== -1) {
        users.splice(idx, 1);
        perbaruiUser(users);
        return true;
    }
    return false;
};

const simpanTemplateUser = (nomorHP, templateData) => {
    const users = muatUser();
    const hpNormal = normalisasiHP(nomorHP);
    const idx = users.findIndex(u => {
        if (normalisasiHP(u.phone) === hpNormal) return true;
        if (u.lid && normalisasiHP(u.lid) === hpNormal) return true;
        if (u.identifiers) {
            return u.identifiers.some(id => normalisasiHP(id) === hpNormal);
        }
        return false;
    });

    if (idx !== -1) {
        users[idx].template = templateData;
        perbaruiUser(users);
        return true;
    }
    return false;
};

/**
 * Simpan konteks/persona khusus user (biar AI ingat dia siapa & ngerjain apa)
 */
const simpanKonteksUser = (email, konteks) => {
    const users = muatUser();
    const idx = users.findIndex(u => u.email && u.email.toLowerCase() === email.toLowerCase());

    if (idx !== -1) {
        users[idx].context = konteks;
        perbaruiUser(users);
        return true;
    }
    return false;
};

const ambilKonteksUser = (email) => {
    const user = cariUserEmail(email);
    return user ? user.context : null;
};

module.exports = {
    // Nama baru
    cariUserHP,
    cariUserEmail,
    cariUserSlug,
    simpanUser,
    updateLidUser,
    semuaUser,
    hapusUser,
    simpanTemplateUser,
    simpanKonteksUser,
    ambilKonteksUser,

    // Alias backward compat
    getUserByPhone: cariUserHP,
    getUserByEmail: cariUserEmail,
    getUserBySlug: cariUserSlug,
    saveUser: simpanUser,
    updateUserLid: updateLidUser,
    getAllUsers: semuaUser,
    deleteUser: hapusUser,
    saveUserTemplate: simpanTemplateUser
};
