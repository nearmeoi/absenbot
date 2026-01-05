import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = async () => {
        try {
            // Check status via API
            // We use /bot/status instead of /stats to be lighter, or just assume if /stats works we are good.
            // Existing dashboard uses /api/logs or /api/stats.
            await api.get('/stats');
            setUser({ role: 'admin' });
        } catch (error) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    const login = async (password) => {
        try {
            // Post to the auth endpoint (relative to root)
            const res = await axios.post('/dashboard/login', { password });
            if (res.data.success) {
                setUser({ role: 'admin' });
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    };

    const logout = async () => {
        try {
            await axios.get('/dashboard/logout');
        } catch (e) { }
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
