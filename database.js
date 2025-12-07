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

// [PENTING] Fungsi Ambil Semua User untuk !tagall
const getAllUsers = () => {
    return loadUsers();
};

const getUserByPhone = (id) => {
    const users = loadUsers();
    return users.find(u => u.phone === id || u.lid === id);
};

const saveUser = (phoneNumber, email, password) => {
    const users = loadUsers();
    
    // Normalisasi ID
    if (phoneNumber && !phoneNumber.includes('@')) {
        phoneNumber = phoneNumber + '@s.whatsapp.net';
    }

    const existingIndex = users.findIndex(u => u.phone === phoneNumber);

    const userData = { 
        phone: phoneNumber, 
        email, 
        password,
        lid: users[existingIndex]?.lid || null 
    };

    if (existingIndex !== -1) {
        users[existingIndex] = { ...users[existingIndex], ...userData };
    } else {
        users.push(userData);
    }

    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    return true;
};

const updateUserLid = (realPhoneNumber, lid) => {
    const users = loadUsers();
    const index = users.findIndex(u => u.phone === realPhoneNumber);

    if (index !== -1) {
        users[index].lid = lid;
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        return true;
    }
    return false;
};

module.exports = { getUserByPhone, saveUser, updateUserLid, getAllUsers };