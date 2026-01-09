import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Trash2, UserX, Users as UsersIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    IconButton, Typography, CircularProgress, Avatar, Chip, Card, CardContent,
    useMediaQuery, useTheme, Skeleton
} from '@mui/material';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
            setLoading(false);
        } catch (e) {
            toast.error('Failed to load users');
            setLoading(false);
        }
    };

    const handleDelete = async (phone) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await api.post('/users/delete', { phone });
            setUsers(users.filter(u => u.phone !== phone));
            toast.success('User deleted');
        } catch (e) {
            toast.error('Failed to delete user');
        }
    };

    const formatName = (email) => {
        try {
            return email.split('@')[0]
                .replace(/[._]/g, ' ')
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        } catch { return email; }
    };

    // Loading skeleton for mobile
    const MobileSkeleton = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map(i => (
                <Card key={i}>
                    <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Skeleton variant="circular" width={40} height={40} />
                        <Box sx={{ flex: 1 }}>
                            <Skeleton width="60%" height={20} />
                            <Skeleton width="80%" height={16} sx={{ mt: 0.5 }} />
                        </Box>
                    </CardContent>
                </Card>
            ))}
        </Box>
    );

    // Mobile user card
    const MobileUserCard = ({ user }) => (
        <Card sx={{ mb: 1.5 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.soft', color: 'primary.main', fontSize: '1rem' }}>
                        {user.email?.[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={600} noWrap>
                            {formatName(user.email)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                            {user.email}
                        </Typography>
                        <Chip
                            label={user.phone.split('@')[0]}
                            size="small"
                            variant="outlined"
                            sx={{ mt: 0.5, height: 20, fontSize: '0.6875rem' }}
                        />
                    </Box>
                    <IconButton color="error" size="small" onClick={() => handleDelete(user.phone)}>
                        <Trash2 size={18} />
                    </IconButton>
                </Box>
            </CardContent>
        </Card>
    );

    // Empty state
    const EmptyState = () => (
        <Box sx={{ textAlign: 'center', py: { xs: 4, sm: 6 }, color: 'text.secondary' }}>
            <UserX size={48} strokeWidth={1.5} />
            <Typography variant="h6" sx={{ mt: 2 }}>No Users Found</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
                Users will appear here once they register via WhatsApp.
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
            {/* Header */}
            <Paper sx={{ mb: { xs: 1.5, sm: 0 }, overflow: 'hidden' }}>
                <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: !isMobile ? 1 : 0, borderColor: 'divider' }}>
                    <Typography variant="h6" sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' } }}>
                        Registered Users ({users.length})
                    </Typography>
                </Box>

                {/* Desktop Table View */}
                {!isMobile && (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Phone (WA)</TableCell>
                                    <TableCell>Email</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4}>
                                            <EmptyState />
                                        </TableCell>
                                    </TableRow>
                                ) : users.map((user) => (
                                    <TableRow key={user.phone} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                <Avatar sx={{ bgcolor: 'primary.soft', color: 'primary.main' }}>
                                                    {user.email?.[0]?.toUpperCase()}
                                                </Avatar>
                                                <Typography variant="subtitle2" fontWeight={600}>
                                                    {formatName(user.email)}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={user.phone.split('@')[0]} size="small" variant="outlined" />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">{user.email}</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton color="error" size="small" onClick={() => handleDelete(user.phone)}>
                                                <Trash2 size={16} />
                                            </IconButton>
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
                    {users.length === 0 ? (
                        <EmptyState />
                    ) : (
                        users.map((user) => <MobileUserCard key={user.phone} user={user} />)
                    )}
                </Box>
            )}
        </Box>
    );
}
