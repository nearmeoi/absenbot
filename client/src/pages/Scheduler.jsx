import { useEffect, useState, useRef } from 'react';
import api from '../utils/api';
import { Clock, Calendar, Plus, Edit2, Trash2, Play, Pause, Save, X, Mic, Upload, RefreshCw, Volume2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Typography, CircularProgress, Chip, Card, CardHeader, CardContent, useMediaQuery, useTheme, Skeleton,
    Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel
} from '@mui/material';

export default function Scheduler() {
    const [schedules, setSchedules] = useState([]);
    const [allMessages, setAllMessages] = useState({});
    const [loading, setLoading] = useState(true);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [vnStatus, setVnStatus] = useState({ files: [] });
    const [isUploadingVn, setIsUploadingVn] = useState(false);
    const [playingFile, setPlayingFile] = useState(null);
    
    const audioRef = useRef(null);

    // Form State
    const [formData, setFormData] = useState({
        time: '08:00',
        description: '',
        type: 'group_hidetag',
        messageKey: 'REMINDER_MORNING',
        customContent: '',
        useCustom: false,
        enabled: true
    });

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        loadScheduler();
        loadVnStatus();
        
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const loadVnStatus = async () => {
        try {
            const res = await api.get('/scheduler/vn/status');
            setVnStatus(res.data && Array.isArray(res.data.files) ? res.data : { files: [] });
        } catch (e) { 
            console.error('Error loading VN status:', e);
            setVnStatus({ files: [] });
        }
    };

    const handlePlayPreview = async (filename) => {
        if (playingFile === filename) {
            audioRef.current.pause();
            setPlayingFile(null);
            return;
        }

        if (audioRef.current) {
            audioRef.current.pause();
        }

        try {
            // Fetch as blob to handle auth correctly
            const res = await api.get(`/scheduler/vn/play/${filename}`, { responseType: 'blob' });
            const blobUrl = URL.createObjectURL(res.data);
            
            const audio = new Audio(blobUrl);
            
            audio.onplay = () => setPlayingFile(filename);
            audio.onended = () => {
                setPlayingFile(null);
                URL.revokeObjectURL(blobUrl);
            };
            audio.onerror = () => {
                toast.error('Failed to play audio.');
                setPlayingFile(null);
            };

            audioRef.current = audio;
            await audio.play();
        } catch (e) {
            console.error(e);
            toast.error('Failed to load audio preview');
        }
    };

    const handleTestSend = async (filename) => {
        const phone = prompt("Enter WhatsApp number for test (e.g. 628123...):");
        if (!phone) return;

        const toastId = toast.loading('Sending test VN...');
        try {
            await api.post('/scheduler/vn/test-send', { filename, phone });
            toast.success('Test VN sent!', { id: toastId });
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to send', { id: toastId });
        }
    };

    const handleUploadVn = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('audio', file);

        setIsUploadingVn(true);
        try {
            await api.post('/scheduler/upload-vn', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Added to Playlist!');
            setTimeout(loadVnStatus, 500);
        } catch (e) {
            toast.error('Upload failed');
        } finally {
            setIsUploadingVn(false);
            e.target.value = null;
        }
    };

    const handleDeleteVn = async (filename) => {
        if (!confirm(`Delete ${filename}?`)) return;
        try {
            await api.delete(`/scheduler/vn/${filename}`);
            toast.success('Removed from Playlist');
            loadVnStatus();
            if (playingFile === filename) {
                audioRef.current?.pause();
                setPlayingFile(null);
            }
        } catch (e) {
            toast.error('Failed to delete file');
        }
    };

    const loadScheduler = async () => {
        try {
            const res = await api.get('/scheduler');
            setSchedules(res.data.schedules || []);
            setAllMessages(res.data.messages || {});
            setLoading(false);
        } catch (e) {
            toast.error('Failed to load scheduler');
            setLoading(false);
        }
    };

    const handleOpenDialog = (schedule = null) => {
        if (schedule) {
            setEditingId(schedule.id);
            const isCustom = schedule.messageKey && schedule.messageKey.startsWith('SCHED_CUSTOM_');
            setFormData({
                time: schedule.time,
                description: schedule.description,
                type: schedule.type,
                messageKey: isCustom ? 'custom' : schedule.messageKey,
                customContent: isCustom ? (allMessages[schedule.messageKey] || '') : '',
                useCustom: isCustom,
                enabled: schedule.enabled
            });
        } else {
            setEditingId(null);
            setFormData({
                time: '08:00',
                description: '',
                type: 'group_hidetag',
                messageKey: 'REMINDER_MORNING',
                customContent: '',
                useCustom: false,
                enabled: true
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async () => {
        try {
            const payload = { ...formData };
            if (formData.useCustom) {
                if (!formData.customContent.trim()) {
                    toast.error('Custom message content cannot be empty');
                    return;
                }
                payload.messageKey = null;
            } else {
                payload.customContent = null;
            }

            if (editingId) {
                await api.put(`/scheduler/${editingId}`, payload);
                toast.success('Schedule updated');
            } else {
                await api.post('/scheduler', payload);
                toast.success('Schedule created');
            }
            setOpenDialog(false);
            loadScheduler();
        } catch (e) {
            toast.error('Failed to save schedule');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this schedule?')) return;
        try {
            await api.delete(`/scheduler/${id}`);
            toast.success('Schedule deleted');
            loadScheduler();
        } catch (e) {
            toast.error('Failed to delete schedule');
        }
    };

    const handleTrigger = async (id) => {
        try {
            await api.post(`/scheduler/trigger/${id}`);
            toast.success('Trigger command sent');
        } catch (e) {
            toast.error('Failed to trigger schedule');
        }
    };

    const handleMessageKeyChange = (e) => {
        const val = e.target.value;
        if (val === 'custom') {
            setFormData({ ...formData, messageKey: 'custom', useCustom: true });
        } else {
            setFormData({ ...formData, messageKey: val, useCustom: false });
        }
    };

    const formatTime = (time) => time?.substring(0, 5) || '—';

    const getTypeLabel = (type) => {
        switch(type) {
            case 'group_hidetag': return 'Group Broadcast';
            case 'group_hidetag_japri': return 'Broadcast + DM';
            case 'draft_push': return 'Draft Push';
            case 'emergency_submit': return 'Auto Submit';
            default: return type;
        }
    };

    const MobileSkeleton = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[1, 2, 3].map(i => (
                <div key={i} className="border-[3px] border-black rounded-2xl p-5 shadow-[8px_8px_0_#000] bg-white animate-pulse">
                    <div className="h-10 w-1/3 bg-gray-300 mb-4 rounded"></div>
                    <div className="h-6 w-3/4 bg-gray-300 mb-6 rounded"></div>
                    <div className="h-12 w-full bg-gray-300 rounded-full"></div>
                </div>
            ))}
        </Box>
    );

    const MobileScheduleCard = ({ schedule }) => (
        <div className="bg-white border-[3px] border-black rounded-2xl shadow-[8px_8px_0_#000] mb-8 p-5 relative overflow-visible">
            <div className={`absolute -top-4 -right-2 border-[3px] border-black px-3 py-1 font-black text-xs uppercase transform rotate-2 ${schedule.enabled ? 'bg-[#0df259] text-black' : 'bg-gray-300 text-gray-600'}`}>
                {schedule.enabled ? "ACTIVE" : "OFF"}
            </div>
            <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-5xl font-black text-black tracking-tighter">{formatTime(schedule.time)}</h2>
                <span className="text-lg font-bold">WITA</span>
            </div>
            <h3 className="text-xl font-bold leading-tight border-b-[3px] border-black pb-3 mb-3">{schedule.description || 'Untitled Schedule'}</h3>
            <div className="mb-6 font-bold text-sm uppercase">TYPE: {getTypeLabel(schedule.type)}</div>
            <div className="flex flex-col gap-3">
                <button onClick={() => handleTrigger(schedule.id)} className="w-full bg-[#3b82f6] border-[2px] border-black rounded-full py-3 font-black text-white uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 text-sm">
                    <Play size={20} strokeWidth={3} /> Test Run
                </button>
                <div className="flex gap-3">
                    <button onClick={() => handleOpenDialog(schedule)} className="flex-1 bg-[#facc15] border-[2px] border-black rounded-full py-3 font-black text-black uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 text-sm">
                        <Edit2 size={18} strokeWidth={3} /> Edit
                    </button>
                    <button onClick={() => handleDelete(schedule.id)} className="flex-1 bg-[#ff6b6b] border-[2px] border-black rounded-full py-3 font-black text-black uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 text-sm">
                        <Trash2 size={18} strokeWidth={3} /> Delete
                    </button>
                </div>
            </div>
        </div>
    );

    if (loading) {
        return isMobile ? <MobileSkeleton /> : <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    const formatDateSafe = (dateString) => {
        try {
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return 'Just now';
            return d.toLocaleString();
        } catch (e) { return 'Just now'; }
    };

    return (
        <Box>
            {/* Morning VN Section */}
            <div className="mb-8 border-[3px] border-black bg-white rounded-2xl shadow-[6px_6px_0_#000] overflow-hidden">
                <div className="bg-black text-white p-4 flex items-center gap-3">
                    <Mic size={24} strokeWidth={2.5} />
                    <h2 className="text-lg font-black uppercase tracking-tight">Morning Playlist</h2>
                    <span className="bg-white text-black px-2 py-0.5 rounded text-xs font-bold border border-black">
                        {(vnStatus.files || []).length} FILES
                    </span>
                </div>
                
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className={`w-3 h-3 rounded-full ${(vnStatus.files || []).length > 0 ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-gray-300'}`}></div>
                        <span className="font-bold text-lg uppercase">{(vnStatus.files || []).length > 0 ? 'Playlist Active' : 'Playlist Empty'}</span>
                        
                        <label className={`cursor-pointer flex items-center justify-center gap-2 bg-[#3b82f6] text-white border-[3px] border-black px-4 py-2 rounded-xl font-bold uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ml-auto hover:bg-[#2563eb] ${isUploadingVn ? 'opacity-50 pointer-events-none' : ''}`}>
                            <Upload size={18} strokeWidth={2.5} />
                            {isUploadingVn ? 'Uploading...' : 'Add Audio'}
                            <input type="file" accept="audio/*" className="hidden" onChange={handleUploadVn} disabled={isUploadingVn} />
                        </label>
                    </div>

                    {(vnStatus.files || []).length > 0 ? (
                        <div className="space-y-3">
                            {(vnStatus.files || []).map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 border-2 border-black rounded-lg bg-gray-50 hover:bg-white transition-colors">
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => handlePlayPreview(file.name)}
                                            className={`p-2 rounded-full border border-black shadow-[2px_2px_0_#000] active:translate-y-0.5 transition-all ${playingFile === file.name ? 'bg-red-400' : 'bg-green-400'}`}
                                        >
                                            {playingFile === file.name ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" />}
                                        </button>
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-sm truncate max-w-[150px] md:max-w-md" title={file.name}>{file.name}</p>
                                            <p className="text-xs text-gray-500">{formatDateSafe(file.created)} • {(file.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => handleTestSend(file.name)}
                                            className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Test Send to Me"
                                        >
                                            <Send size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteVn(file.name)}
                                            className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-xl">
                            <p className="text-gray-400 font-bold">No audio files in playlist.</p>
                            <p className="text-gray-400 text-sm">Upload .mp3 files to get started.</p>
                        </div>
                    )}
                </div>
            </div>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" fontWeight={900} sx={{ textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
                    Active Schedules
                </Typography>
                <button
                    onClick={() => handleOpenDialog()}
                    className="bg-[#0df259] border-[3px] border-black rounded-full px-6 py-2 font-black text-black uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-2 hover:bg-white"
                >
                    <Plus size={20} strokeWidth={3} />
                    Add Schedule
                </button>
            </Box>

            {!isMobile && (
                <div className="border-[3px] border-black rounded-xl overflow-hidden shadow-[8px_8px_0_#000]">
                    <table className="w-full bg-white text-left border-collapse">
                        <thead>
                            <tr className="bg-black text-white">
                                <th className="p-4 font-black uppercase tracking-wider text-sm border-r border-gray-700">Time</th>
                                <th className="p-4 font-black uppercase tracking-wider text-sm border-r border-gray-700">Description</th>
                                <th className="p-4 font-black uppercase tracking-wider text-sm border-r border-gray-700">Type</th>
                                <th className="p-4 font-black uppercase tracking-wider text-sm border-r border-gray-700">Status</th>
                                <th className="p-4 font-black uppercase tracking-wider text-sm text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedules.map((s) => (
                                <tr key={s.id} className="border-b-[3px] border-black hover:bg-[#fff9c4] transition-colors last:border-b-0 group">
                                    <td className="p-4 border-r-[3px] border-black font-black text-xl font-mono">
                                        {formatTime(s.time)} <span className="text-xs text-gray-500 font-sans">WITA</span>
                                    </td>
                                    <td className="p-4 border-r-[3px] border-black font-bold">
                                        {s.description || <span className="text-gray-400 italic">No description</span>}
                                    </td>
                                    <td className="p-4 border-r-[3px] border-black">
                                        <span className="inline-block px-3 py-1 border-[2px] border-black bg-white rounded-lg text-xs font-bold uppercase shadow-[2px_2px_0_#000]">
                                            {getTypeLabel(s.type)}
                                        </span>
                                    </td>
                                    <td className="p-4 border-r-[3px] border-black">
                                        <span className={`inline-block px-3 py-1 border-[2px] border-black rounded-lg text-xs font-bold uppercase shadow-[2px_2px_0_#000] ${s.enabled ? 'bg-[#0df259]' : 'bg-gray-200 text-gray-500'}`}>
                                            {s.enabled ? "ACTIVE" : "DISABLED"}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-100">
                                            <button 
                                                onClick={() => handleTrigger(s.id)} 
                                                className="p-2 bg-[#3b82f6] text-white border-[2px] border-black rounded-lg hover:bg-[#2563eb] shadow-[2px_2px_0_#000] active:translate-y-[2px] active:shadow-none transition-all"
                                                title="Test Run"
                                            >
                                                <Play size={16} strokeWidth={3} />
                                            </button>
                                            <button 
                                                onClick={() => handleOpenDialog(s)} 
                                                className="p-2 bg-[#facc15] text-black border-[2px] border-black rounded-lg hover:bg-[#eab308] shadow-[2px_2px_0_#000] active:translate-y-[2px] active:shadow-none transition-all"
                                                title="Edit"
                                            >
                                                <Edit2 size={16} strokeWidth={3} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(s.id)} 
                                                className="p-2 bg-[#ff6b6b] text-black border-[2px] border-black rounded-lg hover:bg-[#fa5252] shadow-[2px_2px_0_#000] active:translate-y-[2px] active:shadow-none transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} strokeWidth={3} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {schedules.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center bg-gray-50 border-t-[3px] border-black">
                                        <p className="font-bold text-gray-400 uppercase">No schedules found</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {isMobile && <Box>{schedules.map((s) => <MobileScheduleCard key={s.id} schedule={s} />)}</Box>}

            <Dialog 
                open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth
                PaperProps={{ style: { borderRadius: 16, border: '4px solid black', boxShadow: '8px 8px 0 #000', overflow: 'visible' } }}
            >
                <div className="bg-white p-6 rounded-xl relative">
                    <button onClick={() => setOpenDialog(false)} className="absolute -top-4 -right-4 bg-[#ff6b6b] text-black border-4 border-black p-2 rounded-full hover:rotate-90 transition-transform shadow-[4px_4px_0_#000]">
                        <X size={24} strokeWidth={3} />
                    </button>
                    <h2 className="text-2xl font-black uppercase mb-6 border-b-4 border-black pb-2">{editingId ? 'Edit Schedule' : 'New Schedule'}</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block font-bold text-sm uppercase mb-1">Time (WITA)</label>
                            <input type="time" className="w-full border-4 border-black p-3 font-bold text-lg focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} />
                        </div>
                        <div>
                            <label className="block font-bold text-sm uppercase mb-1">Description</label>
                            <input type="text" className="w-full border-4 border-black p-3 font-bold focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. Morning Reminder" />
                        </div>
                        <div>
                            <label className="block font-bold text-sm uppercase mb-1">Type</label>
                            <div className="relative">
                                <select className="w-full border-4 border-black p-3 font-bold bg-white focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow appearance-none" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                                    <option value="group_hidetag">Group Broadcast (Hidetag)</option>
                                    <option value="group_hidetag_japri">Broadcast + Japri Unfinished</option>
                                    <option value="draft_push">Draft Push (Emergency)</option>
                                    <option value="emergency_submit">Auto Submit (Emergency)</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">▼</div>
                            </div>
                        </div>
                        {(formData.type === 'group_hidetag' || formData.type === 'group_hidetag_japri') && (
                            <>
                                <div>
                                    <label className="block font-bold text-sm uppercase mb-1">Message Template</label>
                                    <div className="relative">
                                        <select className="w-full border-4 border-black p-3 font-bold bg-white focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow appearance-none" value={formData.messageKey} onChange={handleMessageKeyChange}>
                                            <option value="REMINDER_MORNING">Morning Reminder</option>
                                            <option value="REMINDER_AFTERNOON">Afternoon Reminder</option>
                                            <option value="REMINDER_EVENING">Evening Reminder</option>
                                            <option value="custom">Custom Message (Buat Sendiri)</option>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">▼</div>
                                    </div>
                                </div>
                                {formData.useCustom && (
                                    <div>
                                        <label className="block font-bold text-sm uppercase mb-1">Custom Message Content</label>
                                        <textarea className="w-full border-4 border-black p-3 font-bold focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow" rows="4" placeholder="Tulis pesan pengingat di sini..." value={formData.customContent} onChange={(e) => setFormData({ ...formData, customContent: e.target.value })}></textarea>
                                        <p className="text-xs font-bold mt-1 text-gray-500">Pesan ini akan disimpan sebagai template baru.</p>
                                    </div>
                                )}
                            </>
                        )}
                        <div className="border-4 border-black p-4 bg-gray-50 flex items-center justify-between cursor-pointer">
                            <span className="font-bold uppercase">Enable Schedule</span>
                            <Switch checked={formData.enabled} onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })} color="success" />
                        </div>
                        <button onClick={handleSave} className="w-full bg-[#0df259] border-4 border-black py-4 font-black uppercase text-xl shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all mt-4 hover:bg-[#00d648] flex items-center justify-center gap-2">
                            <Save size={24} strokeWidth={3} /> Save Schedule
                        </button>
                    </div>
                </div>
            </Dialog>
        </Box>
    );
}