import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, AlertCircle } from 'lucide-react';
import { Box, Card, CardContent, TextField, Button, Typography, Alert, Container, CircularProgress } from '@mui/material';

export default function Login() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const success = await login(password);
            if (success) {
                // Force full reload to ensure session cookies are correctly recognized by the browser
                // and to trigger a fresh checkAuth() call on mount
                window.location.href = '/dashboard/';
            } else {
                setError('Invalid password');
            }
        } catch (err) {
            setError('Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs" sx={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ p: 2, bgcolor: 'primary.main', borderRadius: 3, mb: 2, color: 'white' }}>
                    <LayoutGrid size={32} />
                </Box>
                <Typography component="h1" variant="h4" fontWeight="bold">
                    AbsenBot
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Dashboard Access
                </Typography>
            </Box>

            <Card elevation={3}>
                <CardContent sx={{ p: 3 }}>
                    <form onSubmit={handleSubmit}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 3 }} icon={<AlertCircle size={20} />}>
                                {error}
                            </Alert>
                        )}

                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="password"
                            label="Admin PIN"
                            type="password"
                            id="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading}
                            autoFocus
                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                            placeholder="Enter Dashboard PIN"
                            sx={{ mb: 3 }}
                        />

                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            size="large"
                            disabled={isLoading}
                            sx={{ py: 1.5 }}
                        >
                            {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Enter Dashboard'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </Container>
    );
}
