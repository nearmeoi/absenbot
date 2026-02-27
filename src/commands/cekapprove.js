const { getUserByPhone, getAllUsers } = require('../services/database');
const { getDashboardStats, getRiwayat, detectCycleDay, getParticipantProfile, getUserProfile } = require('../services/magang');
const { getMessage } = require('../services/messageService');
const { isHoliday } = require('../config/holidays');
const { ADMIN_NUMBERS } = require('../config/constants');

const processingUsers = new Set();

module.exports = {
    name: 'cekapprove',
    description: 'Cek status approval & ringkasan dashboard',

    async execute(sock, msgObj, context) {
        const { sender, senderNumber, args, BOT_PREFIX } = context;
        let today = new Date();

        // --- NEW: Handle !cekapprove all (Admin only) ---
        if (args && args.toLowerCase().trim() === 'all') {
            const senderDigits = senderNumber.replace('@s.whatsapp.net', '');
            if (!ADMIN_NUMBERS.includes(senderDigits)) {
                await sock.sendMessage(sender, { text: '🚫 Perintah ini hanya untuk Admin.' }, { quoted: msgObj });
                return;
            }

            const users = getAllUsers();
            if (users.length === 0) {
                await sock.sendMessage(sender, { text: 'Belum ada user terdaftar.' }, { quoted: msgObj });
                return;
            }

            await sock.sendMessage(sender, { react: { text: '⏳', key: msgObj.key } });
            await sock.sendMessage(sender, { text: `🔍 *CEK SEMUA USER*\nMulai mengecek ${users.length} user...` });

            let report = `*STATUS APPROVAL SEMUA USER*\n`;
            report += `Tanggal: ${today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}\n`;
            report += `--------------------------------\n\n`;

            for (const [index, user] of users.entries()) {
                try {
                    // console.log(`[CEKAPPROVE ALL] Checking ${user.email} (${index + 1}/${users.length})`);
                    const [statsResult, profileResult, userProfileResult] = await Promise.all([
                        // Third param: today (referenceDate), Fourth param: true (useCache)
                        getDashboardStats(user.email, user.password, today, true),
                        getParticipantProfile(user.email),
                        getUserProfile(user.email)
                    ]);
                    
                    let statusLine = `${index + 1}. *${user.name || user.email.split('@')[0]}*\n`;
                    
                    const p = profileResult.success ? profileResult.data : {};
                    const u = userProfileResult.success ? userProfileResult.data : {};
                    
                    const m = u.mentor_name || p.mentor?.name || p.mentor_name || '-';
                    
                    statusLine += `├ Mentor: ${m}\n`;

                    if (statsResult.success) {
                        const stats = statsResult.data;
                        const cal = stats.calendar || {};
                        const pending = (cal.pending || []).length;
                        const rejected = (cal.rejected || []).length;
                        const revision = (cal.revision || []).length;
                        
                        const isCached = statsResult.cached ? ' (Cache)' : '';
                        
                        if (pending === 0 && rejected === 0 && revision === 0) {
                            statusLine += `└ ✅ Aman${isCached} (Semua Approved)\n`;
                        } else {
                            let issues = [];
                            if (pending > 0) issues.push(`⏳ Belum: ${pending}`);
                            if (revision > 0) issues.push(`🟠 Revisi: ${revision}`);
                            if (rejected > 0) issues.push(`🔴 Ditolak: ${rejected}`);
                            statusLine += `└ Status: ${issues.join(' | ')}${isCached}\n`;
                        }
                    } else {
                        statusLine += `└ ❌ Error Dashboard: ${statsResult.pesan}\n`;
                    }
                    
                    report += statusLine + `\n`;

                    // Send partial report every 10 users to avoid message length limits and give progress
                    if ((index + 1) % 10 === 0 && index < users.length - 1) {
                        await sock.sendMessage(sender, { text: report });
                        report = `*Lanjutan Status Approval (${index + 2}-${Math.min(index + 11, users.length)})*\n--------------------------------\n\n`;
                    }

                    // Smaller delay (500ms instead of 2000ms) if using cache
                    const delay = statsResult.cached ? 500 : 2000;
                    await new Promise(r => setTimeout(r, delay));
                } catch (err) {
                    report += `${index + 1}. *${user.name || user.email}*: ❌ Crash\n\n`;
                }
            }

            await sock.sendMessage(sender, { text: report });
            await sock.sendMessage(sender, { react: { text: '✅', key: msgObj.key } });
            return;
        }

        // --- ORIGINAL Logic ---
        // 0. Check Concurrency Lock
        if (processingUsers.has(sender)) {
            await sock.sendMessage(sender, { react: { text: '✋', key: msgObj.key } });
            return;
        }

        // 1. Authenticate User
        const user = getUserByPhone(senderNumber);
        if (!user) {
            await sock.sendMessage(sender, { text: getMessage('!daftar_not_registered') }, { quoted: msgObj });
            return;
        }

        processingUsers.add(sender);
        await sock.sendMessage(sender, { react: { text: '⏳', key: msgObj.key } });

        // Cycle Day Detection Logic
        let cycleDay = user.cycle_day;

        try {
            // If not in DB, detect and save it automatically
            if (!cycleDay) {
                cycleDay = await detectCycleDay(user.email, user.password);
                
                // Save to DB for future use
                const fs = require('fs');
                const path = require('path');
                const usersFile = path.join(__dirname, '../../users.json');
                try {
                    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
                    const uIdx = users.findIndex(u => u.email === user.email);
                    if (uIdx !== -1) {
                        users[uIdx].cycle_day = cycleDay;
                        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
                        console.log(`[CEKAPPROVE] Auto-assigned cycle_day ${cycleDay} to ${user.email}`);
                    }
                } catch (dbErr) {
                    console.error('[CEKAPPROVE] Failed to auto-save cycle_day:', dbErr.message);
                }
            }

            // Check for month argument
            if (args && args.length > 0) {
                const monthNames = [
                    'januari', 'februari', 'maret', 'april', 'mei', 'juni',
                    'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
                ];
                // Split args to handle "januari 2026" or "januari"
                const parts = args.trim().split(/\s+/);
                const requestedMonth = parts[0].toLowerCase();
                const monthIndex = monthNames.indexOf(requestedMonth);

                if (monthIndex !== -1) {
                    // Set 'today' to the cycleDay of the requested month
                    today = new Date(today.getFullYear(), monthIndex, cycleDay);
                    
                    const realNow = new Date();
                    if (realNow.getMonth() < 3 && monthIndex > 9) {
                        today.setFullYear(realNow.getFullYear() - 1);
                    }
                }
            }

            // 2. Fetch Data (Try Cache First)
            // Pass 'today' as reference date for stats
            const [statsResult, historyResult, profileResult, userProfileResult] = await Promise.all([
                getDashboardStats(user.email, user.password, today),
                getRiwayat(user.email, user.password, 45),
                getParticipantProfile(user.email),
                getUserProfile(user.email)
            ]);

            if (!statsResult.success) {
                await sock.sendMessage(sender, { react: { text: '❌', key: msgObj.key } });
                await sock.sendMessage(sender, { text: `Gagal mengambil data dashboard: ${statsResult.pesan}` }, { quoted: msgObj });
                return;
            }

            const stats = statsResult.data;
            const profileData = profileResult.success ? profileResult.data : {};
            const userData = userProfileResult.success ? userProfileResult.data : {};

            const mentorName = userData.mentor_name || profileData.mentor?.name || profileData.mentor_name || '-';
            const positionName = userData.job_role || profileData.vacancy?.name || profileData.position || profileData.vacancy_name || '-';

            const cal = stats.calendar || { approved: [], rejected: [], revision: [], pending: [], alpha: [] };
            // Use full_attendances from API if available (contains both months)
            const fullLogs = stats.full_attendances || [];
            const historyLogs = historyResult.success ? historyResult.logs : [];

            // 3. Determine Cycle Range: CycleDay Previous Month -> CycleDay Current Month
            const startPeriod = new Date(today);
            const displayEndPeriod = new Date(today);

            if (today.getDate() > cycleDay) {
                // We are in the cycle that started THIS month
                startPeriod.setDate(cycleDay);
                displayEndPeriod.setMonth(today.getMonth() + 1);
                displayEndPeriod.setDate(cycleDay);
            } else {
                // We are in the cycle that started PREVIOUS month
                startPeriod.setMonth(today.getMonth() - 1);
                startPeriod.setDate(cycleDay);
                displayEndPeriod.setDate(cycleDay);
            }
            startPeriod.setHours(0, 0, 0, 0);
            displayEndPeriod.setHours(23, 59, 59, 999);
            
            // For iteration, we only go up to 'today' (don't check future)
            const iterationEnd = new Date(today);
            iterationEnd.setHours(23, 59, 59, 999);

            // Initialize Counters
            let totalApprove = 0;
            let totalRejected = 0;
            let totalRevisi = 0;
            let totalPending = 0;
            let totalPermission = 0;
            let totalAlpha = 0;
            let totalLibur = 0;

            const lists = {
                approved: [],
                rejected: [],
                revision: [],
                pending: [],
                permission: [],
                alpha: [],
                libur: []
            };

            // 4. Iterate through the cycle day by day
            // This is the most accurate way to merge "Calendar" and "History"
            let tempDate = new Date(startPeriod);
            const realTodayStr = new Date().toISOString().split('T')[0];
            
            // Map available data for fast lookup
            const logsMap = new Map();
            
            // Priority 1: Full API Attendances (contains status like APPROVED)
            fullLogs.forEach(l => logsMap.set(l.date, l));
            
            // Priority 2: History Logs (contains state like COMPLETED, fallback if API missing)
            historyLogs.forEach(l => {
                if (!logsMap.has(l.date)) {
                    logsMap.set(l.date, l);
                }
            });

            while (tempDate <= iterationEnd) {
                const dStr = tempDate.toISOString().split('T')[0];
                const isWorkDay = !isHoliday(dStr);
                const dayLabel = `${tempDate.getDate()} ${tempDate.toLocaleString('id-ID', { month: 'short' })}`;
                
                const log = logsMap.get(dStr);

                if (log && !log.missing) {
                    // Check status
                    // API uses: approval_status (APPROVED, REJECTED, REVISION) and status (PRESENT, ON_LEAVE)
                    // History uses: state (COMPLETED, PRESENT)
                    
                    const approvalStatus = (log.approval_status || log.state || '').toUpperCase();
                    const attendanceStatus = (log.status || '').toUpperCase();

                    if (attendanceStatus === 'ON_LEAVE' || attendanceStatus === 'SICK' || attendanceStatus === 'PERMIT') {
                        totalPermission++;
                        lists.permission.push(dayLabel);
                    } else if (approvalStatus === 'APPROVED') {
                        totalApprove++;
                        // lists.approved.push(dayLabel);
                    } else if (approvalStatus === 'REJECTED' || approvalStatus === 'DITOLAK') {
                        totalRejected++;
                        lists.rejected.push(dayLabel);
                    } else if (approvalStatus === 'REVISION' || approvalStatus.includes('REVISI')) {
                        totalRevisi++;
                        lists.revision.push(dayLabel);
                    } else {
                        // Pending / Completed but not approved yet
                        totalPending++;
                        lists.pending.push(dayLabel);
                    }
                } else if (isWorkDay) {
                    // No log on a workday = Alpha
                    // Skip today if no log yet
                    if (dStr !== realTodayStr) {
                        totalAlpha++;
                        lists.alpha.push(dayLabel);
                    }
                } else {
                    // Holiday/Weekend and no log
                    totalLibur++;
                    lists.libur.push(dayLabel);
                }

                tempDate.setDate(tempDate.getDate() + 1);
            }

            // Helper to format line with date
            const formatLine = (count, datesArr) => {
                if (count > 0 && datesArr && datesArr.length > 0) {
                    return `${count} [${datesArr.join(', ')}]`;
                }
                if (count > 0) {
                    return `${count}`;
                }
                return `-`;
            };

            // 5. Construct Message
            const formatDate = (d) => `${d.getDate()} ${d.toLocaleString('id-ID', { month: 'short' })} ${d.getFullYear()}`;
            const rangeStr = `${formatDate(startPeriod)} - ${formatDate(displayEndPeriod)}`;
            const batchNum = cycleDay === 16 ? '3' : (cycleDay === 24 ? '2' : '-');

            // Helper for Capitalize Each Word
            const capitalize = (str) => {
                if (!str || str === '-') return str;
                return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            };

            // Determine Today's Status
            let statusAbsenToday = 'Belum Absen';
            const logToday = logsMap.get(realTodayStr);
            if (logToday) {
                const attStatus = (logToday.status || '').toUpperCase();
                if (attStatus === 'ON_LEAVE' || attStatus === 'SICK' || attStatus === 'PERMIT') {
                    statusAbsenToday = 'Izin/Sakit';
                } else {
                    statusAbsenToday = 'Sudah Absen';
                }
            } else if (isHoliday(realTodayStr)) {
                statusAbsenToday = 'Libur';
            }

            let reply = `*LAPORAN DASHBOARD*\n`;
            reply += `Batch: ${batchNum}\n`;
            reply += `Nama: ${capitalize(user.name)}\n`;
            reply += `Mentor: ${capitalize(mentorName)}\n\n`;
            
            reply += `Status Absen: ${statusAbsenToday}\n\n`;

            reply += `*Ringkasan:*\n`;
            reply += `Approve: ${totalApprove || '-'}\n`;
            reply += `Izin: ${formatLine(totalPermission, lists.permission)}\n`;
            reply += `Belum di Approve: ${formatLine(totalPending, lists.pending)}\n`;
            reply += `Revisi: ${formatLine(totalRevisi, lists.revision)}\n`;
            reply += `Ditolak: ${formatLine(totalRejected, lists.rejected)}\n`;
            reply += `Alpa: ${formatLine(totalAlpha, lists.alpha)}\n\n`;
            reply += `Rapor bulanan: ${stats.rapor || '-'}`;

            // 6. Send Response
            await sock.sendMessage(sender, { react: { text: '✅', key: msgObj.key } });
            await sock.sendMessage(sender, { text: reply }, { quoted: msgObj });

        } catch (error) {
            console.error('[CEKAPPROVE] Error:', error);
            await sock.sendMessage(sender, { react: { text: '❌', key: msgObj.key } });
            await sock.sendMessage(sender, { text: 'Terjadi kesalahan sistem.' }, { quoted: msgObj });
        } finally {
            processingUsers.delete(sender);
        }
    }
};
