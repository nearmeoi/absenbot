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
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-3xl bg-yellow-300 border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.2)] rounded-lg animate-slide-up">
            <div className="p-3 flex justify-between items-center gap-4">
                <div className="flex-1">
                    <h3 className="font-black uppercase text-xs md:text-sm tracking-tight flex items-center gap-2">
                        <Download size={16} />
                        Pasang Aplikasi
                    </h3>
                    <p className="text-[10px] md:text-xs font-bold text-gray-700 leading-tight mt-0.5">
                        Akses lebih cepat & notifikasi lancar.
                    </p>
                </div>
                
                <div className="flex gap-2 items-center">
                    <button 
                        onClick={() => setShowPrompt(false)}
                        className="p-2 hover:bg-black/5 rounded-full"
                    >
                        <X size={16} />
                    </button>
                    {isIOS ? (
                        <div className="text-[10px] font-bold bg-white px-2 py-1 border border-black rounded">
                            Share &rarr; Add to Home
                        </div>
                    ) : (
                        <button 
                            onClick={handleInstallClick}
                            className="bg-black text-white px-3 py-1.5 font-bold uppercase text-[10px] md:text-xs border border-black shadow-[2px_2px_0_#fff] active:translate-y-0.5 active:shadow-none transition-all"
                        >
                            Install
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InstallPrompt;
