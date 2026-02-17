import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

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

const NotificationPrompt = ({ phone }) => {
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // For debugging, you can force it:
        // setShowPrompt(true);
        
        if ('Notification' in window && 'serviceWorker' in navigator) {
            // If already granted, don't show prompt
            if (Notification.permission === 'granted') {
                setShowPrompt(false);
                return;
            }

            // If denied, we can't do much but maybe show a message how to unblock
            if (Notification.permission === 'denied') {
                setShowPrompt(false);
                return;
            }

            // Show after 2 seconds delay if default
            if (Notification.permission === 'default') {
                const timer = setTimeout(() => {
                    setShowPrompt(true);
                }, 2000);
                return () => clearTimeout(timer);
            }
        }
    }, []);

    const handleEnable = async () => {
        if (!phone) {
            toast.error('Masukkan nomor WA Anda terlebih dahulu di form!');
            setShowPrompt(false);
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
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

                toast.success('Notifikasi berhasil diaktifkan!');
            }
        } catch (error) {
            console.error('Notification error:', error);
            toast.error('Gagal mengaktifkan notifikasi.');
        } finally {
            setShowPrompt(false);
        }
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-3xl bg-cyan-100 border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.1)] rounded-lg animate-slide-down">
            <div className="p-2 md:p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-white p-1.5 rounded border border-black hidden md:block">
                        <Bell size={16} className="text-black" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-[10px] md:text-xs leading-tight truncate md:whitespace-normal">
                            <span className="uppercase font-black mr-1">Pengingat Absen:</span>
                            Aktifkan agar tidak lupa laporan!
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button 
                        onClick={() => setShowPrompt(false)}
                        className="text-[10px] font-bold underline decoration-black/30 text-gray-500 hover:text-black"
                    >
                        Nanti
                    </button>
                    <button 
                        onClick={handleEnable}
                        className="bg-black text-white px-3 py-1 text-[10px] font-bold uppercase rounded border border-black shadow-[2px_2px_0_rgba(0,0,0,0.2)] active:translate-y-0.5 active:shadow-none transition-all"
                    >
                        Aktifkan
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificationPrompt;
