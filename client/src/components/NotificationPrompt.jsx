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
        <div className="fixed top-6 left-4 right-4 z-[9999] animate-bounce-in">
            <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0_#000] flex flex-col gap-3">
                <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                        <div className="bg-cyan-300 border-2 border-black p-2 rounded-lg shadow-[2px_2px_0_#000]">
                            <Bell size={20} strokeWidth={3} className="animate-ring" />
                        </div>
                        <div>
                            <h3 className="font-black uppercase text-sm tracking-tight">Aktifkan Pengingat Absen?</h3>
                            <p className="text-[11px] font-bold text-gray-500 leading-tight">Sistem akan mengecek otomatis status laporan Anda. Jika Anda lupa absen, bot akan mengirimkan notifikasi pengingat agar uang saku Anda aman. Aktifkan sekarang!</p>
                        </div>
                    </div>
                    <button onClick={() => setShowPrompt(false)} className="p-1"><X size={16}/></button>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowPrompt(false)}
                        className="flex-1 bg-gray-100 border-2 border-black py-1.5 font-bold uppercase text-[10px] shadow-[2px_2px_0_#000]"
                    >
                        Nanti Saja
                    </button>
                    <button 
                        onClick={handleEnable}
                        className="flex-1 bg-cyan-400 border-2 border-black py-1.5 font-black uppercase text-[10px] shadow-[2px_2px_0_#000]"
                    >
                        Aktifkan
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificationPrompt;
