const fs = require('fs');
const filePath = './users.json';

// Cek apakah file database ada
if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([]));
}

const loadUsers = () => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

// FUNGSI PENCARI PINTAR (Bisa cari pakai Nomor HP atau LID)
const getUserByPhone = (id) => {
    const users = loadUsers();
    // Cari user yang nomornya cocok ATAU lid-nya cocok
    return users.find(u => u.phone === id || u.lid === id);
};

// Fungsi Simpan User Baru
const saveUser = (phoneNumber, email, password) => {
    const users = loadUsers();
    const existingIndex = users.findIndex(u => u.phone === phoneNumber);

    const userData = { 
        phone: phoneNumber, 
        email, 
        password,
        lid: users[existingIndex]?.lid || null // Pertahankan LID lama jika ada
    };

    if (existingIndex !== -1) {
        users[existingIndex] = { ...users[existingIndex], ...userData };
    } else {
        users.push(userData);
    }

    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    return true;
};

// [BARU] Fungsi Khusus Simpan LID
const updateUserLid = (realPhoneNumber, lid) => {
    const users = loadUsers();
    const index = users.findIndex(u => u.phone === realPhoneNumber);

    if (index !== -1) {
        // Jika user ditemukan, tambahkan data LID ke dia
        users[index].lid = lid;
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        console.log(`[DB] LID ${lid} berhasil dikaitkan ke ${realPhoneNumber}`);
        return true;
    }
    return false;
};

module.exports = { getUserByPhone, saveUser, updateUserLid };