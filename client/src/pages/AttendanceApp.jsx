import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
    Bell, 
    BellOff,
    User, 
    PenTool, 
    Sparkles, 
    Activity, 
    BookOpen, 
    AlertTriangle, 
    CalendarClock, 
    Send,
    LayoutDashboard,
    CheckCircle,
    Save
} from 'lucide-react';
import InstallPrompt from '../components/InstallPrompt';
import NotificationPrompt from '../components/NotificationPrompt';
import ConfirmationModal from '../components/ConfirmationModal';
import LoginModal from '../components/LoginModal';

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
        <div className="p-10 text-red-600 bg-white font-poppins">
            <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
            <pre className="bg-gray-100 p-4 rounded border border-red-300 text-sm">{this.state.error}</pre>
        </div>
      );
    }

    return this.props.children; 
  }
}

// Helper for VAPID Key conversion
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
        try {
            const params = new URLSearchParams(window.location.search);
            const urlPhone = params.get('phone');
            if (urlPhone) return urlPhone.replace(/\D/g, '');
        } catch(e) {}
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
    const [showLoginModal, setShowLoginModal] = useState(false);

    // Initial check for phone logic
    useEffect(() => {
        const checkAuth = async () => {
            const params = new URLSearchParams(window.location.search);
            const slug = params.get('u');
            const urlPhone = params.get('phone');
            
            // If we have explicit identifiers, try to load user
            let identifier = slug ? `slug=${slug}` : (urlPhone ? `phone=${urlPhone}` : null);
            
            if (identifier) {
                // ... (Existing logic below)
            } else if (!phone) {
                // If NO phone in URL and NO phone in storage, show login modal
                setShowLoginModal(true);
            }
        };
        checkAuth();
    }, []);

    useEffect(() => {
        const initUser = async () => {
            const params = new URLSearchParams(window.location.search);
            const slug = params.get('u');
            
            let userIdentifier = slug ? `slug=${slug}` : (phone ? `phone=${phone}` : null);

            if (userIdentifier) {
                try {
                    const res = await axios.get(`/app-api/api/user-profile?${userIdentifier}`);
                    if (res.data.success) {
                        setUserName(res.data.name);
                        let dbPhone = res.data.phone.split('@')[0].replace(/\D/g, '');
                        if (dbPhone.startsWith('08')) dbPhone = '628' + dbPhone.substring(2);
                        setPhone(dbPhone);
                        
                        // User verified, hide modal if it was open
                        setShowLoginModal(false);
                    }
                } catch (e) {
                    setUserName('');
                    console.log('User lookup failed:', e.message);
                }
            }
        };
        initUser();
    }, [phone]);

    useEffect(() => {
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                setNotifEnabled(true);
            }
        } catch(e) {}
    }, []);

    useEffect(() => {
        if (phone) {
            safeLocalStorage.setItem('absenbot_phone', phone);
        }
    }, [phone]);

    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('phone') || params.get('u')) {
                const newUrl = window.location.pathname;
                window.history.replaceState({}, '', newUrl);
            }
        } catch(e) {}
    }, []);

    const handlePhoneChange = (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.startsWith('08')) val = '628' + val.substring(2);
        setPhone(val);
    };
    
    const handleLoginSuccess = (newPhone, newName) => {
        setPhone(newPhone);
        setUserName(newName);
        setShowLoginModal(false);
        safeLocalStorage.setItem('absenbot_phone', newPhone);
    };

    const MIN_CHARS = 100;
    const getCharColor = (len) => len >= MIN_CHARS ? 'text-green-500' : 'text-red-500';
    const getBorderColor = (len) => len > 0 && len < MIN_CHARS ? 'border-red-500 ring-red-200 focus:ring-red-200' : 'border-black focus:ring-gray-200';

    const handleGenerateAI = async () => {
        if (!phone) return toast.error('Masukkan nomor WhatsApp dulu!');
        if (!topik || topik.length < 5) return toast.error('Ceritakan sedikit kegiatanmu hari ini!');
        
        setLoading(true);
        try {
            const res = await axios.post('/app-api/api/generate-ai', { phone, story: topik });
            if (res.data.success) {
                setAktivitas(res.data.aktivitas);
                setPembelajaran(res.data.pembelajaran);
                setKendala(res.data.kendala);
                toast.success('Laporan berhasil dibuat oleh AI!', { icon: '🤖' });
            }
        } catch (error) {
            toast.error('Gagal generate AI: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDirectSubmit = () => {
        if (!phone) return toast.error('Nomor WA wajib diisi');
        if (aktivitas.length < MIN_CHARS || pembelajaran.length < MIN_CHARS || kendala.length < MIN_CHARS) {
            return toast.error(`Semua kolom laporan minimal ${MIN_CHARS} karakter!`);
        }
        setShowConfirm(true);
    };

    const confirmSubmit = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const res = await axios.post('/app-api/api/submit', { phone, aktivitas, pembelajaran, kendala });
            if (res.data.success) {
                toast.success('BERHASIL! Laporan terkirim ke MagangHub', { duration: 5000, icon: '🚀' });
            }
        } catch (error) {
            toast.error('Gagal kirim: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleScheduleAction = async (forcedState = null) => {
        if (!phone) return toast.error('Nomor WA wajib diisi');
        
        const nextState = forcedState !== null ? forcedState : !isScheduled;
        
        if (nextState && (aktivitas.length < MIN_CHARS || pembelajaran.length < MIN_CHARS || kendala.length < MIN_CHARS)) {
            return toast.error(`Lengkapi semua laporan (min ${MIN_CHARS} karakter) sebelum mengaktifkan jadwal!`);
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
                if (nextState) {
                    toast.success('Jadwal UPDATE BERHASIL! (Jam 15:00)');
                } else {
                    toast('Jadwal Otomatis DIBATALKAN', { icon: '🛑' });
                }
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

            const keyRes = await axios.get('/app-api/api/vapid-public-key');
            const publicKey = keyRes.data.publicKey;
            const registration = await navigator.serviceWorker.ready;

            // Check for existing subscription and unsubscribe (to handle key rotation)
            const existingSub = await registration.pushManager.getSubscription();
            if (existingSub) {
                await existingSub.unsubscribe();
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });

            await axios.post('/app-api/api/subscribe', { phone, subscription });
            setNotifEnabled(true);
            toast.success('Notifikasi pengingat berhasil diaktifkan!');
        } catch (e) {
            console.error(e);
            if (e.message && e.message.toLowerCase().includes('permission denied')) {
                toast.error('Izin diblokir. Silakan klik ikon gembok 🔒 di address bar dan izinkan Notifikasi.', { duration: 6000 });
            } else {
                toast.error('Gagal: ' + (e.message || 'Unknown error'));
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 pb-32 font-poppins text-gray-800">
            <InstallPrompt />
            <NotificationPrompt phone={phone} />
            
            {showLoginModal && !phone && (
                <LoginModal onLoginSuccess={handleLoginSuccess} />
            )}
            
            <div className="max-w-3xl mx-auto space-y-8">
                {/* 1. HEADER */}
                <header className="text-center my-8">
                    <h1 className="text-5xl font-black uppercase tracking-tighter italic transform -rotate-3 flex justify-center items-center gap-4">
                        <LayoutDashboard size={48} className="text-black" />
                        <span>Monev <span className="bg-black text-white px-3 py-1 rounded-md">App</span></span>
                    </h1>
                    <p className="font-bold text-sm mt-4 bg-white inline-block px-3 py-1 border-2 border-black shadow-[4px_4px_0_#000]">
                        Input Laporan MagangHub Tanpa Ribet.
                    </p>
                </header>

                {/* 2. IDENTITAS (WHO) */}
                <div className="bg-cyan-200 p-5 border-black border-2 shadow-[8px_8px_0_#000] rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
                            <User size={18} />
                            Identitas Pengguna
                        </label>
                        <button 
                            onClick={enableNotifications}
                            disabled={notifEnabled}
                            className={`text-xs font-bold px-3 py-1.5 border-2 border-black rounded-md transition-all flex items-center gap-2 ${notifEnabled ? 'bg-green-400 cursor-default' : 'bg-white hover:bg-green-200'}`}
                        >
                            {notifEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                            {notifEnabled ? 'Notif Aktif' : 'Aktifkan Notif'}
                        </button>
                    </div>
                    
                    {userName && (
                        <div className="mb-4 text-center bg-black/5 p-3 rounded-md">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">
                                Login Sebagai
                            </p>
                            <h2 className="text-2xl font-black uppercase tracking-tight">
                                {userName}
                            </h2>
                        </div>
                    )}

                    <input 
                        type="text" 
                        placeholder="Nomor WA Anda (e.g., 628...)" 
                        className="w-full p-3 border-2 border-black rounded-md font-bold text-lg focus:outline-none focus:ring-4 ring-cyan-400 transition-all placeholder-gray-500 text-center"
                        value={phone}
                        onChange={handlePhoneChange}
                        // If no user is logged in, we let the modal handle it, but this input remains as fallback/display
                    />
                    <p className="text-xs mt-3 font-semibold opacity-70 text-center flex items-center justify-center gap-1">
                        <User size={12} /> *Nomor disimpan di browser & tidak akan dibagikan.
                    </p>
                </div>

                {/* 3. INPUT CERITA (WHAT) */}
                <div className="bg-yellow-300 p-5 border-black border-2 shadow-[8px_8px_0_#000] rounded-lg">
                    <label className="text-sm font-extrabold uppercase tracking-wide mb-3 flex items-center gap-2">
                        <PenTool size={18} />
                        1. Cerita Singkat Hari Ini
                    </label>
                    <textarea 
                        rows="4"
                        placeholder="Contoh: Hari ini saya meeting dengan client membahas fitur A, lalu melanjutkan koding dan berhasil memperbaiki bug di halaman login." 
                        className="w-full p-3 border-2 border-black rounded-md font-medium focus:outline-none focus:ring-4 ring-yellow-400 transition-all text-base"
                        value={topik}
                        onChange={(e) => setTopik(e.target.value)}
                    />
                    
                    <button 
                        onClick={handleGenerateAI}
                        disabled={loading}
                        className="w-full mt-4 bg-black text-white py-3 font-black uppercase tracking-wider border-2 border-black rounded-md hover:bg-gray-800 active:translate-y-1 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <Sparkles className="animate-spin" size={20} /> : <Sparkles size={20} />}
                        {loading ? 'AI Berpikir...' : 'Generate Laporan AI'}
                    </button>
                </div>

                {/* 4. REVIEW FIELDS (RESULT) */}
                <div className="space-y-6">
                    <h2 className="text-sm font-extrabold uppercase tracking-wide text-center flex items-center justify-center gap-2">
                        <BookOpen size={18} />
                        2. Review & Edit Hasil Laporan
                    </h2>
                    
                    {/* Aktivitas */}
                    <div className="bg-white p-5 border-black border-2 shadow-[6px_6px_0_rgba(0,0,0,0.1)] rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                            <label className="font-extrabold uppercase text-sm tracking-wide flex items-center gap-2">
                                <Activity size={16} />
                                Aktivitas
                            </label>
                            <span className={`text-sm font-bold ${getCharColor(aktivitas.length)}`}>
                                {aktivitas.length} / {MIN_CHARS}
                            </span>
                        </div>
                        <textarea 
                            rows="6"
                            className={`w-full p-3 border-2 rounded-md font-medium text-base focus:outline-none transition-all ${getBorderColor(aktivitas.length)}`}
                            placeholder="Aktivitas yang dilakukan akan muncul di sini..."
                            value={aktivitas}
                            onChange={(e) => setAktivitas(e.target.value)}
                        ></textarea>
                        {aktivitas.length > 0 && aktivitas.length < MIN_CHARS && (
                            <p className="text-xs text-red-500 font-bold mt-1">* Minimal {MIN_CHARS} karakter (Kurang {MIN_CHARS - aktivitas.length})</p>
                        )}
                    </div>

                    {/* Pembelajaran & Kendala Grid */}
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-white p-5 border-black border-2 shadow-[6px_6px_0_rgba(0,0,0,0.1)] rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <label className="font-extrabold uppercase text-sm tracking-wide flex items-center gap-2">
                                    <BookOpen size={16} />
                                    Pembelajaran
                                </label>
                                <span className={`text-sm font-bold ${getCharColor(pembelajaran.length)}`}>
                                    {pembelajaran.length}
                                </span>
                            </div>
                            <textarea 
                                rows="6"
                                className={`w-full p-3 border-2 rounded-md font-medium text-base focus:outline-none transition-all ${getBorderColor(pembelajaran.length)}`}
                                placeholder="Poin pembelajaran akan muncul di sini..."
                                value={pembelajaran}
                                onChange={(e) => setPembelajaran(e.target.value)}
                            ></textarea>
                            {pembelajaran.length > 0 && pembelajaran.length < MIN_CHARS && (
                                <p className="text-xs text-red-500 font-bold mt-1">* Minimal {MIN_CHARS} karakter (Kurang {MIN_CHARS - pembelajaran.length})</p>
                            )}
                        </div>

                        <div className="bg-white p-5 border-black border-2 shadow-[6px_6px_0_rgba(0,0,0,0.1)] rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <label className="font-extrabold uppercase text-sm tracking-wide flex items-center gap-2">
                                    <AlertTriangle size={16} />
                                    Kendala
                                </label>
                                <span className={`text-sm font-bold ${getCharColor(kendala.length)}`}>
                                    {kendala.length}
                                </span>
                            </div>
                            <textarea 
                                rows="6"
                                className={`w-full p-3 border-2 rounded-md font-medium text-base focus:outline-none transition-all ${getBorderColor(kendala.length)}`}
                                placeholder="Kendala yang dihadapi akan muncul di sini..."
                                value={kendala}
                                onChange={(e) => setKendala(e.target.value)}
                            ></textarea>
                            {kendala.length > 0 && kendala.length < MIN_CHARS && (
                                <p className="text-xs text-red-500 font-bold mt-1">* Minimal {MIN_CHARS} karakter (Kurang {MIN_CHARS - kendala.length})</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* 5. FINAL ACTIONS (SUBMIT) */}
                <div className="bg-white p-4 border-black border-2 rounded-lg shadow-[8px_8px_0_#000]">
                    <h3 className="text-sm font-extrabold uppercase tracking-wide text-center mb-3 flex items-center justify-center gap-2">
                        <Send size={16} />
                        3. Kirim Laporan
                    </h3>
                    
                    {/* Toggle Schedule Row */}
                    <div 
                        onClick={() => handleScheduleAction()}
                        className={`mb-3 p-3 border-2 border-black rounded-md flex justify-between items-center cursor-pointer transition-colors select-none ${isScheduled ? 'bg-green-100' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                        <div className="flex-1 pr-4">
                            <span className="font-bold text-sm block uppercase tracking-tight flex items-center gap-2">
                                <CalendarClock size={16} />
                                Jadwal Otomatis (15:00)
                            </span>
                            <span className="text-[10px] text-gray-600 block leading-tight mt-0.5 ml-6">
                                {isScheduled ? 'Bot akan mengirim laporan otomatis jam 3 sore.' : 'Aktifkan agar laporan terkirim otomatis nanti.'}
                            </span>
                        </div>
                        {/* Visual Switch */}
                        <div className={`w-12 h-6 rounded-full border-2 border-black flex items-center px-1 transition-all ${isScheduled ? 'bg-green-400' : 'bg-gray-300'}`}>
                            <div className={`w-3.5 h-3.5 bg-black rounded-full shadow-sm transition-all transform ${isScheduled ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>

                    {isScheduled ? (
                        <div className="space-y-2 animate-fade-in">
                            <div className="bg-green-100 border-2 border-green-600 p-3 rounded text-center">
                                <div className="flex justify-center mb-1"><CheckCircle className="text-green-600" size={24}/></div>
                                <p className="font-black text-sm text-green-800 uppercase">Jadwal Aktif!</p>
                                <p className="text-xs font-bold text-green-700">Anda boleh menutup aplikasi sekarang.</p>
                            </div>
                            
                            <button 
                                onClick={handleDirectSubmit}
                                disabled={loading}
                                className="w-full p-3 bg-red-100 border-2 border-red-500 font-bold text-red-600 uppercase rounded-md shadow-[2px_2px_0_#000] active:shadow-none active:translate-y-1 transition-all text-xs flex items-center justify-center gap-2"
                            >
                                <Send size={16} /> Kirim Sekarang (Batalkan Jadwal)
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleDirectSubmit}
                            disabled={loading}
                            className="w-full p-4 bg-red-500 border-2 border-black font-black text-white uppercase rounded-md shadow-[4px_4px_0_#000] hover:bg-red-600 active:shadow-none active:translate-y-1 transition-all disabled:opacity-50 text-base md:text-lg tracking-wider flex items-center justify-center gap-2"
                        >
                            <Send size={20} />
                            Kirim Sekarang
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div className="text-center text-xs font-bold pt-8 pb-4 opacity-60">
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
