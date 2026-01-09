import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Play, Square, Trash2, Terminal as TerminalIcon, AlertTriangle } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
    Box, Card, Button, Chip, useMediaQuery, useTheme,
    Dialog, DialogTitle, DialogContent, DialogActions, Typography
} from '@mui/material';

export default function TerminalPage() {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const [status, setStatus] = useState('offline');
    const [confirmDialog, setConfirmDialog] = useState(null);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        const term = new XTerm({
            theme: {
                background: '#0a0f1a',
                foreground: '#f8fafc',
                cursor: '#3b82f6',
                selectionBackground: '#3b82f640'
            },
            fontFamily: 'monospace',
            fontSize: isMobile ? 12 : 14,
            cursorBlink: true,
            convertEol: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Load log history
        api.get('/logs?limit=100').then(res => {
            if (res.data.logs) {
                res.data.logs.forEach(log => {
                    term.writeln(formatLog(log));
                });
            }
            term.writeln('\x1b[36m--- Connected to AbsenBot Terminal --- \x1b[0m');
        });

        // Load bot status
        api.get('/bot/status').then(res => {
            setStatus(res.data.status || 'offline');
        });

        const eventSource = new EventSource('/dashboard/api/logs/stream');

        eventSource.onmessage = (event) => {
            try {
                const log = JSON.parse(event.data);
                if (xtermRef.current) {
                    xtermRef.current.writeln(formatLog(log));
                }
            } catch (e) { }
        };

        const handleResize = () => {
            if (fitAddonRef.current) {
                fitAddonRef.current.fit();
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            eventSource.close();
            term.dispose();
            window.removeEventListener('resize', handleResize);
        };
    }, [isMobile]);

    const formatLog = (log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        let color = '\x1b[37m'; // White
        if (log.type === 'ERROR') color = '\x1b[31m'; // Red
        if (log.type === 'WARNING') color = '\x1b[33m'; // Yellow
        if (log.type === 'SUCCESS') color = '\x1b[32m'; // Green
        if (log.type === 'INFO') color = '\x1b[34m'; // Blue

        return `\x1b[90m[${time}]\x1b[0m ${color}[${log.type}]\x1b[0m ${log.message}`;
    };

    const toggleStatus = async (newStatus) => {
        try {
            await api.post('/bot/status', { status: newStatus });
            setStatus(newStatus);
            toast.success(`Bot status set to ${newStatus}`);
            setConfirmDialog(null);
        } catch (e) {
            toast.error('Failed to change status');
        }
    };

    const handleStopBot = () => {
        setConfirmDialog('stop');
    };

    const getStatusColor = () => {
        if (status === 'online') return 'success';
        if (status === 'maintenance') return 'warning';
        return 'error';
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: { xs: 'calc(100vh - 140px)', sm: 'calc(100vh - 100px)' },
            gap: { xs: 1.5, sm: 2 }
        }}>
            {/* Status Bar */}
            <Card sx={{ flexShrink: 0 }}>
                <Box sx={{
                    p: { xs: 1.5, sm: 2 },
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: { xs: 1.5, sm: 2 }
                }}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <TerminalIcon size={isMobile ? 18 : 20} />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                                Status:
                            </Typography>
                            <Chip
                                label={status.toUpperCase()}
                                color={getStatusColor()}
                                size="small"
                                sx={{ fontWeight: 600 }}
                            />
                        </Box>
                    </Box>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'auto auto auto' },
                        gap: 1
                    }}>
                        {status !== 'online' && (
                            <Button
                                variant="contained"
                                size="small"
                                onClick={() => toggleStatus('online')}
                                startIcon={<Play size={14} />}
                                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, py: { xs: 0.75, sm: 0.5 } }}
                            >
                                {isMobile ? 'Start' : 'Start Bot'}
                            </Button>
                        )}
                        {status !== 'maintenance' && (
                            <Button
                                variant="outlined"
                                color="warning"
                                size="small"
                                onClick={() => toggleStatus('maintenance')}
                                startIcon={<Square size={14} />}
                                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, py: { xs: 0.75, sm: 0.5 } }}
                            >
                                {isMobile ? 'Maint.' : 'Maintenance'}
                            </Button>
                        )}
                        {status !== 'offline' && (
                            <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                onClick={handleStopBot}
                                startIcon={<Trash2 size={14} />}
                                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, py: { xs: 0.75, sm: 0.5 } }}
                            >
                                {isMobile ? 'Stop' : 'Stop Bot'}
                            </Button>
                        )}
                    </Box>
                </Box>
            </Card>

            {/* Terminal */}
            <Card sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                bgcolor: '#0a0f1a',
                minHeight: { xs: 300, sm: 400 }
            }}>
                <Box
                    ref={terminalRef}
                    sx={{
                        flex: 1,
                        p: { xs: 1, sm: 2 },
                        overflow: 'hidden',
                        '& .xterm-viewport': { overflowY: 'auto !important' }
                    }}
                />
            </Card>

            {/* Confirmation Dialog */}
            <Dialog open={confirmDialog === 'stop'} onClose={() => setConfirmDialog(null)}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AlertTriangle size={20} color={theme.palette.error.main} />
                    Stop Bot?
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        This will stop the bot and disconnect it from WhatsApp.
                        Users won't be able to use any bot commands until you start it again.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button onClick={() => setConfirmDialog(null)} color="inherit">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => toggleStatus('offline')}
                        variant="contained"
                        color="error"
                    >
                        Stop Bot
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
