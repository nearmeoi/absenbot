import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Trash2, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    IconButton, Typography, CircularProgress, Avatar, Chip
} from '@mui/material';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

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

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Paper sx={{ width: '100%', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6">Registered Users ({users.length})</Typography>
                </Box>
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
                                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                            <UserX size={32} />
                                            <Typography>No users found</Typography>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ) : users.map((user) => (
                                <TableRow key={user.phone} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Avatar>{user.email?.[0]?.toUpperCase()}</Avatar>
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
            </Paper>
        </Box>
    );
}
