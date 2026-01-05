import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Play, Square, Trash2, Terminal as TerminalIcon } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Box, Card, CardHeader, CardContent, Button, Chip } from '@mui/material';

export default function TerminalPage() {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const [status, setStatus] = useState('offline');

    useEffect(() => {
        const term = new XTerm({
            theme: {
                background: '#1e293b',
                foreground: '#f8fafc',
                cursor: '#3b82f6',
                selectionBackground: '#3b82f640'
            },
            fontFamily: 'monospace',
            fontSize: 14,
            cursorBlink: true,
            convertEol: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;

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

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        return () => {
            eventSource.close();
            term.dispose();
            window.removeEventListener('resize', handleResize);
        };
    }, []);

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
        } catch (e) {
            toast.error('Failed to change status');
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', gap: 2 }}>
            <Card>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <TerminalIcon />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box component="span" sx={{ color: 'text.secondary' }}>Status:</Box>
                            <Chip
                                label={status.toUpperCase()}
                                color={status === 'online' ? 'success' : status === 'maintenance' ? 'warning' : 'error'}
                                size="small"
                            />
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        {status !== 'online' && (
                            <Button variant="contained" size="small" onClick={() => toggleStatus('online')} startIcon={<Play size={16} />}>
                                Start Bot
                            </Button>
                        )}
                        {status !== 'maintenance' && (
                            <Button variant="outlined" color="warning" size="small" onClick={() => toggleStatus('maintenance')} startIcon={<Square size={16} />}>
                                Maintenance
                            </Button>
                        )}
                        {status !== 'offline' && (
                            <Button variant="outlined" color="error" size="small" onClick={() => toggleStatus('offline')} startIcon={<Trash2 size={16} />}>
                                Stop Bot
                            </Button>
                        )}
                    </Box>
                </Box>
            </Card>

            <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#1e293b' }}>
                <Box ref={terminalRef} sx={{ flex: 1, p: 2, overflow: 'hidden', '& .xterm-viewport': { overflowY: 'auto !important' } }} />
            </Card>
        </Box>
    );
}
