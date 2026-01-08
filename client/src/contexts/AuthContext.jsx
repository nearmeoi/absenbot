import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import api from '../utils/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = async () => {
        try {
            await api.get('/stats');
            setUser({ role: 'admin' });
        } catch (error) {
            console.error("Auth Check Failed:", error);
            // Show toast only if it's not a 401 (which is expected for non-logged in users)
            if (error.response?.status !== 401) {
                toast.error(`Auth Check Failed: ${error.message}`);
            }
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
            // Explicitly use withCredentials for the login post
            const res = await axios.post('/dashboard/login', { password }, { withCredentials: true });
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
            await axios.get('/dashboard/logout', { withCredentials: true });
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
