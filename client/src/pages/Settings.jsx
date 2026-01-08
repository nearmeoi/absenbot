import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Plus, Trash2, Calendar, Info, MessageSquare, Save, Power, Settings as SettingsIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Card, CardHeader, CardContent, Typography, TextField, Button,
    List, ListItem, ListItemText, ListItemSecondaryAction, IconButton,
    Alert, Paper, MenuItem, Grid, Divider, FormControlLabel, Switch
} from '@mui/material';

export default function Settings() {
    // Bot Status State
    const [absenMaintenance, setAbsenMaintenance] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState(true);

    // Holiday State
    const [holidays, setHolidays] = useState([]);
    const [loadingHolidays, setLoadingHolidays] = useState(true);
    const [newDate, setNewDate] = useState('');

    // Message State
    const [messages, setMessages] = useState({});
    const [selectedKey, setSelectedKey] = useState('evening_reminder');
    const [editContent, setEditContent] = useState('');
    const [loadingMessages, setLoadingMessages] = useState(true);

    useEffect(() => {
        loadStatus();
        loadHolidays();
        loadMessages();
    }, []);

    // --- Status Logic ---
    const loadStatus = async () => {
        try {
            const res = await api.get('/bot/status');
            setAbsenMaintenance(res.data.absenMaintenance || false);
            setLoadingStatus(false);
        } catch (e) {
            toast.error('Failed to load bot status');
        }
    };

    const toggleAbsenMaintenance = async (e) => {
        const newValue = e.target.checked;
        try {
            await api.post('/bot/absen-maintenance', { enabled: newValue });
            setAbsenMaintenance(newValue);
            toast.success(`Maintenance Mode ${newValue ? 'ENABLED' : 'DISABLED'}`);
        } catch (e) {
            toast.error('Failed to update maintenance mode');
            // Revert on error
            setAbsenMaintenance(!newValue);
        }
    };

    // --- Holiday Logic ---
    const loadHolidays = async () => {
        try {
            const res = await api.get('/holidays');
            setHolidays(res.data || []);
            setLoadingHolidays(false);
        } catch (e) {
            toast.error('Failed to load holidays');
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

    // --- Message Logic ---
    const loadMessages = async () => {
        try {
            const res = await api.get('/messages');
            setMessages(res.data || {});
            if (res.data && res.data['evening_reminder']) {
                setEditContent(res.data['evening_reminder']);
            }
            setLoadingMessages(false);
        } catch (e) {
            toast.error('Failed to load messages');
        }
    };

    const handleKeyChange = (e) => {
        const key = e.target.value;
        setSelectedKey(key);
        setEditContent(messages[key] || '');
    };

    const saveMessage = async () => {
        try {
            await api.post('/messages', {
                key: selectedKey,
                content: editContent
            });
            
            setMessages(prev => ({
                ...prev,
                [selectedKey]: editContent
            }));
            
            toast.success('Message template updated');
        } catch (e) {
            toast.error('Failed to update message');
        }
    };

    const messageKeys = [
        { key: 'evening_reminder', label: 'Evening Reminder (23:00)' },
        { key: 'morning_reminder', label: 'Morning Reminder (08:00)' },
        { key: 'afternoon_reminder', label: 'Afternoon Reminder (16:00)' },
        { key: 'menu', label: 'Main Menu (!menu)' },
        { key: 'help', label: 'Help Message (!help)' },
        { key: 'absen_maintenance_message', label: 'Absen Maintenance Message' },
        { key: 'maintenance_message', label: 'Global Maintenance Message' },
        { key: 'registration_link_private', label: 'Registration Link' },
        { key: 'submit_success', label: 'Submit Success' },
        { key: 'submit_failed', label: 'Submit Failed' },
        { key: 'holiday_message', label: 'Holiday Message' }
    ];

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            
            {/* BOT CONTROLS SECTION */}
            <Card>
                <CardHeader
                    title="Bot Controls"
                    subheader="Manage system availability"
                    avatar={<SettingsIcon size={24} />}
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                />
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                            <Typography variant="subtitle1" fontWeight="bold">Maintenance Mode (!absen only)</Typography>
                            <Typography variant="body2" color="text.secondary">
                                If enabled, users trying to use <code>!absen</code> will receive a maintenance message.
                                <br/>Other features like <code>!riwayat</code> and <code>!cek</code> will still work.
                            </Typography>
                        </Box>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={absenMaintenance}
                                    onChange={toggleAbsenMaintenance}
                                    color="error"
                                    disabled={loadingStatus}
                                />
                            }
                            label={absenMaintenance ? "Active" : "Inactive"}
                        />
                    </Box>
                </CardContent>
            </Card>

            {/* HOLIDAYS SECTION */}
            <Card>
                <CardHeader
                    title="Custom Holidays"
                    subheader="Manage dates when the scheduler should be paused"
                    avatar={<Calendar size={24} />}
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                />
                <CardContent>
                    <Alert severity="info" sx={{ mb: 3 }} icon={<Info size={20} />}>
                        Add dates when the scheduler should NOT send reminders (e.g. public holidays, company events).
                    </Alert>

                    <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
                        <TextField
                            fullWidth
                            type="date"
                            label="Select Date"
                            InputLabelProps={{ shrink: true }}
                            value={newDate}
                            onChange={(e) => setNewDate(e.target.value)}
                        />
                        <Button
                            variant="contained"
                            onClick={addHoliday}
                            startIcon={<Plus size={18} />}
                            sx={{ px: 3 }}
                        >
                            Add
                        </Button>
                    </Box>

                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Registered Holidays</Typography>
                    <Paper variant="outlined">
                        <List disablePadding>
                            {loadingHolidays ? <ListItem><ListItemText primary="Loading..." /></ListItem> :
                                holidays.length === 0 ? (
                                    <ListItem>
                                        <ListItemText
                                            primary={<Typography color="text.secondary" fontStyle="italic">No custom holidays set.</Typography>}
                                        />
                                    </ListItem>
                                ) : holidays.map((date, i) => (
                                    <ListItem key={i} divider={i !== holidays.length - 1}>
                                        <ListItemText
                                            primary={new Date(date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                            secondary={date}
                                        />
                                        <ListItemSecondaryAction>
                                            <IconButton edge="end" color="error" onClick={() => deleteHoliday(date)}>
                                                <Trash2 size={18} />
                                            </IconButton>
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                ))}
                        </List>
                    </Paper>
                </CardContent>
            </Card>

            {/* MESSAGES SECTION */}
            <Card>
                <CardHeader
                    title="Message Templates"
                    subheader="Customize bot responses and automated reminders"
                    avatar={<MessageSquare size={24} />}
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                />
                <CardContent>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={4}>
                            <TextField
                                select
                                fullWidth
                                label="Select Template"
                                value={selectedKey}
                                onChange={handleKeyChange}
                                disabled={loadingMessages}
                            >
                                {messageKeys.map((option) => (
                                    <MenuItem key={option.key} value={option.key}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                            
                            <Box sx={{ mt: 2 }}>
                                <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
                                    <b>Tip:</b> You can use formatting like *bold*, _italic_, and emojis.
                                </Alert>
                            </Box>
                        </Grid>
                        
                        <Grid item xs={12} md={8}>
                            <TextField
                                fullWidth
                                multiline
                                minRows={8}
                                maxRows={15}
                                label="Message Content"
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                disabled={loadingMessages}
                                sx={{ fontFamily: 'monospace' }}
                            />
                            
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                                <Button
                                    variant="contained"
                                    startIcon={<Save size={18} />}
                                    onClick={saveMessage}
                                    disabled={loadingMessages || !editContent}
                                >
                                    Save Changes
                                </Button>
                            </Box>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

        </Box>
    );
}
