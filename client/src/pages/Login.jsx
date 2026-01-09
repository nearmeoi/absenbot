import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, AlertCircle } from 'lucide-react';

export default function Login() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const success = await login(password);
            if (success) {
                // Force full reload for session
                window.location.href = '/dashboard/';
            } else {
                setError('Invalid password');
            }
        } catch (err) {
            setError('Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid-bg flex flex-col justify-center items-center p-4">
            <div className="neo bg-white w-full max-w-sm p-8 flex flex-col items-center gap-6 relative">
                {/* Decorative elements */}
                <div className="absolute -top-3 -left-3 w-6 h-6 bg-black"></div>
                <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-black"></div>

                <div className="neo bg-primary w-16 h-16 flex items-center justify-center transform -rotate-3 hover:rotate-3 transition-transform">
                    <LayoutGrid size={32} className="text-black" />
                </div>

                <div className="text-center space-y-1">
                    <h1 className="text-4xl font-black uppercase tracking-tighter">AbsenBot</h1>
                    <div className="text-xs font-bold bg-black text-white px-2 py-0.5 inline-block transform skew-x-[-12deg]">
                        DASHBOARD ACCESS
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6 mt-4">
                    {error && (
                        <div className="bg-red-100 border-2 border-black p-3 font-bold flex items-center gap-2 text-sm shadow-[4px_4px_0_#ff6b6b]">
                            <AlertCircle size={20} className="text-red-600" />
                            <span className="uppercase">{error}</span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest pl-1">Security PIN</label>
                        <input
                            type="password"
                            placeholder="••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="neo-input w-full font-black text-2xl text-center tracking-[0.5em] h-14 bg-gray-50 uppercase placeholder:tracking-normal placeholder:font-bold placeholder:text-gray-300"
                            disabled={isLoading}
                            autoFocus
                            inputMode="numeric"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="neo-button w-full bg-black text-white p-4 font-black text-xl uppercase hover:bg-[#0df259] hover:text-black hover:border-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'ACCESSING...' : 'ENTER'}
                    </button>
                </form>
            </div>

            <div className="mt-8 text-xs font-bold uppercase tracking-widest opacity-40">
                Authorized Personnel Only
            </div>
        </div>
    );
}
