import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Plus, Trash2, Calendar, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Card, CardHeader, CardContent, Typography, TextField, Button,
    List, ListItem, ListItemText, ListItemSecondaryAction, IconButton,
    Alert, InputAdornment, Paper
} from '@mui/material';

export default function Settings() {
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newDate, setNewDate] = useState('');

    useEffect(() => {
        loadHolidays();
    }, []);

    const loadHolidays = async () => {
        try {
            const res = await api.get('/holidays');
            setHolidays(res.data || []);
            setLoading(false);
        } catch (e) {
            toast.error('Failed to load holidays');
        }
    };

    const addHoliday = async () => {
        if (!newDate) return;
        try {
            const res = await api.post('/holidays', { date: newDate });
            setHolidays(res.data);
            setNewDate('');
            toast.success('Holiday added');
        } catch (e) {
            toast.error('Failed to add holiday');
        }
    };

    const deleteHoliday = async (date) => {
        try {
            const res = await api.delete(`/holidays/${date}`);
            setHolidays(res.data);
            toast.success('Holiday removed');
        } catch (e) {
            toast.error('Failed to delete holiday');
        }
    };

    return (
        <Box sx={{ maxWidth: 600, mx: 'auto' }}>
            <Card>
                <CardHeader
                    title="Custom Holidays"
                    subheader="Manage dates when the scheduler should paused"
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
                            {loading ? <ListItem><ListItemText primary="Loading..." /></ListItem> :
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
        </Box>
    );
}
