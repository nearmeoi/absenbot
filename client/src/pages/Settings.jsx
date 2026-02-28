import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Plus, Trash2, Calendar, Info, Settings as SettingsIcon, ChevronDown, ChevronUp, ShieldAlert, Terminal, RefreshCw, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { Switch } from '@mui/material';

export default function Settings() {
    const [status, setStatus] = useState('online');
    const [maintenanceCommands, setMaintenanceCommands] = useState([]);
    const [availableCommands, setAvailableCommands] = useState([]);
    const [loadingStatus, setLoadingStatus] = useState(true);
    
    const [holidays, setHolidays] = useState([]);
    const [loadingHolidays, setLoadingHolidays] = useState(true);
    const [newDate, setNewDate] = useState('');
    const [isRestarting, setIsRestarting] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        loadStatus();
        loadHolidays();
    }, []);

    const loadStatus = async () => {
        try {
            const res = await api.get('/bot/status');
            setStatus(res.data.status || 'online');
            setMaintenanceCommands(res.data.maintenanceCommands || []);
            setAvailableCommands(res.data.availableCommands || []);
            setLoadingStatus(false);
        } catch (e) {
            toast.error('Failed to load bot status');
            setLoadingStatus(false);
        }
    };

    const handleRestart = async () => {
        if (!window.confirm('Apakah Anda yakin ingin me-restart bot? Dashboard akan terputus sejenak.')) return;
        setIsRestarting(true);
        try {
            await api.post('/bot/restart');
            toast.success('Bot sedang di-restart...');
            setTimeout(() => {
                window.location.reload();
            }, 5000);
        } catch (e) {
            toast.error('Gagal me-restart bot');
            setIsRestarting(false);
        }
    };

    const handleResetSession = async () => {
        if (!window.confirm('PERINGATAN: Ini akan menghapus sesi login WhatsApp. Anda harus SCAN QR ULANG. Lanjutkan?')) return;
        setIsResetting(true);
        try {
            await api.post('/bot/reset-session');
            toast.success('Sesi dihapus. Menunggu bot restart...');
            setTimeout(() => {
                window.location.href = '/dashboard/pairing';
            }, 5000);
        } catch (e) {
            toast.error('Gagal menghapus sesi');
            setIsResetting(false);
        }
    };

    const toggleCommandMaintenance = async (cmd) => {
        try {
            const res = await api.post('/bot/command-maintenance', { command: cmd });
            setMaintenanceCommands(res.data.maintenanceCommands);
            toast.success(`!${cmd} is now ${res.data.isMaintenance ? 'under maintenance' : 'active'}`);
        } catch (e) {
            toast.error('Failed to update command maintenance');
        }
    };

    const loadHolidays = async () => {
        try {
            const res = await api.get('/holidays');
            setHolidays(res.data || []);
            setLoadingHolidays(false);
        } catch (e) {
            toast.error('Failed to load holidays');
            setLoadingHolidays(false);
        }
    };

    const addHoliday = async () => {
        if (!newDate) return;
        try {
            const res = await api.post('/holidays', { date: newDate });
            setHolidays(res.data.holidays || []);
            setNewDate('');
            toast.success('Holiday added');
        } catch (e) {
            toast.error('Failed to add holiday');
        }
    };

    const deleteHoliday = async (date) => {
        try {
            const res = await api.delete(`/holidays/${date}`);
            setHolidays(res.data.holidays || []);
            toast.success('Holiday removed');
        } catch (e) {
            toast.error('Failed to delete holiday');
        }
    };

    // Brutalist Section Component
    const SettingsSection = ({ title, subtitle, icon: Icon, children, defaultOpen = true }) => {
        const [isOpen, setIsOpen] = useState(defaultOpen);
        return (
            <div className="border-4 border-black bg-white shadow-[8px_8px_0_#000] rounded-2xl overflow-hidden mb-8">
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between p-6 bg-white border-b-4 border-black hover:bg-gray-50 transition-colors text-left"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-black text-white rounded-lg">
                            <Icon size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight">{title}</h2>
                            {subtitle && <p className="font-bold text-sm text-gray-500 mt-0.5">{subtitle}</p>}
                        </div>
                    </div>
                    {isOpen ? <ChevronUp size={24} strokeWidth={3} /> : <ChevronDown size={24} strokeWidth={3} />}
                </button>
                {isOpen && <div className="p-6">{children}</div>}
            </div>
        );
    };

    if (loadingStatus && loadingHolidays) {
        return (
            <div className="space-y-6">
                {[1, 2].map(i => (
                    <div key={i} className="border-4 border-black p-6 bg-white animate-pulse shadow-[8px_8px_0_#000] rounded-2xl h-48" />
                ))}
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <h1 className="text-4xl font-black uppercase mb-8 border-b-4 border-black pb-4 inline-block">System Settings</h1>

            {/* SYSTEM CONTROL */}
            <SettingsSection title="System Control" subtitle="Restart or Reset the entire bot" icon={SettingsIcon}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="border-4 border-black p-6 rounded-xl bg-white shadow-[4px_4px_0_#000]">
                        <h3 className="font-black uppercase mb-2">Restart Bot</h3>
                        <p className="text-sm font-bold text-gray-500 mb-4">Mulai ulang proses bot jika merasa bot tidak merespons (freeze).</p>
                        <button 
                            onClick={handleRestart}
                            disabled={isRestarting}
                            className={`w-full flex items-center justify-center gap-2 py-3 border-4 border-black rounded-xl font-black uppercase transition-all shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${isRestarting ? 'bg-gray-200 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-500'}`}
                        >
                            <RefreshCw className={isRestarting ? 'animate-spin' : ''} size={20} strokeWidth={3} />
                            {isRestarting ? 'Restarting...' : 'Restart Bot'}
                        </button>
                    </div>

                    <div className="border-4 border-black p-6 rounded-xl bg-white shadow-[4px_4px_0_#000]">
                        <h3 className="font-black uppercase mb-2 text-red-600">Reset Session</h3>
                        <p className="text-sm font-bold text-gray-500 mb-4">Hapus sesi WhatsApp saat ini. Gunakan jika bot terkena logout atau ganti nomor.</p>
                        <button 
                            onClick={handleResetSession}
                            disabled={isResetting}
                            className={`w-full flex items-center justify-center gap-2 py-3 border-4 border-black rounded-xl font-black uppercase transition-all shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${isResetting ? 'bg-gray-200 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'}`}
                        >
                            <LogOut size={20} strokeWidth={3} />
                            {isResetting ? 'Resetting...' : 'Reset Session'}
                        </button>
                    </div>
                </div>
            </SettingsSection>

            {/* COMMAND MAINTENANCE */}
            <SettingsSection title="Command Controls" subtitle="Enable/Disable specific bot commands" icon={ShieldAlert}>
                <div className="flex items-start gap-3 mb-6 bg-yellow-50 border-l-4 border-yellow-500 p-4 font-bold text-sm text-yellow-800">
                    <Info size={20} className="shrink-0" />
                    <p>Commands toggled ON will respond with a maintenance message to users.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {availableCommands.map(cmd => {
                        const isMaint = maintenanceCommands.includes(cmd);
                        return (
                            <div key={cmd} className={`flex items-center justify-between p-4 border-4 border-black rounded-xl shadow-[4px_4px_0_#000] transition-colors ${isMaint ? 'bg-red-50' : 'bg-white'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-md border-2 border-black ${isMaint ? 'bg-red-500 text-white' : 'bg-gray-100 text-black'}`}>
                                        <Terminal size={16} />
                                    </div>
                                    <span className="font-black uppercase text-sm">!{cmd}</span>
                                </div>
                                <Switch
                                    checked={isMaint}
                                    onChange={() => toggleCommandMaintenance(cmd)}
                                    color="error"
                                />
                            </div>
                        );
                    })}
                </div>
            </SettingsSection>

            {/* HOLIDAYS */}
            <SettingsSection title="Custom Holidays" subtitle="Pause scheduler on specific dates" icon={Calendar}>
                <div className="flex items-start gap-3 mb-6 bg-blue-100 border-l-4 border-blue-500 p-4 font-bold text-sm">
                    <Info size={20} className="text-blue-500 shrink-0" />
                    <p>Add dates when the scheduler should NOT send reminders.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <input
                        type="date"
                        className="flex-1 border-4 border-black p-3 font-bold rounded-xl focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow uppercase"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                    />
                    <button
                        onClick={addHoliday}
                        className="bg-black text-white border-4 border-black px-6 py-3 font-black uppercase rounded-xl hover:bg-gray-800 hover:shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2"
                    >
                        <Plus size={20} strokeWidth={3} /> Add
                    </button>
                </div>

                <div className="bg-gray-50 border-4 border-black rounded-xl max-h-64 overflow-y-auto p-2">
                    {holidays.length === 0 ? (
                        <div className="p-8 font-bold text-center text-gray-400 italic">No custom holidays set.</div>
                    ) : (
                        <div className="space-y-2">
                            {holidays.map((date, i) => (
                                <div key={i} className="flex justify-between items-center bg-white border-2 border-black p-3 rounded-lg shadow-[2px_2px_0_#000]">
                                    <div>
                                        <div className="font-black uppercase">{new Date(date).toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</div>
                                        <div className="text-xs font-bold text-gray-500">{date}</div>
                                    </div>
                                    <button onClick={() => deleteHoliday(date)} className="p-2 hover:bg-red-100 rounded-md transition-colors text-red-600">
                                        <Trash2 size={20} strokeWidth={2.5} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SettingsSection>
        </div>
    );
}