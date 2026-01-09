import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Users, CheckCircle, XCircle, LayoutGrid, MessageSquare, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StatCard from '../components/StatCard';

export default function Overview() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const loadStats = async () => {
            try {
                const res = await api.get('/stats');
                setStats(res.data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadStats();
        const interval = setInterval(loadStats, 30000);
        return () => clearInterval(interval);
    }, []);

    // Safe number calculation
    const safeNumber = (val) => {
        if (val === null || val === undefined || isNaN(val)) return 0;
        return val;
    };

    const totalUsers = safeNumber(stats?.totalUsers);
    const totalAbsen = safeNumber(stats?.totalAbsen);
    const missingReports = Math.max(0, totalUsers - totalAbsen);
    const participation = totalUsers > 0 ? Math.round((totalAbsen / totalUsers) * 100) : 0;
    const participationText = stats ? `${participation}% participation` : '—';

    const quickActions = [
        { label: 'Manage Messages', icon: MessageSquare, path: '/development' },
        { label: 'View Users', icon: Users, path: '/users' },
        { label: 'Configure Scheduler', icon: Calendar, path: '/scheduler' },
    ];

    return (
        <div className="space-y-10">
            {/* Stats Grid */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="Total Users"
                    value={totalUsers}
                    icon={Users}
                    color="primary"
                    loading={loading}
                    onClick={() => navigate('/users')}
                />
                <StatCard
                    label="Today's Reports"
                    value={totalAbsen}
                    icon={CheckCircle}
                    color="success"
                    subtext={participationText}
                    loading={loading}
                />
                <StatCard
                    label="Missing Reports"
                    value={missingReports}
                    icon={XCircle}
                    color="error"
                    loading={loading}
                />
                <StatCard
                    label="Groups"
                    value={safeNumber(stats?.totalGroups)}
                    icon={LayoutGrid}
                    color="warning"
                    loading={loading}
                    onClick={() => navigate('/groups')}
                />
            </section>

            {/* Quick Actions Section */}
            <section className="neo p-6 space-y-6 bg-white relative">
                <div className="flex justify-between items-center border-b-4 border-black pb-4">
                    <h2 className="text-2xl font-black uppercase">Quick Actions</h2>
                    <div className="hidden md:block w-32 h-4 bg-black/10"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {quickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={action.path}
                                onClick={() => navigate(action.path)}
                                className="neo-button p-6 flex flex-col items-center justify-center gap-4 bg-white hover:bg-black hover:text-white transition-colors group h-40"
                            >
                                <div className="p-3 border-2 border-black rounded-full group-hover:bg-white group-hover:text-black group-hover:border-transparent transition-colors">
                                    <Icon size={32} />
                                </div>
                                <span className="font-bold text-lg uppercase">{action.label}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Activity Chart Placeholder (Design Element) */}
            <section className="grid grid-cols-12 gap-6">
                <div className="col-span-12 lg:col-span-8 space-y-4">
                    <div className="neo p-6 bg-white min-h-[300px] flex flex-col gap-4">
                        <h3 className="font-bold text-lg uppercase">System Activity</h3>
                        <div className="flex-1 grid-bg border-4 border-black w-full min-h-[200px] flex items-center justify-center">
                            <span className="bg-white p-2 border-2 border-black font-bold">CHART PLACEHOLDER</span>
                        </div>
                    </div>
                </div>
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    <div className="neo p-4 h-full bg-[#0df259] flex flex-col justify-center items-center text-center p-8 border-4 border-black">
                        <div className="text-6xl font-black mb-4">v1.0</div>
                        <div className="font-bold border-t-4 border-black pt-4 w-full">SYSTEM STATUS: ONLINE</div>
                    </div>
                </div>
            </section>
        </div>
    );
}
