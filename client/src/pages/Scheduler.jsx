import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Clock, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Typography, CircularProgress, Chip, Card, CardHeader, CardContent, useMediaQuery, useTheme, Skeleton
} from '@mui/material';

export default function Scheduler() {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
            setLoading(false);
        }
    };

    const formatTime = (time) => time?.substring(0, 5) || '—';

    // Mobile skeleton
    const MobileSkeleton = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                    <CardContent sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Skeleton variant="circular" width={36} height={36} />
                            <Box>
                                <Skeleton width={60} height={24} />
                                <Skeleton width={100} height={16} sx={{ mt: 0.5 }} />
                            </Box>
                        </Box>
                        <Skeleton width={50} height={24} variant="rounded" />
                    </CardContent>
                </Card>
            ))}
        </Box>
    );

    // Mobile schedule card
    const MobileScheduleCard = ({ schedule }) => (
        <Card sx={{ mb: 1.5 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{
                            p: 1,
                            borderRadius: 2,
                            bgcolor: 'primary.soft',
                            color: 'primary.main',
                            display: 'flex'
                        }}>
                            <Clock size={20} />
                        </Box>
                        <Box>
                            <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.125rem' }}>
                                {formatTime(schedule.time)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {schedule.description || 'Scheduled reminder'}
                            </Typography>
                        </Box>
                    </Box>
                    <Chip label="Active" color="success" size="small" />
                </Box>
            </CardContent>
        </Card>
    );

    if (loading) {
        return isMobile ? <MobileSkeleton /> : (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        );
    }

    return (
        <Box>
            {/* Desktop view */}
            {!isMobile && (
                <Card>
                    <CardHeader
                        title="Active Schedules (WITA)"
                        subheader="Default time configurations"
                        avatar={<Calendar size={20} />}
                        sx={{ borderBottom: 1, borderColor: 'divider', py: 2 }}
                        titleTypographyProps={{ variant: 'h6', fontSize: '1rem' }}
                    />
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Time</TableCell>
                                    <TableCell>Description</TableCell>
                                    <TableCell align="right">Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {schedules.map((s, i) => (
                                    <TableRow key={i} hover>
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
                                        <TableCell>{s.description || 'Scheduled reminder'}</TableCell>
                                        <TableCell align="right">
                                            <Chip label="Active" color="success" size="small" />
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
                    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Calendar size={18} />
                        <Typography variant="subtitle2" color="text.secondary">
                            {schedules.length} Active Schedules (WITA)
                        </Typography>
                    </Box>
                    {schedules.map((s, i) => <MobileScheduleCard key={i} schedule={s} />)}
                </Box>
            )}
        </Box>
    );
}
