const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);

const envPath = path.join(__dirname, '.env');
let envContent = fs.readFileSync(envPath, 'utf8');

if (!envContent.includes('VAPID_PUBLIC_KEY')) {
    envContent += `

# WEB PUSH NOTIFICATIONS`;
    envContent += `
VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`;
    envContent += `
VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`;
    envContent += `
VAPID_SUBJECT=mailto:admin@monev-absenbot.my.id`;
    
    fs.writeFileSync(envPath, envContent);
    console.log('VAPID Keys added to .env');
} else {
    console.log('VAPID Keys already exist in .env');
}
