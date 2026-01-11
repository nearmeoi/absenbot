import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

const InstallPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Detect iOS
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        setIsIOS(ios);

        const handler = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
            if (!isStandalone) {
                setShowPrompt(true);
            }
        };

        window.addEventListener('beforeinstallprompt', handler);

        // For iOS, beforeinstallprompt doesn't fire, so we show it manually if not standalone
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        if (ios && !isStandalone) {
            // Delay for iOS to not be too intrusive immediately
            const timer = setTimeout(() => setShowPrompt(true), 3000);
            return () => clearTimeout(timer);
        }

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (isIOS) {
            // iOS instructions are shown in the UI
            return;
        }

        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-6 left-4 right-4 z-[9999] animate-bounce-in">
            <div className="bg-white border-4 border-black p-5 shadow-[8px_8px_0_#000] flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div className="flex gap-4">
                        <div className="bg-[#FACC15] border-2 border-black p-2.5 rounded-xl shadow-[3px_3px_0_#000]">
                            <Download size={28} strokeWidth={3} />
                        </div>
                        <div>
                            <h3 className="font-black uppercase text-base tracking-tight">Pasang Aplikasi</h3>
                            <p className="text-xs font-bold text-gray-500 leading-snug">Jadikan aplikasi di layar utama untuk akses lebih cepat dan notifikasi stabil.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowPrompt(false)}
                        className="p-1 hover:bg-gray-100 border border-transparent hover:border-black transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                {isIOS ? (
                    <div className="bg-blue-50 border-2 border-dashed border-blue-400 p-3 rounded-lg">
                        <p className="text-[11px] font-bold text-blue-800 flex items-center gap-2 flex-wrap">
                            Klik ikon <Share size={14} /> <span className="underline">Share</span> lalu pilih <span className="font-black">"Add to Home Screen"</span> untuk menginstal di iPhone Anda.
                        </p>
                    </div>
                ) : (
                    <button 
                        onClick={handleInstallClick}
                        className="w-full bg-[#0df259] border-2 border-black py-3 font-black uppercase text-sm shadow-[4px_4px_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all active:bg-green-500 flex items-center justify-center gap-2"
                    >
                        Install Sekarang
                    </button>
                )}
            </div>
        </div>
    );
};

export default InstallPrompt;
