const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const axios = require('axios');
const execPromise = util.promisify(exec);

const PLATFORM_CONFIG = [
    { name: 'TikTok', hosts: ['tiktok.com'], endpoint: 'tiktok' },
    { name: 'Facebook', hosts: ['facebook.com', 'fb.watch', 'fb.com'], endpoint: 'facebook' },
    { name: 'Instagram', hosts: ['instagram.com'], endpoint: 'instagram' },
    { name: 'Twitter', hosts: ['twitter.com', 'x.com'], endpoint: 'twitter' },
    { name: 'YouTube', hosts: ['youtube.com', 'youtu.be'], endpoint: 'youtube' },
    { name: 'Capcut', hosts: ['capcut.com'], endpoint: 'capcut' },
    { name: 'Spotify', hosts: ['spotify.com'], endpoint: 'spotify' },
    { name: 'Threads', hosts: ['threads.net'], endpoint: 'threads' },
    { name: 'Pinterest', hosts: ['pinterest.com', 'pin.it'], endpoint: 'pinterest' },
    { name: 'Douyin', hosts: ['douyin.com'], endpoint: 'douyin' },
    { name: 'SnackVideo', hosts: ['snackvideo.com', 'sck.io'], endpoint: 'snackvideo' },
    { name: 'Bilibili', hosts: ['bilibili.com', 'b.tv'], endpoint: 'bilibili' },
    { name: 'Mediafire', hosts: ['mediafire.com'], endpoint: 'mediafire' },
    { name: 'Terabox', hosts: ['terabox.com', 'teraboxapp.com'], endpoint: 'terabox' },
    { name: 'SoundCloud', hosts: ['soundcloud.com'], endpoint: 'soundcloud' },
    { name: 'Twitch', hosts: ['twitch.tv'], endpoint: 'twitchclip' },
    { name: 'Videy', hosts: ['videy.co'], endpoint: 'videy' },
    { name: 'PixelDrain', hosts: ['pixeldrain.com'], endpoint: 'pixeldrain' }
];

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

            // --- AUTO-DETECT PLATFORM & GIMITA API ---
            const platform = PLATFORM_CONFIG.find(p => p.hosts.some(h => url.includes(h)));
            
            if (platform) {
                console.log(`[DL] Using Gimita API for ${platform.name}: ${url}`);
                try {
                    const apiKey = process.env.GIMITA_API_KEY;
                    const response = await axios.get(`https://api.gimita.id/api/downloader/${platform.endpoint}?url=${encodeURIComponent(url)}`, {
                        headers: { "Authorization": `Bearer ${apiKey}` },
                        timeout: 45000
                    });

                    if (response.data && response.data.success && response.data.data) {
                        const resData = response.data.data;
                        
                        // Handle Video
                        const videoUrl = resData.video?.hd || resData.video?.sd || resData.video?.url || (typeof resData.video === 'string' ? resData.video : null);
                        
                        // Handle Images (e.g. Instagram slides, Pinterest)
                        const images = resData.images || resData.photo || [];
                        
                        // Handle Audio (e.g. Spotify, SoundCloud)
                        const audioUrl = resData.audio?.url || (typeof resData.audio === 'string' ? resData.audio : null);

                        const title = resData.title || `${platform.name} Media`;

                        if (videoUrl) {
                            const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
                            await sock.sendMessage(sender, { 
                                video: Buffer.from(videoRes.data),
                                caption: `✅ *${title}*\n\nPlatform: ${platform.name}\nURL: ${url}`
                            }, { quoted: msg });
                            await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                            return;
                        } else if (images.length > 0) {
                            for (const img of images) {
                                const imgUrl = typeof img === 'string' ? img : img.url;
                                const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
                                await sock.sendMessage(sender, { image: Buffer.from(imgRes.data) });
                            }
                            await sock.sendMessage(sender, { text: `✅ Downloaded ${images.length} images from ${platform.name}` }, { quoted: msg });
                            await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                            return;
                        } else if (audioUrl) {
                            const audioRes = await axios.get(audioUrl, { responseType: 'arraybuffer' });
                            await sock.sendMessage(sender, { 
                                audio: Buffer.from(audioRes.data),
                                mimetype: 'audio/mp4',
                                ptt: false
                            }, { quoted: msg });
                            await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });
                            return;
                        }
                    }
                } catch (apiError) {
                    console.error(`[DL] Gimita API (${platform.name}) Error:`, apiError.message);
                }
            }

            /**
             * FALLBACK: yt-dlp (For generic sites or if API fails)
             */
            const impersonate = url.includes('tiktok.com') ? '--impersonate chrome' : '';
            const dlCmd = `python3 -m yt_dlp ${impersonate} --no-playlist --max-filesize 50M -f "mp4/best" --add-header "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -o "${outputPath}" "${url}"`;
            
            console.log(`[DL] Executing yt-dlp: ${dlCmd}`);
            await execPromise(dlCmd);

            if (fs.existsSync(outputPath)) {
                await sock.sendMessage(sender, { 
                    video: fs.readFileSync(outputPath),
                    caption: `✅ Downloaded: ${url}`
                }, { quoted: msg });
                await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });
            } else {
                throw new Error('Fallback failed to produce file');
            }

        } catch (error) {
            console.error('[DL] Final Error:', error.message);
            await sock.sendMessage(sender, { text: `❌ Gagal download media.\n_Error: ${error.message.substring(0, 100)}_` }, { quoted: msg });
            await sock.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        } finally {
            if (fs.existsSync(outputPath)) {
                try { fs.unlinkSync(outputPath); } catch (e) {}
            }
        }
    }
};