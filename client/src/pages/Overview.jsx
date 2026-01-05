import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Users, CheckCircle, XCircle, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Grid, Card, CardContent, Typography, Button, Box, CircularProgress, useTheme } from '@mui/material';

export default function Overview() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const theme = useTheme();

    useEffect(() => {
        const loadStats = async () => {
            try {
                const res = await api.get('/stats');
                setStats(res.data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadStats();
        const interval = setInterval(loadStats, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    if (!stats) return <Typography color="error">Error loading stats</Typography>;

    const StatCard = ({ label, value, icon: Icon, color, subtext }) => (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography color="text.secondary" gutterBottom variant="body2" fontWeight={500}>
                            {label}
                        </Typography>
                        <Typography variant="h4" component="div" fontWeight={700}>
                            {value}
                        </Typography>
                    </Box>
                    <Box sx={{
                        p: 1,
                        borderRadius: 2,
                        bgcolor: `${color}.main`,
                        color: 'white',
                        display: 'flex',
                        opacity: 0.9
                    }}>
                        <Icon size={24} />
                    </Box>
                </Box>
                {subtext && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        {subtext}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );

    return (
        <Box>
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard label="Total Users" value={stats.totalUsers} icon={Users} color="primary" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard label="Today's Reports" value={stats.totalAbsen} icon={CheckCircle} color="success"
                        subtext={`${((stats.totalAbsen / (stats.totalUsers || 1)) * 100).toFixed(0)}% participation`} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard label="Missing Reports" value={(stats.totalUsers - stats.totalAbsen)} icon={XCircle} color="error" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard label="Groups" value={stats.totalGroups} icon={LayoutGrid} color="warning" />
                </Grid>
            </Grid>

            <Card>
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6">Quick Actions</Typography>
                </Box>
                <CardContent>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Button variant="outlined" startIcon={<LayoutGrid size={18} />} onClick={() => navigate('/development')}>
                            Manage Messages
                        </Button>
                        <Button variant="outlined" startIcon={<Users size={18} />} onClick={() => navigate('/users')}>
                            View Users
                        </Button>
                        <Button variant="outlined" startIcon={<CheckCircle size={18} />} onClick={() => navigate('/scheduler')}>
                            Configure Scheduler
                        </Button>
                    </Box>
                </CardContent>
            </Card>
        </Box>
    );
}
