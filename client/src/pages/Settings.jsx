import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Plus, Trash2, Calendar, Info, MessageSquare, Save, Settings as SettingsIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Card, CardHeader, CardContent, Typography, TextField, Button,
    List, ListItem, ListItemText, IconButton, Alert, Paper, MenuItem,
    FormControlLabel, Switch, useMediaQuery, useTheme, Skeleton, Collapse,
    Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { ChevronDown } from 'lucide-react';

export default function Settings() {
    const [absenMaintenance, setAbsenMaintenance] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [holidays, setHolidays] = useState([]);
    const [loadingHolidays, setLoadingHolidays] = useState(true);
    const [newDate, setNewDate] = useState('');
    const [messages, setMessages] = useState({});
    const [selectedKey, setSelectedKey] = useState('evening_reminder');
    const [editContent, setEditContent] = useState('');
    const [loadingMessages, setLoadingMessages] = useState(true);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        loadStatus();
        loadHolidays();
        loadMessages();
    }, []);

    const loadStatus = async () => {
        try {
            const res = await api.get('/bot/status');
            setAbsenMaintenance(res.data.absenMaintenance || false);
            setLoadingStatus(false);
        } catch (e) {
            toast.error('Failed to load bot status');
            setLoadingStatus(false);
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
            setAbsenMaintenance(!newValue);
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
            setLoadingMessages(false);
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
            setMessages(prev => ({ ...prev, [selectedKey]: editContent }));
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

    // Loading skeleton
    const LoadingSkeleton = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Card><CardContent><Skeleton height={60} /></CardContent></Card>
            <Card><CardContent><Skeleton height={120} /></CardContent></Card>
            <Card><CardContent><Skeleton height={200} /></CardContent></Card>
        </Box>
    );

    const isLoading = loadingStatus && loadingHolidays && loadingMessages;
    if (isLoading) return <LoadingSkeleton />;

    // Common section wrapper
    const SettingsSection = ({ title, subtitle, icon: Icon, children, defaultExpanded = true }) => (
        <Accordion
            defaultExpanded={defaultExpanded}
            sx={{
                bgcolor: 'background.paper',
                '&:before': { display: 'none' },
                borderRadius: '12px !important',
                border: 1,
                borderColor: 'divider',
                mb: { xs: 1.5, sm: 2 },
                overflow: 'hidden'
            }}
        >
            <AccordionSummary
                expandIcon={<ChevronDown size={20} />}
                sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    minHeight: { xs: 56, sm: 64 },
                    '& .MuiAccordionSummary-content': { my: 1.5 }
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Icon size={isMobile ? 18 : 20} />
                    <Box>
                        <Typography variant="h6" sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' } }}>
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: { xs: 2, sm: 3 } }}>
                {children}
            </AccordionDetails>
        </Accordion>
    );

    return (
        <Box>
            {/* BOT CONTROLS SECTION */}
            <SettingsSection title="Bot Controls" subtitle="Manage system availability" icon={SettingsIcon}>
                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: 2
                }}>
                    <Box>
                        <Typography variant="subtitle2" fontWeight={600}>
                            Maintenance Mode (!absen only)
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Users will receive a maintenance message when using <code>!absen</code>.
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
                        sx={{ m: 0 }}
                    />
                </Box>
            </SettingsSection>

            {/* HOLIDAYS SECTION */}
            <SettingsSection title="Custom Holidays" subtitle="Pause scheduler on specific dates" icon={Calendar}>
                <Alert severity="info" sx={{ mb: 2, py: 1 }} icon={<Info size={18} />}>
                    <Typography variant="caption">
                        Add dates when the scheduler should NOT send reminders.
                    </Typography>
                </Alert>

                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: { xs: 1, sm: 2 },
                    mb: 3
                }}>
                    <TextField
                        fullWidth
                        type="date"
                        label="Select Date"
                        InputLabelProps={{ shrink: true }}
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        size={isMobile ? 'small' : 'medium'}
                    />
                    <Button
                        variant="contained"
                        onClick={addHoliday}
                        startIcon={<Plus size={16} />}
                        sx={{ minWidth: { xs: '100%', sm: 100 } }}
                    >
                        Add
                    </Button>
                </Box>

                <Typography variant="subtitle2" sx={{ mb: 1 }}>Registered Holidays</Typography>
                <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
                    <List disablePadding dense>
                        {loadingHolidays ? (
                            <ListItem><ListItemText primary="Loading..." /></ListItem>
                        ) : holidays.length === 0 ? (
                            <ListItem>
                                <ListItemText
                                    primary={
                                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                            No custom holidays set.
                                        </Typography>
                                    }
                                />
                            </ListItem>
                        ) : holidays.map((date, i) => (
                            <ListItem
                                key={i}
                                divider={i !== holidays.length - 1}
                                secondaryAction={
                                    <IconButton edge="end" color="error" onClick={() => deleteHoliday(date)} size="small">
                                        <Trash2 size={16} />
                                    </IconButton>
                                }
                            >
                                <ListItemText
                                    primary={new Date(date).toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                    secondary={date}
                                    primaryTypographyProps={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}
                                />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            </SettingsSection>

            {/* MESSAGES SECTION */}
            <SettingsSection title="Message Templates" subtitle="Customize bot responses" icon={MessageSquare}>
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' },
                    gap: { xs: 2, sm: 3 }
                }}>
                    <Box>
                        <TextField
                            select
                            fullWidth
                            label="Select Template"
                            value={selectedKey}
                            onChange={handleKeyChange}
                            disabled={loadingMessages}
                            size={isMobile ? 'small' : 'medium'}
                        >
                            {messageKeys.map((option) => (
                                <MenuItem key={option.key} value={option.key}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </TextField>

                        <Alert severity="info" sx={{ mt: 2, py: 1 }}>
                            <Typography variant="caption">
                                <b>Tip:</b> Use *bold*, _italic_, and emojis.
                            </Typography>
                        </Alert>
                    </Box>

                    <Box>
                        <TextField
                            fullWidth
                            multiline
                            minRows={isMobile ? 4 : 6}
                            maxRows={12}
                            label="Message Content"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            disabled={loadingMessages}
                            InputProps={{
                                sx: { fontFamily: 'monospace', fontSize: { xs: '0.8125rem', sm: '0.875rem' } }
                            }}
                        />

                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                            <Button
                                variant="contained"
                                startIcon={<Save size={16} />}
                                onClick={saveMessage}
                                disabled={loadingMessages || !editContent}
                                fullWidth={isMobile}
                            >
                                Save Changes
                            </Button>
                        </Box>
                    </Box>
                </Box>
            </SettingsSection>
        </Box>
    );
}
