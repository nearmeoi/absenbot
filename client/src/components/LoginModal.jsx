import { useState } from 'react';
import axios from 'axios';
import { Search, UserCheck, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const LoginModal = ({ onLoginSuccess }) => {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async (e) => {
        e.preventDefault();
        // Validation for Name (at least 3 chars)
        if (!input || input.trim().length < 3) {
            setError('Masukkan minimal 3 huruf nama Anda!');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Search by Name
            const res = await axios.get(`/app-api/api/user-profile?name=${encodeURIComponent(input.trim())}`);
            
            if (res.data.success) {
                toast.success(`Selamat datang, ${res.data.name}!`, { icon: '👋' });
                // Pass the retrieved phone number to the app state
                onLoginSuccess(res.data.phone, res.data.name);
            }
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 404) {
                setError('Nama tidak ditemukan. Coba gunakan nama depan atau nama lengkap.');
            } else {
                setError('Terjadi kesalahan koneksi.');
            }
            toast.error('Gagal menemukan data');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0_#000] w-full max-w-md p-6 rounded-lg animate-bounce-in">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-cyan-300 border-2 border-black rounded-full flex items-center justify-center mx-auto mb-4 shadow-[4px_4px_0_#000]">
                        <Search size={32} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">Cek Akun Anda</h2>
                    <p className="text-sm font-bold text-gray-500 mt-2 leading-tight">
                        Ketik Nama Anda (sesuai pendaftaran MagangHub) untuk masuk.
                    </p>
                </div>

                <form onSubmit={handleSearch} className="space-y-4">
                    <div>
                        <input 
                            type="text" 
                            placeholder="Contoh: Budi Santoso" 
                            className="w-full p-4 border-2 border-black rounded-md font-bold text-lg text-center focus:outline-none focus:ring-4 ring-cyan-400 transition-all placeholder-gray-400 uppercase"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            autoFocus
                        />
                        {error && (
                            <div className="flex items-center gap-2 text-red-600 text-xs font-bold mt-2 bg-red-50 p-2 rounded border border-red-200">
                                <AlertCircle size={14} />
                                {error}
                            </div>
                        )}
                    </div>

                    <button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-black text-white font-black uppercase tracking-widest border-2 border-black rounded-md shadow-[4px_4px_0_rgba(0,0,0,0.2)] hover:bg-gray-900 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Mencari...' : (
                            <>
                                <UserCheck size={20} />
                                Cari Data
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">
                        Belum terdaftar? Chat Bot WA dulu dengan ketik !register
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginModal;