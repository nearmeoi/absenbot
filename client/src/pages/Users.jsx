import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Trash2, UserX, Users as UsersIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, IconButton, Typography, CircularProgress, Avatar, Chip, useMediaQuery, useTheme
} from '@mui/material';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
            setLoading(false);
        } catch (e) {
            toast.error('Failed to load users');
            setLoading(false);
        }
    };

    const handleDelete = async (phone) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await api.post('/users/delete', { phone });
            setUsers(users.filter(u => u.phone !== phone));
            toast.success('User deleted');
        } catch (e) {
            toast.error('Failed to delete user');
        }
    };

    const formatName = (email) => {
        try {
            return email.split('@')[0]
                .replace(/[._]/g, ' ')
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        } catch { return email; }
    };

    // Loading skeleton
    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="border-4 border-black p-4 h-24 bg-white animate-pulse shadow-[8px_8px_0_#000] rounded-2xl" />
                ))}
            </div>
        );
    }

    // Empty state
    if (users.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 border-4 border-black bg-white shadow-[8px_8px_0_#000] rounded-2xl text-center">
                <UserX size={64} strokeWidth={1.5} className="mb-4" />
                <h2 className="text-2xl font-black uppercase">No Users Found</h2>
                <p className="font-bold text-lg mt-2">Users will appear here once they register.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="border-4 border-black bg-[#ff6b6b] p-4 shadow-[8px_8px_0_#000] rounded-2xl">
                <h1 className="text-2xl font-black uppercase text-white tracking-widest">
                    Registered Users ({users.length})
                </h1>
            </div>

            {/* Users Grid/List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map((user) => (
                    <div key={user.phone} className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_#000] rounded-2xl relative group hover:-translate-y-1 transition-transform">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-[#3b82f6] border-2 border-black rounded-full flex items-center justify-center text-white font-black text-xl">
                                    {user.email?.[0]?.toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="font-black text-lg leading-tight">
                                        {user.name || formatName(user.email)}
                                    </h3>
                                    <div className="inline-block bg-green-400 text-black text-[10px] font-bold px-2 py-0.5 mt-1 border border-black uppercase">
                                        Aktif
                                    </div>
                                </div>
                            </div>
                            
                            <button 
                                onClick={() => handleDelete(user.phone)}
                                className="bg-red-500 border-2 border-black p-2 rounded-lg hover:bg-red-600 hover:shadow-[2px_2px_0_#000] transition-all"
                                title="Delete User"
                            >
                                <Trash2 size={18} color="white" strokeWidth={3} />
                            </button>
                        </div>
                        
                        <div className="mt-4 pt-3 border-t-2 border-black border-dashed">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status Akun</span>
                            <div className="font-bold text-xs text-green-600">SINKRONISASI BERHASIL</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
