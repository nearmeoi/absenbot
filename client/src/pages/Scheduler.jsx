import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Clock, Calendar, Plus, Edit2, Trash2, Play, Save, X } from 'lucide-react';
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
    }, []);

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
            
            // Detect if it is a custom key
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
            
            // If using custom message, pass it in payload and ignore messageKey
            if (formData.useCustom) {
                if (!formData.customContent.trim()) {
                    toast.error('Custom message content cannot be empty');
                    return;
                }
                payload.messageKey = null; // Backend will generate new key
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

    // Mobile skeleton (Neo-Brutalist)
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

    // Neo-Brutalist Mobile Card
    const MobileScheduleCard = ({ schedule }) => (
        <div className="bg-white border-[3px] border-black rounded-2xl shadow-[8px_8px_0_#000] mb-8 p-5 relative overflow-visible">
            {/* Status Badge */}
            <div className={`absolute -top-4 -right-2 border-[3px] border-black px-3 py-1 font-black text-xs uppercase transform rotate-2 ${schedule.enabled ? 'bg-[#0df259] text-black' : 'bg-gray-300 text-gray-600'}`}>
                {schedule.enabled ? "ACTIVE" : "OFF"}
            </div>

            {/* Time Display */}
            <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-5xl font-black text-black tracking-tighter">
                    {formatTime(schedule.time)}
                </h2>
                <span className="text-lg font-bold">WITA</span>
            </div>

            {/* Description */}
            <h3 className="text-xl font-bold leading-tight border-b-[3px] border-black pb-3 mb-3">
                {schedule.description || 'Untitled Schedule'}
            </h3>

            {/* Type Label */}
            <div className="mb-6 font-bold text-sm uppercase">
                TYPE: {getTypeLabel(schedule.type)}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
                <button 
                    onClick={() => handleTrigger(schedule.id)}
                    className="w-full bg-[#3b82f6] border-[2px] border-black rounded-full py-3 font-black text-white uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 text-sm"
                >
                    <Play size={20} strokeWidth={3} /> Test Run
                </button>
                
                <div className="flex gap-3">
                    <button 
                        onClick={() => handleOpenDialog(schedule)}
                        className="flex-1 bg-[#facc15] border-[2px] border-black rounded-full py-3 font-black text-black uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        <Edit2 size={18} strokeWidth={3} /> Edit
                    </button>
                    <button 
                        onClick={() => handleDelete(schedule.id)}
                        className="flex-1 bg-[#ff6b6b] border-[2px] border-black rounded-full py-3 font-black text-black uppercase shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        <Trash2 size={18} strokeWidth={3} /> Delete
                    </button>
                </div>
            </div>
        </div>
    );

    if (loading) {
        return isMobile ? <MobileSkeleton /> : (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        );
    }

    return (
        <Box>
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

            {/* Desktop view */}
            {!isMobile && (
                <Card>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Time</TableCell>
                                    <TableCell>Description</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {schedules.map((s) => (
                                    <TableRow key={s.id} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Box sx={{
                                                    p: 0.75,
                                                    borderRadius: 1.5,
                                                    bgcolor: 'primary.soft',
                                                    color: 'primary.main',
                                                    display: 'flex'
                                                }}>
                                                    <Clock size={16} />
                                                </Box>
                                                <Typography fontWeight={600}>{formatTime(s.time)}</Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>{s.description || '-'}</TableCell>
                                        <TableCell>
                                            <Chip label={getTypeLabel(s.type)} size="small" variant="outlined" />
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={s.enabled ? "Active" : "Disabled"} 
                                                color={s.enabled ? "success" : "default"} 
                                                size="small" 
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton size="small" onClick={() => handleTrigger(s.id)} title="Test Trigger">
                                                <Play size={16} />
                                            </IconButton>
                                            <IconButton size="small" onClick={() => handleOpenDialog(s)} color="primary">
                                                <Edit2 size={16} />
                                            </IconButton>
                                            <IconButton size="small" onClick={() => handleDelete(s.id)} color="error">
                                                <Trash2 size={16} />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Card>
            )}

            {/* Mobile view */}
            {isMobile && (
                <Box>
                    {schedules.map((s) => <MobileScheduleCard key={s.id} schedule={s} />)}
                </Box>
            )}

            {/* Brutalist Dialog */}
            <Dialog 
                open={openDialog} 
                onClose={() => setOpenDialog(false)}
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
                <div className="bg-white p-6 rounded-xl relative">
                    {/* Close Button */}
                    <button 
                        onClick={() => setOpenDialog(false)}
                        className="absolute -top-4 -right-4 bg-[#ff6b6b] text-black border-4 border-black p-2 rounded-full hover:rotate-90 transition-transform shadow-[4px_4px_0_#000]"
                    >
                        <X size={24} strokeWidth={3} />
                    </button>

                    <h2 className="text-2xl font-black uppercase mb-6 border-b-4 border-black pb-2">
                        {editingId ? 'Edit Schedule' : 'New Schedule'}
                    </h2>

                    <div className="space-y-4">
                        {/* Time Input */}
                        <div>
                            <label className="block font-bold text-sm uppercase mb-1">Time (WITA)</label>
                            <input
                                type="time"
                                className="w-full border-4 border-black p-3 font-bold text-lg focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow"
                                value={formData.time}
                                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                            />
                        </div>

                        {/* Description Input */}
                        <div>
                            <label className="block font-bold text-sm uppercase mb-1">Description</label>
                            <input
                                type="text"
                                className="w-full border-4 border-black p-3 font-bold focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="e.g. Morning Reminder"
                            />
                        </div>

                        {/* Type Select */}
                        <div>
                            <label className="block font-bold text-sm uppercase mb-1">Type</label>
                            <div className="relative">
                                <select
                                    className="w-full border-4 border-black p-3 font-bold bg-white focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow appearance-none"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                >
                                    <option value="group_hidetag">Group Broadcast (Hidetag)</option>
                                    <option value="group_hidetag_japri">Broadcast + Japri Unfinished</option>
                                    <option value="draft_push">Draft Push (Emergency)</option>
                                    <option value="emergency_submit">Auto Submit (Emergency)</option>
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">▼</div>
                            </div>
                        </div>

                        {/* Message Template Select */}
                        {(formData.type === 'group_hidetag' || formData.type === 'group_hidetag_japri') && (
                            <>
                                <div>
                                    <label className="block font-bold text-sm uppercase mb-1">Message Template</label>
                                    <div className="relative">
                                        <select
                                            className="w-full border-4 border-black p-3 font-bold bg-white focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow appearance-none"
                                            value={formData.messageKey}
                                            onChange={handleMessageKeyChange}
                                        >
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
                                        <textarea
                                            className="w-full border-4 border-black p-3 font-bold focus:outline-none focus:shadow-[4px_4px_0_#000] transition-shadow"
                                            rows="4"
                                            placeholder="Tulis pesan pengingat di sini..."
                                            value={formData.customContent}
                                            onChange={(e) => setFormData({ ...formData, customContent: e.target.value })}
                                        ></textarea>
                                        <p className="text-xs font-bold mt-1 text-gray-500">Pesan ini akan disimpan sebagai template baru.</p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Enable Switch */}
                        <div className="border-4 border-black p-4 bg-gray-50 flex items-center justify-between cursor-pointer">
                            <span className="font-bold uppercase">Enable Schedule</span>
                            <Switch 
                                checked={formData.enabled} 
                                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })} 
                                color="success" 
                            />
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            className="w-full bg-[#0df259] border-4 border-black py-4 font-black uppercase text-xl shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all mt-4 hover:bg-[#00d648] flex items-center justify-center gap-2"
                        >
                            <Save size={24} strokeWidth={3} />
                            Save Schedule
                        </button>
                    </div>
                </div>
            </Dialog>
        </Box>
    );
}