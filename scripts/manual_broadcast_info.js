const { getAllUsers } = require('../src/services/database');
const { initScheduler, setBotSocket } = require('../src/services/scheduler');
const { connectToWhatsApp } = require('../src/app');
const chalk = require('chalk');

// This script needs a running bot or we need to wait for it to connect
// Since the bot is already running via PM2, we can't easily grab its 'sock' object from another process.
// However, we can create a temporary connection or just tell the user to use the command.

console.log(chalk.yellow("Bot sedang jalan di PM2. Kamu bisa melakukan broadcast langsung via WhatsApp."));
console.log(chalk.cyan("Caranya: Ketik '!broadcast [pesan]' di chat WA ke nomor bot (Hanya Admin)."));
console.log("");
console.log(chalk.white("Daftar nomor Admin yang terdaftar:"));
const { ADMIN_NUMBERS } = require('../src/config/constants');
ADMIN_NUMBERS.forEach(num => console.log(`- ${num}`));

console.log("");
console.log(chalk.gray("Jika ingin saya (AI) yang mengirimkannya sekarang via skrip ini, saya perlu membuat koneksi baru, tapi itu akan memutus koneksi bot yang sedang jalan di PM2."));
console.log(chalk.yellow("Saran: Gunakan saja perintah '!broadcast' langsung dari WhatsApp Anda."));
