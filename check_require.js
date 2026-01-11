const fs = require('fs');
const path = require('path');

const dir = './src/commands';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

for (const file of files) {
    try {
        console.log(`Checking ${file}...`);
        require(path.join(process.cwd(), dir, file));
        console.log(`✅ ${file} is OK`);
    } catch (e) {
        console.error(`❌ ${file} failed:`, e.message);
        if (e.stack) console.error(e.stack);
    }
}

const servicesDir = './src/services';
const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));
for (const file of serviceFiles) {
    try {
        console.log(`Checking service ${file}...`);
        require(path.join(process.cwd(), servicesDir, file));
        console.log(`✅ ${file} is OK`);
    } catch (e) {
        console.error(`❌ ${file} failed:`, e.message);
        if (e.stack) console.error(e.stack);
    }
}
