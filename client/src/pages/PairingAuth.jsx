import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, AlertCircle } from 'lucide-react'; // Loader2 removed (using CircularProgress)
import { Box, Card, CardContent, Typography, TextField, Button, Alert, CircularProgress, Container } from '@mui/material';

export default function PairingAuth() {
    const { token } = useParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('loading');
        try {
            const res = await axios.post('/auth/submit', { token, email, password });
            if (res.data.success) {
                setStatus('success');
                setMessage(res.data.message);
            } else {
                setStatus('error');
                setMessage(res.data.message);
            }
        } catch (e) {
            setStatus('error');
            setMessage('Connection failed');
        }
    };

    if (status === 'success') {
        return (
            <Container maxWidth="xs" sx={{ mt: 8 }}>
                <Card sx={{ textAlign: 'center', p: 2 }}>
                    <CardContent>
                        <Box sx={{
                            display: 'inline-flex', p: 2, borderRadius: '50%',
                            bgcolor: 'success.light', color: 'success.main', mb: 2
                        }}>
                            <CheckCircle size={32} />
                        </Box>
                        <Typography variant="h5" gutterBottom fontWeight="bold">Login Berhasil!</Typography>
                        <Typography color="text.secondary" paragraph>{message}</Typography>
                        <Typography variant="caption" color="text.disabled">Anda boleh menutup halaman ini.</Typography>
                    </CardContent>
                </Card>
            </Container>
        );
    }

    return (
        <Container maxWidth="xs" sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', py: 4 }}>
            <Card elevation={4}>
                <CardContent sx={{ p: 4 }}>
                    <Typography variant="h5" align="center" gutterBottom fontWeight={700} sx={{ mb: 3 }}>
                        Masuk SIAPkerja
                    </Typography>

                    {status === 'error' && (
                        <Alert severity="error" sx={{ mb: 3 }} icon={<AlertCircle size={20} />}>
                            {message}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Email / No. HP"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            placeholder="Email atau nomor handphone"
                            margin="normal"
                        />
                        <TextField
                            fullWidth
                            type="password"
                            label="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            placeholder="Password"
                            margin="normal"
                            sx={{ mb: 3 }}
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            size="large"
                            disabled={status === 'loading'}
                            sx={{ bgcolor: '#14b8a6', '&:hover': { bgcolor: '#0d9488' } }} // Teal color match
                        >
                            {status === 'loading' ? <CircularProgress size={24} color="inherit" /> : 'Masuk'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
            <Typography align="center" variant="caption" color="text.secondary" sx={{ mt: 4 }}>
                ©2025 Kemnaker RI
            </Typography>
        </Container>
    );
}
