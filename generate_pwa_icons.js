const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'client/public');
const icon192 = path.join(publicDir, 'pwa-192x192.png');
const icon512 = path.join(publicDir, 'pwa-512x512.png');

// Create a simple SVG buffer for the icon
const svgBuffer = Buffer.from(`
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#FACC15"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-weight="bold" font-size="200" fill="black" text-anchor="middle" dy=".3em">MV</text>
</svg>
`);

async function generateIcons() {
    console.log('Generating PWA Icons...');
    
    await sharp(svgBuffer)
        .resize(192, 192)
        .toFile(icon192);
    console.log('Created pwa-192x192.png');

    await sharp(svgBuffer)
        .resize(512, 512)
        .toFile(icon512);
    console.log('Created pwa-512x512.png');
}

generateIcons().catch(console.error);