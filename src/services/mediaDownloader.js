/**
 * Media Downloader Service
 * Extracted and optimized scrapers
 */
const axios = require('axios');
const cheerio = require('cheerio');
const BodyForm = require('form-data');

/**
 * TikTok Downloader (via TikWM)
 */
async function tiktokDl(url) {
    try {
        const domain = 'https://www.tikwm.com/api/';
        const response = await axios.post(domain, {}, {
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
            },
            params: { url: url, count: 12, cursor: 0, web: 1, hd: 1 }
        });

        const res = response.data.data;
        if (!res) throw new Error("Gagal mengambil data TikTok");

        const data = [];
        if (res.duration === 0) {
            res.images.forEach(v => data.push({ type: 'photo', url: v }));
        } else {
            data.push({
                type: 'watermark',
                url: 'https://www.tikwm.com' + res.wmplay
            }, {
                type: 'nowatermark',
                url: 'https://www.tikwm.com' + res.play
            }, {
                type: 'nowatermark_hd',
                url: 'https://www.tikwm.com' + res.hdplay
            });
        }

        return {
            status: true,
            title: res.title,
            author: res.author?.nickname,
            duration: res.duration + ' Seconds',
            data: data
        };
    } catch (e) {
        console.error("[DOWNLOADER] TikTok Error:", e.message);
        throw e;
    }
}

/**
 * Mediafire Downloader
 */
async function mediafireDl(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        
        const fileName = $('.dl-btn-label').attr('title') || $('meta[property="og:title"]').attr('content');
        const fileSize = $('.details li:contains("File size") span').text().trim();
        const downloadUrl = $('.download_link a.input').attr('href') || $('#downloadButton').attr('href');
        
        return {
            fileName,
            fileSize,
            downloadUrl
        };
    } catch (e) {
        console.error("[DOWNLOADER] Mediafire Error:", e.message);
        throw e;
    }
}

/**
 * Pinterest Search/Downloader
 */
async function pinterestSearch(query) {
    try {
        const url = 'https://www.pinterest.com/resource/BaseSearchResource/get/';
        const params = {
            source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
            data: JSON.stringify({
                options: {
                    isPrefetch: false,
                    query: query,
                    scope: 'pins',
                    no_fetch_context_on_resource: false
                },
                context: {}
            })
        };
        
        const res = await axios.get(url, { params });
        const results = res.data.resource_response?.data?.results || [];
        
        return results.map(v => ({
            id: v.id,
            title: v.title,
            image: v.images?.['736x']?.url
        }));
    } catch (e) {
        console.error("[DOWNLOADER] Pinterest Error:", e.message);
        throw e;
    }
}

module.exports = {
    tiktokDl,
    mediafireDl,
    pinterestSearch
};
