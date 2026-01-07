import { useEffect, useState, useMemo } from 'react';
import api from '../utils/api';
import { Edit2, Trash2, Save, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Button, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, FormControlLabel, Switch, Typography, CircularProgress, InputAdornment,
    MenuItem
} from '@mui/material';

export default function Groups() {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editGroup, setEditGroup] = useState(null);
    const [formData, setFormData] = useState({});
    const [searchQuery, setSearchQuery] = useState('');

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

    const [isOffline, setIsOffline] = useState(false);

    const loadGroups = async () => {
        try {
            // First check if bot is connected
            let activeGroups = [];
            try {
                const resActive = await api.get('/groups/active');
                activeGroups = resActive.data || [];
                setIsOffline(false);
            } catch (e) {
                // If 503 or failed, assume offline/waiting
                setIsOffline(true);
                activeGroups = [];
            }

            const resSettings = await api.get('/groups');
            const settings = resSettings.data || {};

            // Merge logic:
            // 1. Map active groups and attach settings if available
            const merged = activeGroups.map(g => ({
                ...g,
                ...(settings[g.id] || {}), // Overwrite with saved settings (name, etc)
                isRegistered: !!settings[g.id],
                originalName: g.name // Keep original name ref
            }));

            // 2. Add groups that are in settings but NOT in active (offline/kicked)
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

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Paper sx={{ width: '100%', overflow: 'hidden', mb: 3 }}>
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h6">Group Assignments ({filteredGroups.length})</Typography>
                    <TextField
                        size="small"
                        placeholder="Cari grup..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search size={18} />
                                    </InputAdornment>
                                ),
                            }
                        }}
                        sx={{ minWidth: 250 }}
                    />
                </Box>
                {isOffline && (
                    <Box sx={{ p: 2, bgcolor: 'warning.light', color: 'warning.dark' }}>
                        <Typography variant="body2" fontWeight={600}>
                            ⚠️ Bot Offline / Disconnected
                        </Typography>
                        <Typography variant="caption">
                            Only saved groups are shown. Connect the bot to see all WhatsApp groups.
                        </Typography>
                    </Box>
                )}

                <TableContainer>
                    <Table size="medium">
                        <TableHead>
                            <TableRow>
                                <TableCell>Group Name</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Zone</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredGroups.map((g) => (
                                <TableRow key={g.id} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="subtitle2" fontWeight={600}>
                                                {g.name || 'Unknown Group'}
                                            </Typography>
                                            {!g.isRegistered && (
                                                <Chip label="New" color="info" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                                            )}
                                            {g.isMissing && (
                                                <Chip label="Bot Left" color="error" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                                            )}
                                        </Box>
                                        <Typography variant="caption" color="text.secondary">{g.id}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        {g.isRegistered ? (
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <Chip
                                                    label={g.schedulerEnabled ? "Scheduler ON" : "Scheduler OFF"}
                                                    color={g.schedulerEnabled ? "success" : "default"}
                                                    size="small"
                                                />
                                                {g.isTesting && <Chip label="TESTING" color="warning" size="small" />}
                                            </Box>
                                        ) : (
                                            <Chip label="Not Configured" size="small" variant="outlined" />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {g.timezone === 'Asia/Jakarta' ? 'WIB' :
                                                g.timezone === 'Asia/Jayapura' ? 'WIT' : 'WITA'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {g.skipWeekends ? 'Skip Sat/Sun' : 'Every Day'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" onClick={() => setEditGroup(g)} sx={{ mr: 1 }} color={g.isRegistered ? "primary" : "default"}>
                                            {g.isRegistered ? <Edit2 size={16} /> : <Save size={16} />}
                                        </IconButton>
                                        {g.isRegistered && (
                                            <IconButton size="small" color="error" onClick={() => handleDelete(g.id)}>
                                                <Trash2 size={16} />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredGroups.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                                        <Typography color="text.secondary">
                                            {searchQuery ? 'Grup tidak ditemukan.' : 'No groups registered yet.'}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Dialog open={!!editGroup} onClose={() => setEditGroup(null)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Edit Group Settings
                    <IconButton onClick={() => setEditGroup(null)} size="small"><X size={20} /></IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="caption" color="text.secondary">GROUP ID</Typography>
                        <Paper variant="outlined" sx={{ p: 1, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {editGroup?.id}
                        </Paper>
                    </Box>

                    <TextField
                        fullWidth
                        label="Group Display Name"
                        value={formData.name || ''}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder={editGroup?.originalName}
                        sx={{ mb: 3 }}
                    />

                    <TextField
                        fullWidth
                        select
                        label="Timezone (Zona Waktu)"
                        value={formData.timezone || 'Asia/Makassar'}
                        onChange={(e) => handleChange('timezone', e.target.value)}
                        sx={{ mb: 3 }}
                    >
                        <MenuItem value="Asia/Jakarta">WIB (Asia/Jakarta)</MenuItem>
                        <MenuItem value="Asia/Makassar">WITA (Asia/Makassar)</MenuItem>
                        <MenuItem value="Asia/Jayapura">WIT (Asia/Jayapura)</MenuItem>
                    </TextField>

                    <Typography variant="subtitle2" gutterBottom>Automations</Typography>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={formData.schedulerEnabled}
                                    onChange={(e) => handleChange('schedulerEnabled', e.target.checked)}
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2" fontWeight={600}>Enable Scheduler</Typography>
                                    <Typography variant="caption" color="text.secondary">Send automated reminders</Typography>
                                </Box>
                            }
                            sx={{ width: '100%', mb: 1, ml: 0, alignItems: 'flex-start' }}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={formData.skipWeekends}
                                    onChange={(e) => handleChange('skipWeekends', e.target.checked)}
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2" fontWeight={600}>Skip Weekends</Typography>
                                    <Typography variant="caption" color="text.secondary">Don't send on Sat/Sun</Typography>
                                </Box>
                            }
                            sx={{ width: '100%', mb: 1, ml: 0, alignItems: 'flex-start' }}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={formData.isTesting}
                                    onChange={(e) => handleChange('isTesting', e.target.checked)}
                                    color="warning"
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2" fontWeight={600} color="warning.main">Testing Mode</Typography>
                                    <Typography variant="caption" color="text.secondary">Receive test messages from dashboard</Typography>
                                </Box>
                            }
                            sx={{ width: '100%', ml: 0, alignItems: 'flex-start' }}
                        />
                    </Paper>
                </DialogContent>
                <DialogActions sx={{ p: 2.5 }}>
                    <Button onClick={() => setEditGroup(null)} color="inherit">Cancel</Button>
                    <Button variant="contained" onClick={handleSave} startIcon={<Save size={18} />}>
                        Save Configuration
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

