/**
 * Command: !menu / !hai
 * Shows the main menu with bot information
 */
import fs from 'fs';
import path from 'path';
import { getMessage } from '../services/messageService.js';
import { sendInteractiveMessage } from '../utils/interactiveMessage.js';

const COVER_IMAGE = path.join(process.cwd(), 'public/img/cover.png');

export default {
    name: ['menu', 'hai', 'help'],
    description: 'Tampilkan menu utama',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber } = context;

        // 1. Check Status for Dynamic Button
        const { getUserByPhone } = await import('../services/database.js');
        const { cekStatusHarian } = await import('../services/magang.js');
        const user = getUserByPhone(senderNumber);
        
        let isAttended = false;
        if (user) {
            const status = await cekStatusHarian(user.email, user.password).catch(() => ({ success: false }));
            isAttended = status.success && status.sudahAbsen;
        }

        const body = `*MAGANGHUB ASSISTANT*
Asisten pintar absensi Kemnaker.

*FITUR UTAMA*
!absen - Lapor harian (AI)
!cek - Status hari ini
!cekapprove - Siklus bulanan
!riwayat - Log 7 hari
!ai - Tanya AI
!s - Sticker

_Silakan klik tombol di bawah:_`;

        const { getAppUrl } = await import('../services/messageService.js');
        const userUrl = getAppUrl(senderNumber);
        const MONEV_REAL_URL = 'https://monev.maganghub.kemnaker.go.id/dashboard';

        const buttons = [
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'ABSEN SEKARANG', id: '!absen' }) },
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'CEK ABSEN', id: '!cek' }) },
            { name: 'quick_reply', params: JSON.stringify({ display_text: 'CEK APPROVE', id: '!cekapprove' }) }
        ];

        // Dynamic URL Button
        if (isAttended) {
            buttons.push({ name: 'cta_url', params: JSON.stringify({ display_text: 'MONEV WEB', url: MONEV_REAL_URL, merchant_url: MONEV_REAL_URL }) });
        } else {
            buttons.push({ name: 'cta_url', params: JSON.stringify({ display_text: 'ABSEN WEB', url: userUrl, merchant_url: userUrl }) });
        }

        try {
            await sendInteractiveMessage(sock, sender, {
                body: body,
                buttons: buttons,
                image: fs.existsSync(COVER_IMAGE) ? COVER_IMAGE : null
            }, { quoted: msgObj });

        } catch (menuError) {
            console.error('[CMD:MENU] Error sending interactive menu:', menuError.message);
            // Fallback to simple text menu
            const info = getMessage('!menu', senderNumber);
            await sock.sendMessage(sender, { text: info }, { quoted: msgObj });
        }
    }
};
