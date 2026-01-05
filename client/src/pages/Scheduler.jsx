import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Typography, CircularProgress, Chip, Card, CardHeader, CardContent
} from '@mui/material';

export default function Scheduler() {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadScheduler();
    }, []);

    const loadScheduler = async () => {
        try {
            const res = await api.get('/scheduler');
            setSchedules(res.data.schedules || []);
            setLoading(false);
        } catch (e) {
            toast.error('Failed to load scheduler');
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

    const formatTime = (time) => {
        return time.substring(0, 5); // HH:MM
    };

    return (
        <Card>
            <CardHeader title="Active Schedules (WITA)" subheader="Default time configurations" />
            <CardContent sx={{ p: 0 }}>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Time</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {schedules.map((s, i) => (
                                <TableRow key={i} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Clock size={16} color="var(--text-secondary)" />
                                            <Typography fontWeight="bold">{formatTime(s.time)}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>{s.description}</TableCell>
                                    <TableCell>
                                        <Chip label="Active" color="success" size="small" />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </CardContent>
        </Card>
    );
}
