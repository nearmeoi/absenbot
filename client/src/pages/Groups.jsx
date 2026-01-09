import { useEffect, useState, useMemo } from 'react';
import api from '../utils/api';
import { Edit2, Trash2, Save, X, Search, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Button, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, FormControlLabel, Switch, Typography, CircularProgress, InputAdornment,
    MenuItem, Card, CardContent, useMediaQuery, useTheme, Skeleton, Alert
} from '@mui/material';

export default function Groups() {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editGroup, setEditGroup] = useState(null);
    const [formData, setFormData] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [isOffline, setIsOffline] = useState(false);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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

    // Loading skeleton for mobile
    const MobileSkeleton = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map(i => (
                <Card key={i}>
                    <CardContent sx={{ p: 2 }}>
                        <Skeleton width="60%" height={20} />
                        <Skeleton width="100%" height={16} sx={{ mt: 1 }} />
                        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                            <Skeleton width={80} height={24} />
                            <Skeleton width={60} height={24} />
                        </Box>
                    </CardContent>
                </Card>
            ))}
        </Box>
    );

    // Mobile card view
    const MobileGroupCard = ({ group }) => (
        <Card sx={{ mb: 1.5 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="subtitle2" fontWeight={600} noWrap sx={{ maxWidth: '70%' }}>
                                {group.name || 'Unknown Group'}
                            </Typography>
                            {!group.isRegistered && (
                                <Chip label="New" color="info" size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
                            )}
                            {group.isMissing && (
                                <Chip label="Bot Left" color="error" size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
                            )}
                        </Box>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.5 }}>
                            {group.id}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                            size="small"
                            onClick={() => setEditGroup(group)}
                            color={group.isRegistered ? "primary" : "default"}
                        >
                            {group.isRegistered ? <Edit2 size={16} /> : <Save size={16} />}
                        </IconButton>
                        {group.isRegistered && (
                            <IconButton size="small" color="error" onClick={() => handleDelete(group.id)}>
                                <Trash2 size={16} />
                            </IconButton>
                        )}
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    {group.isRegistered ? (
                        <>
                            <Chip
                                label={group.schedulerEnabled ? "Scheduler ON" : "Scheduler OFF"}
                                color={group.schedulerEnabled ? "success" : "default"}
                                size="small"
                                sx={{ height: 22 }}
                            />
                            {group.isTesting && <Chip label="TESTING" color="warning" size="small" sx={{ height: 22 }} />}
                        </>
                    ) : (
                        <Chip label="Not Configured" size="small" variant="outlined" sx={{ height: 22 }} />
                    )}
                    <Chip
                        label={`${getTimezoneLabel(group.timezone)} • ${group.skipWeekends ? 'Skip Sat/Sun' : 'Every Day'}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.6875rem' }}
                    />
                </Box>
            </CardContent>
        </Card>
    );

    // Empty state component
    const EmptyState = () => (
        <Box sx={{ textAlign: 'center', py: { xs: 4, sm: 6 }, color: 'text.secondary' }}>
            <Layers size={48} strokeWidth={1.5} />
            <Typography variant="h6" sx={{ mt: 2 }}>
                {searchQuery ? 'No Groups Found' : 'No Groups Registered'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
                {searchQuery ? 'Try a different search term.' : 'Groups will appear here once the bot joins a WhatsApp group.'}
            </Typography>
        </Box>
    );

    if (loading) {
        return isMobile ? <MobileSkeleton /> : (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        );
    }

    return (
        <Box>
            {/* Header with Search */}
            <Paper sx={{ mb: { xs: 1.5, sm: 2 }, overflow: 'hidden' }}>
                <Box sx={{
                    p: { xs: 1.5, sm: 2 },
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: { xs: 1.5, sm: 2 }
                }}>
                    <Typography variant="h6" sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' } }}>
                        Group Assignments ({filteredGroups.length})
                    </Typography>
                    <TextField
                        size="small"
                        placeholder="Search groups..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search size={16} />
                                    </InputAdornment>
                                ),
                            }
                        }}
                        sx={{
                            minWidth: { sm: 220 },
                            '& .MuiInputBase-root': { fontSize: '0.875rem' }
                        }}
                    />
                </Box>

                {isOffline && (
                    <Alert severity="warning" sx={{ borderRadius: 0 }}>
                        <Typography variant="body2" fontWeight={600}>Bot Offline / Disconnected</Typography>
                        <Typography variant="caption">Only saved groups are shown.</Typography>
                    </Alert>
                )}

                {/* Desktop Table View */}
                {!isMobile && (
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
                                            <Typography variant="body2">{getTimezoneLabel(g.timezone)}</Typography>
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
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Mobile Card View */}
            {isMobile && (
                <Box>
                    {filteredGroups.length === 0 ? (
                        <EmptyState />
                    ) : (
                        filteredGroups.map((g) => <MobileGroupCard key={g.id} group={g} />)
                    )}
                </Box>
            )}

            {/* Desktop Empty State */}
            {!isMobile && filteredGroups.length === 0 && <EmptyState />}

            {/* Edit Dialog - Full screen on mobile */}
            <Dialog
                open={!!editGroup}
                onClose={() => setEditGroup(null)}
                maxWidth="sm"
                fullWidth
                fullScreen={isMobile}
            >
                <DialogTitle sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: { xs: 1.5, sm: 2 }
                }}>
                    <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.125rem' } }}>
                        Edit Group Settings
                    </Typography>
                    <IconButton onClick={() => setEditGroup(null)} size="small"><X size={20} /></IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="caption" color="text.secondary">GROUP ID</Typography>
                        <Paper variant="outlined" sx={{ p: 1, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
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
                            sx={{ width: '100%', mb: 1.5, ml: 0, alignItems: 'flex-start' }}
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
                            sx={{ width: '100%', mb: 1.5, ml: 0, alignItems: 'flex-start' }}
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
                <DialogActions sx={{ p: { xs: 2, sm: 2.5 }, gap: 1 }}>
                    <Button onClick={() => setEditGroup(null)} color="inherit" fullWidth={isMobile}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={handleSave} startIcon={<Save size={18} />} fullWidth={isMobile}>
                        Save
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
