import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';

export default function PairingAuth() {
    const { token } = useParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('loading');
        try {
            const res = await axios.post('/auth/submit', { token, email, password });
            if (res.data.success) {
                setStatus('success');
                setMessage(res.data.message);
            } else {
                setStatus('error');
                setMessage(res.data.message);
            }
        } catch (e) {
            setStatus('error');
            setMessage('Connection failed');
        }
    };

    if (status === 'success') {
        return (
            <div className="min-h-screen grid-bg flex flex-col justify-center items-center p-4">
                <div className="neo bg-white w-full max-w-sm p-8 flex flex-col items-center gap-6 relative text-center">
                    <div className="bg-[#0df259] border-4 border-black p-4 rounded-full shadow-[4px_4px_0_#000] mb-2">
                        <CheckCircle size={48} strokeWidth={3} className="text-black" />
                    </div>
                    
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Login Berhasil!</h1>
                    
                    <div className="bg-green-100 border-2 border-black p-4 font-bold text-sm w-full">
                        {message}
                    </div>

                    <p className="text-xs font-bold uppercase text-gray-400 mt-4">Anda boleh menutup halaman ini.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen grid-bg flex flex-col justify-center items-center p-4">
            <div className="neo bg-white w-full max-w-sm p-8 flex flex-col items-center gap-6 relative">
                {/* Decorative elements */}
                <div className="absolute -top-3 -left-3 w-6 h-6 bg-black"></div>
                <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-black"></div>

                <div className="bg-black text-white p-3 rounded-lg border-2 border-black transform rotate-3">
                    <ShieldCheck size={32} strokeWidth={2.5} />
                </div>

                <div className="text-center space-y-1 w-full border-b-4 border-black pb-4">
                    <h1 className="text-2xl font-black uppercase tracking-tighter">Masuk SIAPkerja</h1>
                    <p className="text-xs font-bold text-gray-500 uppercase">Secure Pairing Authentication</p>
                </div>

                {status === 'error' && (
                    <div className="bg-red-100 border-2 border-black p-3 font-bold flex items-center gap-2 text-sm w-full shadow-[4px_4px_0_#ff6b6b]">
                        <AlertCircle size={20} className="text-red-600 shrink-0" />
                        <span className="uppercase">{message}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest pl-1">Email / No. HP</label>
                        <input
                            type="text"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            placeholder="user@example.com"
                            className="w-full border-4 border-black p-3 font-bold text-lg focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow bg-gray-50"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest pl-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            className="w-full border-4 border-black p-3 font-bold text-lg focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow bg-gray-50"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'loading'}
                        className="mt-2 w-full bg-[#14b8a6] border-4 border-black p-4 font-black text-xl uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all hover:bg-[#0d9488] text-white disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                    >
                        {status === 'loading' ? 'Authenticating...' : 'MASUK'}
                    </button>
                </form>
            </div>

            <div className="mt-8 text-xs font-bold uppercase tracking-widest opacity-40">
                ©2026 Kemnaker RI • Secured by AbsenBot
            </div>
        </div>
    );
}