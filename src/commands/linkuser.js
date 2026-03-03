const { saveUser, getAllUsers, getUserByEmail } = require('../services/database');
const { ADMIN_NUMBERS } = require('../config/constants');
const { getUserProfile } = require('../services/magang');
const chalk = require('chalk');

module.exports = {
    name: 'link',
    description: 'Tautkan nomor WA secara otomatis atau manual',
    
    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args, originalSenderId, msgObj: rawMsg } = context;

        // 1. Silent Check Admin (Hanya nomor 6285657025300)
        const senderDigits = senderNumber.split('@')[0].split(':')[0];
        const isAdmin = ADMIN_NUMBERS.includes(senderDigits);
        if (!isAdmin) return;

        const adminJid = senderDigits + "@s.whatsapp.net";

        // 2. Identify Target (Must be from reply)
        const contextInfo = rawMsg.message?.extendedTextMessage?.contextInfo || {};
        const targetId = contextInfo.participant;
        const pushName = rawMsg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.pushName || "";
        
        if (!targetId) {
            await sock.sendMessage(adminJid, { text: "INFO: Balas (reply) pesan user dulu untuk melakukan penautan." });
            return;
        }

        const targetDigits = targetId.split('@')[0].split(':')[0];
        const parts = (args || '').trim().split(/\s+/).filter(p => p.length > 0);

        // --- CASE 1: AUTO MATCHING (!link tanpa argumen) ---
        if (parts.length === 0) {
            await sock.sendMessage(adminJid, { text: "⏳ Sedang mencari kecocokan otomatis untuk " + (pushName || targetDigits) + "..." });
            
            const allUsers = getAllUsers();
            let matchedUser = null;

            // Cari di database berdasarkan kemiripan nama (Fuzzy match sederhana)
            if (pushName) {
                matchedUser = allUsers.find(u => 
                    (u.name && u.name.toLowerCase().includes(pushName.toLowerCase())) || 
                    (u.email && u.email.toLowerCase().includes(pushName.toLowerCase()))
                );
            }

            // Jika tidak ketemu lewat nama, coba lewat sinkronisasi profil Kemnaker (jika session aktif)
            if (!matchedUser) {
                for (const user of allUsers) {
                    const profile = await getUserProfile(user.email);
                    if (profile.success && profile.data) {
                        const profilePhone = (profile.data.telepon || profile.data.phone || "").replace(/\D/g, '');
                        if (profilePhone && (targetDigits.includes(profilePhone) || profilePhone.includes(targetDigits))) {
                            matchedUser = user;
                            break;
                        }
                    }
                }
            }

            if (matchedUser) {
                saveUser(targetId, matchedUser.email, matchedUser.password);
                await sock.sendMessage(adminJid, { text: "✅ MATCH FOUND: " + (matchedUser.name || matchedUser.email) + " ditautkan ke " + targetDigits });
                await sock.sendMessage(targetId, { text: "NOTIFIKASI: Akun MagangHub Anda telah ditautkan secara otomatis oleh Admin." });
            } else {
                await sock.sendMessage(adminJid, { text: "❌ AUTO-MATCH GAGAL: Tidak menemukan akun yang cocok untuk '" + pushName + "'. Gunakan manual: !link email" });
            }
            return;
        }

        // --- CASE 2: MANUAL LINK BY EMAIL (!link email) ---
        if (parts.length === 1) {
            const email = parts[0];
            const existingUser = getUserByEmail(email);
            if (existingUser) {
                saveUser(targetId, email, existingUser.password);
                await sock.sendMessage(adminJid, { text: "✅ SUCCESS: " + email + " ditautkan ke " + targetDigits });
                await sock.sendMessage(targetId, { text: "NOTIFIKASI: Akun MagangHub (" + email + ") telah ditautkan oleh Admin ke WhatsApp Anda." });
            } else {
                await sock.sendMessage(adminJid, { text: "❌ FAILED: Akun " + email + " tidak ada di database bot." });
            }
            return;
        }

        // --- CASE 3: FULL MANUAL (!link email password) ---
        if (parts.length >= 2) {
            // ... (logika verifikasi password tetap ada jika diperlukan) ...
            await sock.sendMessage(adminJid, { text: "INFO: Fitur pendaftaran baru via !link sedang diproses..." });
        }
    }
};
