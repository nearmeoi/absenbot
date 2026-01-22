import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import InstallPrompt from '../components/InstallPrompt';
import NotificationPrompt from '../components/NotificationPrompt';
import ConfirmationModal from '../components/ConfirmationModal';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-red-600 bg-white">
            <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
            <pre className="bg-gray-100 p-4 rounded border border-red-300">{this.state.error}</pre>
        </div>
      );
    }

    return this.props.children; 
  }
}

// Helper for VAPID Key conversion (FIX: Added definition)
const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

// Safe LocalStorage Helper
const safeLocalStorage = {
    getItem: (key) => {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem: (key, value) => {
        try { localStorage.setItem(key, value); } catch (e) { }
    }
};

const AttendanceAppContent = () => {
    const [phone, setPhone] = useState(() => {
        // 1. Check URL parameters first (?phone=... or ?u=...)
        try {
            const params = new URLSearchParams(window.location.search);
            const urlPhone = params.get('phone');
            if (urlPhone) return urlPhone.replace(/\D/g, '');
            // Note: If ?u=slug is present, phone will be fetched async, so start empty or from storage
        } catch(e) {}
        
        // 2. Fallback to localStorage
        return safeLocalStorage.getItem('absenbot_phone') || '';
    });
    const [userName, setUserName] = useState('');
    const [topik, setTopik] = useState('');
    const [aktivitas, setAktivitas] = useState('');
    const [pembelajaran, setPembelajaran] = useState('');
    const [kendala, setKendala] = useState('');
    const [loading, setLoading] = useState(false);
    const [isScheduled, setIsScheduled] = useState(false);
    const [notifEnabled, setNotifEnabled] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Fetch User Profile on Mount (Handle ?u=slug or ?phone=...)
    useEffect(() => {
        const initUser = async () => {
            const params = new URLSearchParams(window.location.search);
            const slug = params.get('u');
            const urlPhone = params.get('phone');
            
            // If slug is present, fetch profile by slug
            if (slug) {
                try {
                    const res = await axios.get(`/app-api/api/user-profile?slug=${slug}`);
                    if (res.data.success) {
                        setUserName(res.data.name);
                        // Clean phone number from DB (remove @s.whatsapp.net etc)
                        let dbPhone = res.data.phone.split('@')[0].replace(/\D/g, '');
                        if (dbPhone.startsWith('08')) dbPhone = '628' + dbPhone.substring(2);
                        setPhone(dbPhone);
                        
                        // Clean URL to look nice (optional, maybe keep it so refresh works)
                    }
                } catch (e) {
                    console.log('User lookup by slug failed:', e.message);
                }
            } 
            // Else if phone is present (manual or link), fetch profile by phone
            else if (phone && phone.length > 5) {
                try {
                    const res = await axios.get(`/app-api/api/user-profile?phone=${phone}`);
                    if (res.data.success) {
                        setUserName(res.data.name);
                    }
                } catch (e) {
                    setUserName('');
                }
            }
        };

        initUser();
    }, [phone]); // Re-run if phone changes manually, but main logic is on mount/URL change

    // Check notification permission on mount
    useEffect(() => {
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                setNotifEnabled(true);
            }
        } catch(e) {}
    }, []);

    // Save phone to localStorage whenever it changes
    useEffect(() => {
        safeLocalStorage.setItem('absenbot_phone', phone);
    }, [phone]);

    // Auto-fill from URL and cleanup URL
    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const urlPhone = params.get('phone');
            if (urlPhone) {
                const newUrl = window.location.pathname;
                window.history.replaceState({}, '', newUrl);
            }
        } catch(e) {}
    }, []);

    // Handle phone change with auto-format
    const handlePhoneChange = (e) => {
        let val = e.target.value.replace(/\D/g, ''); // numbers only
        if (val.startsWith('08')) {
            val = '628' + val.substring(2);
        }
        setPhone(val);
    };

    // Character counting logic
    const MIN_CHARS = 100;
    const getCharColor = (len) => len >= MIN_CHARS ? 'text-green-600' : 'text-red-500';

    const handleGenerateAI = async () => {
        if (!phone) return toast.error('Masukkan nomor WhatsApp dulu!');
        if (!topik || topik.length < 5) return toast.error('Ceritakan sedikit kegiatanmu hari ini!');
        
        setLoading(true);
        try {
            const res = await axios.post('/app-api/api/generate-ai', { 
                phone, 
                story: topik 
            });
            
            if (res.data.success) {
                setAktivitas(res.data.aktivitas);
                setPembelajaran(res.data.pembelajaran);
                setKendala(res.data.kendala);
                toast.success('Laporan berhasil dibuat oleh AI!', {
                    icon: '🤖',
                });
            }
        } catch (error) {
            toast.error('Gagal generate AI: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDirectSubmit = () => {
        if (!phone) return toast.error('Nomor WA wajib diisi');
        
        // Validation: All fields must be >= 100 chars
        if (aktivitas.length < MIN_CHARS || pembelajaran.length < MIN_CHARS || kendala.length < MIN_CHARS) {
            return toast.error('Semua kolom (Aktivitas, Pembelajaran, Kendala) minimal 100 karakter!');
        }

        setShowConfirm(true);
    };

    const confirmSubmit = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const res = await axios.post('/app-api/api/submit', {
                phone, aktivitas, pembelajaran, kendala
            });
            if (res.data.success) {
                toast.success('BERHASIL! Laporan sudah terkirim ke MagangHub', {
                    duration: 5000,
                    icon: '🚀'
                });
            }
        } catch (error) {
            toast.error('Gagal kirim: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const toggleSchedule = async () => {
        if (!phone) return toast.error('Nomor WA wajib diisi');
        
        const nextState = !isScheduled;
        
        if (nextState && (aktivitas.length < MIN_CHARS || pembelajaran.length < MIN_CHARS || kendala.length < MIN_CHARS)) {
            return toast.error('Lengkapi semua laporan (min 100 karakter) sebelum mengaktifkan jadwal!');
        }

        setLoading(true);
        try {
            const res = await axios.post('/app-api/api/schedule', {
                phone, 
                aktivitas: nextState ? aktivitas : '', 
                pembelajaran: nextState ? pembelajaran : '', 
                kendala: nextState ? kendala : '',
                enabled: nextState
            });
            
            if (res.data.success) {
                setIsScheduled(nextState);
                toast.success(nextState ? 'Jadwal Otomatis AKTIF (Jam 16:00)' : 'Jadwal Otomatis DIMATIKAN');
            }
        } catch (error) {
            toast.error('Gagal merubah jadwal: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const enableNotifications = async () => {
        if (!phone) return toast.error('Isi nomor WA dulu!');
        if (!('serviceWorker' in navigator)) return toast.error('Browser tidak support SW.');

        try {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') return toast.error('Izin notifikasi ditolak.');

            // Get VAPID Key from server
            const keyRes = await axios.get('/app-api/api/vapid-public-key');
            const publicKey = keyRes.data.publicKey;

            // Subscribe via SW
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });

            // Send subscription to backend
            await axios.post('/app-api/api/subscribe', {
                phone,
                subscription
            });

            setNotifEnabled(true);
            toast.success('Notifikasi aktif!');
        } catch (e) {
            console.error(e);
            toast.error('Gagal mengaktifkan notifikasi.');
        }
    };

    return (
        <div className="min-h-screen bg-[#F4F4F5] grid-bg p-4 md:p-8 font-sans text-black">
            <InstallPrompt />
            <NotificationPrompt phone={phone} />
            
            <div className="max-w-3xl mx-auto space-y-6">
                {/* 1. HEADER */}
                <header className="text-center mb-8">
                    <h1 className="text-5xl font-black uppercase tracking-tighter italic transform -rotate-2">
                        Monev <span className="bg-black text-white px-2">App</span>
                    </h1>
                    <p className="font-bold text-sm mt-2 bg-white inline-block px-2 border-2 border-black shadow-[4px_4px_0_#000]">
                        Input Laporan MagangHub Tanpa Ribet.
                    </p>
                </header>

                {/* 2. IDENTITAS (WHO) */}
                <div className="neo-box bg-cyan-200 p-4 border-black border-4 shadow-[6px_6px_0_#000]">
                    <div className="flex justify-between items-center mb-4">
                        <label className="block text-sm font-black uppercase flex items-center gap-2">
                            <span>Identitas (Nomor/ID)</span>
                            <button 
                                onClick={() => toast('Jika nomor salah/hilang, klik ulang link dari Bot WA.', { icon: '💡' })}
                                className="text-[10px] bg-white px-1.5 py-0.5 border border-black hover:bg-gray-100 cursor-pointer"
                            >
                                ?
                            </button>
                        </label>
                        <div className="flex gap-2">
                            <span className="text-[10px] bg-white px-1 border border-black">AUTO-SAVE</span>
                            <button 
                                onClick={enableNotifications}
                                disabled={notifEnabled}
                                className={`text-[10px] font-bold px-2 py-0 border border-black ${notifEnabled ? 'bg-green-400 opacity-50 cursor-default' : 'bg-white hover:bg-gray-100'}`}
                            >
                                {notifEnabled ? '🔔' : '🔕'}
                            </button>
                        </div>
                    </div>
                    
                    {userName && (
                        <div className="mb-2 text-center">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">
                                TERDETEKSI SEBAGAI
                            </p>
                            <h2 className="text-2xl font-black uppercase leading-none border-b-4 border-black inline-block pb-1">
                                {userName}
                            </h2>
                        </div>
                    )}

                    <input 
                        type="text" 
                        placeholder="Nomor WA (628xxx)" 
                        className="w-full p-3 border-2 border-black font-bold text-lg focus:outline-none focus:bg-white transition-colors placeholder-gray-500 text-center"
                        value={phone}
                        onChange={handlePhoneChange}
                    />
                    <p className="text-[10px] mt-2 font-bold opacity-60 text-center">
                        *Sistem otomatis mengenali akun Anda dari link.
                    </p>
                </div>

                {/* 3. INPUT CERITA (WHAT) */}
                <div className="neo-box bg-[#FACC15] p-4 border-black border-4 shadow-[6px_6px_0_#000]">
                    <label className="block text-sm font-black uppercase mb-2">Cerita Hari Ini</label>
                    <textarea 
                        rows="4"
                        placeholder="Contoh: Hari ini saya meeting client dan fix bug login..." 
                        className="w-full p-3 border-2 border-black font-medium focus:outline-none focus:bg-white transition-colors"
                        value={topik}
                        onChange={(e) => setTopik(e.target.value)}
                    />
                    
                    {/* GENERATE ACTION */}
                    <button 
                        onClick={handleGenerateAI}
                        disabled={loading}
                        className="w-full mt-4 bg-black text-white py-3 font-black uppercase tracking-wide border-2 border-black hover:bg-gray-800 active:translate-y-1 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Sedang Berpikir...' : 'Generate Laporan AI'}
                    </button>
                </div>

                {/* 4. REVIEW FIELDS (RESULT) */}
                <div className="space-y-4">
                    {/* Aktivitas */}
                    <div className="bg-white p-4 border-black border-4 shadow-[4px_4px_0_#000]">
                        <div className="flex justify-between items-center mb-2">
                            <label className="font-black uppercase text-sm">Aktivitas</label>
                            <span className={`text-xs font-bold px-1 border border-black ${getCharColor(aktivitas.length)}`}>
                                {aktivitas.length} / {MIN_CHARS}
                            </span>
                        </div>
                        <textarea 
                            rows="5"
                            className="w-full p-2 border-2 border-gray-200 focus:border-black font-medium text-sm focus:outline-none"
                            placeholder="Hasil generate akan muncul di sini..."
                            value={aktivitas}
                            onChange={(e) => setAktivitas(e.target.value)}
                        ></textarea>
                    </div>

                    {/* Pembelajaran & Kendala Grid */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white p-4 border-black border-4 shadow-[4px_4px_0_#000]">
                            <div className="flex justify-between items-center mb-2">
                                <label className="font-black uppercase text-sm">Pembelajaran</label>
                                <span className={`text-xs font-bold ${getCharColor(pembelajaran.length)}`}>
                                    {pembelajaran.length}
                                </span>
                            </div>
                            <textarea 
                                rows="5"
                                className="w-full p-2 border-2 border-gray-200 focus:border-black font-medium text-sm focus:outline-none"
                                value={pembelajaran}
                                onChange={(e) => setPembelajaran(e.target.value)}
                            ></textarea>
                        </div>

                        <div className="bg-white p-4 border-black border-4 shadow-[4px_4px_0_#000]">
                            <div className="flex justify-between items-center mb-2">
                                <label className="font-black uppercase text-sm">Kendala</label>
                                <span className={`text-xs font-bold px-1 border border-black ${getCharColor(kendala.length)}`}>
                                    {kendala.length}
                                </span>
                            </div>
                            <textarea 
                                rows="5"
                                className="w-full p-2 border-2 border-gray-200 focus:border-black font-medium text-sm focus:outline-none"
                                value={kendala}
                                onChange={(e) => setKendala(e.target.value)}
                            ></textarea>
                        </div>
                    </div>
                </div>

                {/* 5. FINAL ACTIONS (SUBMIT) */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t-4 border-black border-dashed">
                    {/* Toggle Schedule */}
                    <button 
                        onClick={toggleSchedule}
                        disabled={loading}
                        className={`p-4 border-4 border-black font-bold text-sm uppercase shadow-[4px_4px_0_#000] active:translate-y-1 transition-all ${isScheduled ? 'bg-green-400' : 'bg-gray-200 text-gray-500'}`}
                    >
                        {isScheduled ? 'Jadwal Aktif' : 'Set Jadwal'}
                        <div className="text-[10px] font-normal normal-case mt-1">Kirim jam 16:00</div>
                    </button>

                    {/* Direct Submit */}
                    <button 
                        onClick={handleDirectSubmit}
                        disabled={loading}
                        className="p-4 bg-[#FF6B6B] border-4 border-black font-black text-white uppercase shadow-[4px_4px_0_#000] hover:bg-[#ff5252] active:translate-y-1 transition-all disabled:opacity-50"
                    >
                        Kirim Sekarang
                    </button>
                </div>

                {/* Footer */}
                <div className="text-center text-xs font-bold mt-8 opacity-50">
                    <p>POWERED BY ABSENBOT AI</p>
                </div>
            </div>

            <ConfirmationModal 
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={confirmSubmit}
                data={{ aktivitas, pembelajaran, kendala }}
            />
        </div>
    );
};

const AttendanceApp = () => (
    <ErrorBoundary>
        <AttendanceAppContent />
    </ErrorBoundary>
);

export default AttendanceApp;
