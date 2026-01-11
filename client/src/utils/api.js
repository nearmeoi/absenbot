import axios from 'axios';

// Create axios instance with base URL for dashboard API
const api = axios.create({
    baseURL: '/dashboard/api',
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Response interceptor to handle auth errors globally
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // If API returns 401, redirect to login
            // But only if we are not already on login page AND not on the public app subdomain
            const isAppSubdomain = window.location.hostname.startsWith('app.');

            if (!isAppSubdomain && !window.location.pathname.includes('/login')) {
                window.location.href = '/dashboard/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
