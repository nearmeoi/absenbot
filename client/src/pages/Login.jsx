import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, AlertCircle, ShieldCheck, Key, Moon, Sun } from 'lucide-react';

export default function Login() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    // Check system preference
    useEffect(() => {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            setIsDark(true);
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const success = await login(password);
            if (success) {
                window.location.href = '/dashboard/';
            } else {
                setError('PIN SALAH');
            }
        } catch (err) {
            setError('GAGAL TERHUBUNG');
        } finally {
            setIsLoading(false);
        }
    };

    // Clean Theme Config
    const theme = {
        bg: isDark ? 'bg-[#111]' : 'grid-bg',
        card: isDark ? 'bg-black border-white shadow-[12px_12px_0_#fff]' : 'bg-white border-black shadow-[12px_12px_0_#000]',
        text: isDark ? 'text-white' : 'text-black',
        subText: isDark ? 'text-gray-400' : 'text-gray-600',
        input: isDark ? 'bg-[#222] border-white text-white focus:bg-[#333] placeholder:text-gray-500' : 'bg-gray-50 border-black text-black focus:bg-white placeholder:text-gray-300',
        button: isDark ? 'bg-white text-black border-white hover:bg-gray-200' : 'bg-[#0df259] text-black border-black hover:bg-white',
        border: isDark ? 'border-white' : 'border-black',
        iconBox: isDark ? 'bg-[#333] border-white text-white shadow-[4px_4px_0_#fff]' : 'bg-[#facc15] border-black text-black shadow-[4px_4px_0_#000]',
        toggleBtn: isDark ? 'bg-[#222] border-white text-white hover:bg-white hover:text-black' : 'bg-white border-black text-black hover:bg-black hover:text-white',
        accent1: isDark ? 'bg-white border-white' : 'bg-[#0df259] border-black',
        accent2: isDark ? 'bg-gray-500 border-white' : 'bg-[#3b82f6] border-black',
    };

    return (
        <div className={`min-h-screen flex flex-col justify-center items-center p-4 transition-colors duration-300 ${theme.bg}`}>
            
            {/* Theme Toggle */}
            <button 
                onClick={() => setIsDark(!isDark)}
                className={`absolute top-6 right-6 p-3 border-[3px] rounded-full transition-all ${theme.toggleBtn}`}
            >
                {isDark ? <Sun size={24} strokeWidth={3} /> : <Moon size={24} strokeWidth={3} />}
            </button>

            <div className={`w-full max-w-sm border-[4px] p-8 flex flex-col items-center gap-8 relative transition-all duration-300 ${theme.card}`}>
                {/* Corner Accents */}
                <div className={`absolute -top-4 -left-4 w-8 h-8 border-4 ${theme.accent1}`}></div>
                <div className={`absolute -bottom-4 -right-4 w-8 h-8 border-4 ${theme.accent2}`}></div>

                {/* Logo Section */}
                <div className="relative">
                    <div className={`p-4 rotate-3 border-4 transition-transform hover:rotate-0 cursor-help ${theme.iconBox}`}>
                        <ShieldCheck size={48} strokeWidth={3} />
                    </div>
                    <div className={`absolute -bottom-2 -right-2 p-1 border-2 rounded-full ${isDark ? 'bg-white text-black border-black' : 'bg-black text-white border-black'}`}>
                        <Key size={16} strokeWidth={3} />
                    </div>
                </div>

                <div className="text-center space-y-2">
                    <h1 className={`text-5xl font-black uppercase tracking-tighter italic ${theme.text}`}>AbsenBot</h1>
                    <div className={`px-4 py-1 font-bold text-sm inline-block transform -skew-x-12 ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
                        DASHBOARD V6.1
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6">
                    {error && (
                        <div className={`bg-[#ff6b6b] border-4 p-3 font-black text-black flex items-center gap-3 text-sm animate-bounce ${theme.border}`}>
                            <AlertCircle size={20} strokeWidth={3} />
                            <span className="uppercase">{error}</span>
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className={`text-sm font-black uppercase tracking-widest block ${theme.subText}`}>Enter Admin PIN</label>
                        <input
                            type="password"
                            placeholder="••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`w-full border-4 p-4 font-black text-3xl text-center tracking-[0.5em] focus:outline-none transition-all ${theme.input} ${theme.border}`}
                            disabled={isLoading}
                            autoFocus
                            inputMode="numeric"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full border-4 p-5 font-black text-2xl uppercase active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all disabled:opacity-50 ${theme.button}`}
                    >
                        {isLoading ? 'Wait...' : 'Login →'}
                    </button>
                </form>
            </div>

            <div className="mt-12 flex flex-col items-center gap-2">
                <div className={`text-xs font-black uppercase tracking-[0.2em] px-3 py-1 ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
                    Secure Dashboard System
                </div>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${theme.subText}`}>
                    Authorized Personnel Only • ©2026 NearDev
                </p>
            </div>
        </div>
    );
}