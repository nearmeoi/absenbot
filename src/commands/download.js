const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const axios = require('axios');
const execPromise = (cmd, opts) => new Promise((resolve, reject) => {
    exec(cmd, opts, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve({ stdout, stderr });
    });
});

module.exports = {
    name: ['dl', 'download', 'ytdl'],
    description: 'Download media dari berbagai platform (TikTok, FB, IG, YT, dll)',
    async execute(sock, msg, context) {
        const { sender, args } = context;
        const url = args.trim();

        if (!url) {
            return await sock.sendMessage(sender, {
                text: 'Usage: !dl [URL]'
            }, { quoted: msg });
        }

        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const timestamp = Date.now();
        const outputPath = path.join(tempDir, `dl_${timestamp}.mp4`);

        try {
            await sock.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

            const ytDlpPath = '/home/ubuntu/.local/bin/yt-dlp';
            const dlCmd = `${ytDlpPath} -4 --no-playlist --max-filesize 50M -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -o "${outputPath}" "${url}"`;

            console.log(`[DL] Executing yt-dlp: ${dlCmd}`);
            await execPromise(dlCmd);

            if (fs.existsSync(outputPath)) {
                await sock.sendMessage(sender, {
                    video: fs.readFileSync(outputPath),
                    caption: `✅ Downloaded: ${url}`
                }, { quoted: msg });
                await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });
            } else {
                throw new Error('Failed to produce file');
            }

        } catch (error) {
            console.error('[DL] Final Error:', error.message);
            await sock.sendMessage(sender, { text: `❌ Gagal download media.\n_Error: ${error.message.substring(0, 100)}_` }, { quoted: msg });
            await sock.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        } finally {
            if (fs.existsSync(outputPath)) {
                try { fs.unlinkSync(outputPath); } catch (e) { }
            }
        }
    }
};
