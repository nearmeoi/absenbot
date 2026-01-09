import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Menu as MenuIcon, LayoutGrid, Users, Layers, Calendar,
    MessageSquare, Terminal, Settings, LogOut, FlaskConical, X
} from 'lucide-react';

export default function Layout() {
    const { logout } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const getPageTitle = () => {
        const path = location.pathname;
        if (path === '/') return 'Overview';
        if (path === '/users') return 'Users';
        if (path === '/groups') return 'Groups';
        if (path === '/scheduler') return 'Scheduler';
        if (path === '/development') return 'Development';
        if (path === '/terminal') return 'Terminal';
        if (path === '/settings') return 'Settings';
        if (path === '/test-system') return 'System Test';
        return 'Dashboard';
    };

    const menuItems = [
        { text: 'Overview', icon: LayoutGrid, path: '/' },
        { text: 'Users', icon: Users, path: '/users' },
        { text: 'Groups', icon: Layers, path: '/groups' },
        { text: 'Scheduler', icon: Calendar, path: '/scheduler' },
        { text: 'Development', icon: MessageSquare, path: '/development' },
        { text: 'Terminal', icon: Terminal, path: '/terminal' },
        { text: 'System Test', icon: FlaskConical, path: '/test-system' },
        { text: 'Settings', icon: Settings, path: '/settings' },
    ];

    return (
        <div className="bg-white text-black flex flex-col md:flex-row min-h-screen font-sans selection:bg-primary selection:text-black">

            {/* Sidebar - Desktop */}
            <aside className="hidden md:flex w-24 border-r-4 border-black flex-col items-center py-6 gap-8 fixed h-full bg-white z-20 top-0 left-0">
                <div
                    className="neo bg-primary w-12 h-12 flex items-center justify-center cursor-pointer hover:translate-x-1 hover:translate-y-1 transition-transform"
                    onClick={() => navigate('/')}
                >
                    <LayoutGrid size={24} className="text-black" />
                </div>

                <nav className="flex flex-col gap-6 w-full items-center">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                title={item.text}
                                className={`w-12 h-12 flex items-center justify-center border-2 transition-all duration-200
                                    ${isActive
                                        ? 'bg-black text-white shadow-[4px_4px_0_#0df259] border-black translate-x-[-2px] translate-y-[-2px]'
                                        : 'border-transparent hover:border-black hover:shadow-[4px_4px_0_#000] text-black bg-transparent'
                                    }`}
                            >
                                <Icon size={24} strokeWidth={isActive ? 3 : 2} />
                            </button>
                        );
                    })}
                </nav>

                <div className="mt-auto mb-4">
                    <button
                        onClick={logout}
                        title="Logout"
                        className="w-12 h-12 flex items-center justify-center border-2 border-transparent hover:border-black hover:bg-red-500 hover:text-white hover:shadow-[4px_4px_0_#000] transition-all"
                    >
                        <LogOut size={24} />
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="md:hidden border-b-4 border-black p-4 flex justify-between items-center bg-white sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <div className="neo bg-primary w-10 h-10 flex items-center justify-center">
                        <LayoutGrid size={20} className="text-black" />
                    </div>
                    <h1 className="font-bold text-xl uppercase tracking-tighter">{getPageTitle()}</h1>
                </div>
                <button
                    onClick={() => setMobileOpen(true)}
                    className="p-2 border-2 border-black active:shadow-none shadow-[2px_2px_0_#000] active:translate-x-[2px] active:translate-y-[2px] transition-all"
                >
                    <MenuIcon size={24} />
                </button>
            </header>

            {/* Mobile Navigation Menu (Overlay) */}
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
                    <div
                        className="w-3/4 max-w-sm h-full bg-white border-r-4 border-black p-6 flex flex-col gap-6 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <span className="font-bold text-2xl uppercase">Menu</span>
                            <button onClick={() => setMobileOpen(false)} className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors">
                                <X size={28} />
                            </button>
                        </div>

                        <nav className="flex flex-col gap-3">
                            {menuItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location.pathname === item.path;
                                return (
                                    <button
                                        key={item.text}
                                        onClick={() => {
                                            navigate(item.path);
                                            setMobileOpen(false);
                                        }}
                                        className={`flex items-center gap-4 p-4 border-2 font-bold text-lg transition-all
                                            ${isActive
                                                ? 'bg-primary border-black shadow-[4px_4px_0_#000]'
                                                : 'border-black hover:bg-gray-100 hover:shadow-[4px_4px_0_#000] bg-white'
                                            }`}
                                    >
                                        <Icon size={24} />
                                        {item.text}
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="mt-auto border-t-4 border-black pt-6">
                            <button
                                onClick={logout}
                                className="w-full flex items-center justify-center gap-3 p-4 border-2 border-black bg-red-500 text-white font-bold shadow-[4px_4px_0_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                            >
                                <LogOut size={20} />
                                LOGOUT
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 md:ml-24 flex flex-col min-h-screen bg-white">
                {/* Desktop Header */}
                <header className="hidden md:flex justify-between items-center border-b-4 border-black p-10 py-6 bg-white sticky top-0 z-10 w-full">
                    <div className="h-12 px-6 bg-black text-white flex items-center justify-center transform -skew-x-12 shadow-[4px_4px_0_#0df259]">
                        <h1 className="font-bold text-2xl uppercase tracking-widest transform skew-x-12">
                            {getPageTitle()}
                        </h1>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="hidden lg:block text-sm font-bold text-gray-500 uppercase tracking-widest">
                            v1.0.0 Stable
                        </div>
                        <div className="neo px-6 py-2 font-bold bg-white hover:bg-black hover:text-white transition-colors cursor-pointer flex items-center gap-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full border border-black"></div>
                            ADMIN SESSION
                        </div>
                    </div>
                </header>

                {/* Content Container */}
                <div className="flex-1 p-6 md:p-10 space-y-8 overflow-x-hidden">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
