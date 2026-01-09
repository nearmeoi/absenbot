import { useEffect, useState, useMemo } from 'react';
import api from '../utils/api';
import { Edit2, Trash2, Save, X, Search, Layers, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, Switch } from '@mui/material'; // Keeping Dialog for simplicity, but styling it

export default function Groups() {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editGroup, setEditGroup] = useState(null);
    const [formData, setFormData] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        loadGroups();
    }, []);

    useEffect(() => {
        if (editGroup) {
            setFormData({
                name: editGroup.name || '',
                schedulerEnabled: editGroup.schedulerEnabled || false,
                skipWeekends: editGroup.skipWeekends || false,
                isTesting: editGroup.isTesting || false,
                timezone: editGroup.timezone || 'Asia/Makassar'
            });
        }
    }, [editGroup]);

    const loadGroups = async () => {
        try {
            let activeGroups = [];
            try {
                const resActive = await api.get('/groups/active');
                activeGroups = resActive.data || [];
                setIsOffline(false);
            } catch (e) {
                setIsOffline(true);
                activeGroups = [];
            }

            const resSettings = await api.get('/groups');
            const settings = resSettings.data || {};

            const merged = activeGroups.map(g => ({
                ...g,
                ...(settings[g.id] || {}),
                isRegistered: !!settings[g.id],
                originalName: g.name
            }));

            Object.keys(settings).forEach(id => {
                if (!merged.find(g => g.id === id)) {
                    merged.push({
                        id,
                        name: settings[id].name || 'Unknown Group (Inactive)',
                        ...settings[id],
                        isRegistered: true,
                        isMissing: true
                    });
                }
            });

            setGroups(merged);
            setLoading(false);
        } catch (e) {
            console.error(e);
            toast.error('Failed to load groups');
            setLoading(false);
        }
    };

    const filteredGroups = useMemo(() => {
        if (!searchQuery) return groups;
        const query = searchQuery.toLowerCase();
        return groups.filter(g =>
            (g.name && g.name.toLowerCase().includes(query)) ||
            (g.id && g.id.toLowerCase().includes(query))
        );
    }, [groups, searchQuery]);

    const handleSave = async () => {
        if (!editGroup) return;
        try {
            await api.post('/groups', { groupId: editGroup.id, ...formData });
            setGroups(prev => prev.map(g => g.id === editGroup.id ? { ...g, ...formData, isRegistered: true } : g));
            toast.success('Group updated');
            setEditGroup(null);
        } catch (e) {
            toast.error('Failed to update group');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Unregister this group?')) return;
        try {
            await api.delete(`/groups/${encodeURIComponent(id)}`);
            setGroups(prev => prev.map(g => g.id === id ? { ...g, isRegistered: false, schedulerEnabled: false } : g));
            toast.success('Group unregistered');
        } catch (e) {
            toast.error('Failed to delete group');
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const getTimezoneLabel = (tz) => {
        if (tz === 'Asia/Jakarta') return 'WIB';
        if (tz === 'Asia/Jayapura') return 'WIT';
        return 'WITA';
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="border-4 border-black p-6 bg-white animate-pulse shadow-[8px_8px_0_#000] rounded-2xl h-40" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-4 border-black bg-white p-6 shadow-[8px_8px_0_#000] rounded-2xl">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter">
                        Groups ({filteredGroups.length})
                    </h1>
                    <p className="font-bold text-gray-500 mt-1">Manage bot assignments and automation.</p>
                </div>
                
                <div className="relative w-full md:w-auto">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black" size={20} strokeWidth={3} />
                    <input 
                        type="text" 
                        placeholder="SEARCH GROUPS..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full md:w-64 border-4 border-black p-3 pl-12 font-bold uppercase rounded-xl focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow placeholder:text-gray-400"
                    />
                </div>
            </div>

            {isOffline && (
                <div className="bg-[#facc15] border-4 border-black p-4 shadow-[8px_8px_0_#000] rounded-2xl flex items-center gap-3">
                    <div className="bg-black text-white p-2 rounded-full">
                        <Layers size={24} />
                    </div>
                    <div>
                        <h3 className="font-black text-lg uppercase">Bot Offline / Disconnected</h3>
                        <p className="font-bold text-sm">Only saved groups are shown. Connect the bot to see all WhatsApp groups.</p>
                    </div>
                </div>
            )}

            {/* Groups Grid */}
            <div className="grid grid-cols-1 gap-6">
                {filteredGroups.length === 0 ? (
                    <div className="text-center py-12 border-4 border-black bg-white shadow-[8px_8px_0_#000] rounded-2xl">
                        <Layers size={48} className="mx-auto mb-4" strokeWidth={1.5} />
                        <h3 className="text-2xl font-black uppercase">No Groups Found</h3>
                    </div>
                ) : (
                    filteredGroups.map(group => (
                        <div key={group.id} className={`border-4 border-black p-5 rounded-2xl shadow-[8px_8px_0_#000] transition-transform hover:-translate-y-1 relative overflow-hidden ${group.isRegistered ? 'bg-white' : 'bg-gray-100'}`}>
                            {/* Status Stripe */}
                            <div className={`absolute top-0 left-0 w-4 h-full border-r-4 border-black ${group.isRegistered ? 'bg-[#0df259]' : 'bg-gray-400'}`}></div>
                            
                            <div className="pl-8 flex flex-col md:flex-row justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 flex-wrap mb-2">
                                        <h3 className="text-xl font-black uppercase leading-tight">
                                            {group.name || 'Unknown Group'}
                                        </h3>
                                        {!group.isRegistered && (
                                            <span className="bg-[#3b82f6] text-white border-2 border-black px-2 py-0.5 text-xs font-black uppercase -rotate-2">NEW</span>
                                        )}
                                        {group.isMissing && (
                                            <span className="bg-[#ff6b6b] text-white border-2 border-black px-2 py-0.5 text-xs font-black uppercase rotate-2">BOT LEFT</span>
                                        )}
                                    </div>
                                    <div className="font-mono font-bold text-xs text-gray-500 bg-gray-200 inline-block px-2 py-1 border-2 border-black rounded mb-3">
                                        {group.id}
                                    </div>
                                    
                                    <div className="flex gap-2 flex-wrap">
                                        <span className="border-2 border-black px-3 py-1 font-bold text-xs uppercase rounded-full bg-white">
                                            {getTimezoneLabel(group.timezone)}
                                        </span>
                                        <span className="border-2 border-black px-3 py-1 font-bold text-xs uppercase rounded-full bg-white">
                                            {group.skipWeekends ? 'NO WEEKEND' : 'EVERYDAY'}
                                        </span>
                                        {group.schedulerEnabled && (
                                            <span className="border-2 border-black px-3 py-1 font-bold text-xs uppercase rounded-full bg-[#0df259]">
                                                AUTO ON
                                            </span>
                                        )}
                                        {group.isTesting && (
                                            <span className="border-2 border-black px-3 py-1 font-bold text-xs uppercase rounded-full bg-[#facc15]">
                                                TEST MODE
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 self-start md:self-center">
                                    <button
                                        onClick={() => setEditGroup(group)}
                                        className={`p-3 border-2 border-black rounded-xl shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ${group.isRegistered ? 'bg-[#facc15]' : 'bg-white'}`}
                                        title="Edit Settings"
                                    >
                                        {group.isRegistered ? <Edit2 size={20} strokeWidth={2.5} /> : <Plus size={20} strokeWidth={2.5} />}
                                    </button>
                                    
                                    {group.isRegistered && (
                                        <button
                                            onClick={() => handleDelete(group.id)}
                                            className="p-3 border-2 border-black rounded-xl shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all bg-[#ff6b6b] text-black"
                                            title="Unregister Group"
                                        >
                                            <Trash2 size={20} strokeWidth={2.5} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Brutalist Edit Dialog (using MUI Dialog container but custom content) */}
            <Dialog 
                open={!!editGroup} 
                onClose={() => setEditGroup(null)}
                maxWidth="sm" 
                fullWidth
                PaperProps={{
                    style: {
                        borderRadius: 16,
                        border: '4px solid black',
                        boxShadow: '8px 8px 0 #000',
                        overflow: 'visible'
                    }
                }}
            >
                {editGroup && (
                    <div className="bg-white p-6 rounded-xl relative">
                        <button 
                            onClick={() => setEditGroup(null)}
                            className="absolute -top-4 -right-4 bg-red-500 text-white border-4 border-black p-2 rounded-full hover:rotate-90 transition-transform shadow-[4px_4px_0_#000]"
                        >
                            <X size={24} strokeWidth={3} />
                        </button>

                        <h2 className="text-2xl font-black uppercase mb-6 border-b-4 border-black pb-2">
                            Edit Group Settings
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block font-bold text-sm uppercase mb-1">Group ID</label>
                                <div className="bg-gray-100 border-2 border-black p-3 font-mono text-xs break-all">
                                    {editGroup.id}
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-sm uppercase mb-1">Display Name</label>
                                <input
                                    type="text"
                                    className="w-full border-4 border-black p-3 font-bold focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow"
                                    value={formData.name || ''}
                                    onChange={(e) => handleChange('name', e.target.value)}
                                    placeholder={editGroup.originalName}
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-sm uppercase mb-1">Timezone</label>
                                <select
                                    className="w-full border-4 border-black p-3 font-bold bg-white focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow appearance-none"
                                    value={formData.timezone || 'Asia/Makassar'}
                                    onChange={(e) => handleChange('timezone', e.target.value)}
                                >
                                    <option value="Asia/Jakarta">WIB (Jakarta)</option>
                                    <option value="Asia/Makassar">WITA (Makassar)</option>
                                    <option value="Asia/Jayapura">WIT (Jayapura)</option>
                                </select>
                            </div>

                            <div className="border-4 border-black p-4 bg-gray-50 space-y-3">
                                <h3 className="font-black uppercase text-sm border-b-2 border-black pb-1 mb-2">Automation Rules</h3>
                                
                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="font-bold">Enable Scheduler</span>
                                    <Switch checked={formData.schedulerEnabled} onChange={(e) => handleChange('schedulerEnabled', e.target.checked)} color="success" />
                                </label>
                                
                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="font-bold">Skip Weekends</span>
                                    <Switch checked={formData.skipWeekends} onChange={(e) => handleChange('skipWeekends', e.target.checked)} color="default" />
                                </label>

                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="font-bold text-orange-600">Test Mode</span>
                                    <Switch checked={formData.isTesting} onChange={(e) => handleChange('isTesting', e.target.checked)} color="warning" />
                                </label>
                            </div>

                            <button
                                onClick={handleSave}
                                className="w-full bg-[#0df259] border-4 border-black py-4 font-black uppercase text-xl shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all mt-4 hover:bg-[#00d648]"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}

