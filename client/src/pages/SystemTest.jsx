import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    TextField,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress,
    Tabs,
    Tab,
    Stack,
    IconButton,
    Avatar,
    Divider,
    Chip
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SendIcon from '@mui/icons-material/Send';
import LinkIcon from '@mui/icons-material/Link';
import HistoryIcon from '@mui/icons-material/History';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import DeleteIcon from '@mui/icons-material/Delete';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BiotechIcon from '@mui/icons-material/Biotech';
import CheckCheck from '@mui/icons-material/DoneAll';

// WA DARK THEME (Matching Development.jsx / index.css)
const WA_BG = '#0b141a';
const WA_USER_BUBBLE = '#005c4b'; // Green
const WA_BOT_BUBBLE = '#202c33';  // Dark Gray
const WA_TEXT_MAIN = '#e9edef';
const WA_TEXT_SEC = '#8696a0';

// Helper to format text (Simple Markdown)
const formatMessage = (text) => {
    if (!text) return '';
    let html = text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\*([^*]+)\*/g, '<span class="wa-bold">$1</span>')
        .replace(/_([^_]+)_/g, '<span class="wa-italic">$1</span>')
        .replace(/~([^~]+)~/g, '<span class="wa-strike">$1</span>')
        .replace(/```([^`]+)```/g, '<span class="wa-code">$1</span>')
        .replace(/\n/g, '<br/>');
    return html;
};

const SystemTest = () => {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    // Chat State
    const [chatHistory, setChatHistory] = useState([{
        id: 1, sender: 'bot',
        text: 'Halo! Saya AbsenBot (Test Mode). Silakan jalankan perintah dari panel kiri.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    const bottomRef = useRef(null);

    // Manual Input State
    const [manualData, setManualData] = useState({
        aktivitas: 'Melakukan testing fitur dashboard',
        pembelajaran: 'Memahami flow sistem',
        kendala: 'Tidak ada kendala'
    });

    // AI Story Input State
    const [aiStory, setAiStory] = useState('Hari ini saya belajar React dan membuat komponen dashboard. Saya berhasil memahami konsep state dan props. Tidak ada kendala berarti.');

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await fetch('/dashboard/api/users');
                if (response.ok) {
                    const data = await response.json();
                    setUsers(data);
                }
            } catch (error) {
                console.error('Failed to fetch users:', error);
            }
        };
        fetchUsers();
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    const addToChat = (sender, text, isError = false) => {
        setChatHistory(prev => [...prev, {
            id: Date.now(),
            sender,
            text: typeof text === 'object' ? JSON.stringify(text, null, 2) : text,
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            isError
        }]);
    };

    const handleClearChat = () => setChatHistory([]);

    const executeTest = async (actionName, endpoint, payload = {}, displayText = null) => {
        if (!selectedUser) {
            alert("Pilih user target terlebih dahulu!");
            return;
        }

        // 1. Show User Message
        const userMsg = displayText || `/${actionName.toLowerCase()}`;
        addToChat('user', userMsg);
        setLoading(true);

        try {
            const targetUser = users.find(u => u.email === selectedUser);
            const fullPayload = {
                email: targetUser.email,
                password: targetUser.password,
                ...payload
            };

            const response = await fetch(`/dashboard${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullPayload)
            });

            const result = await response.json();

            // 2. Show Bot Response
            if (result.success) {
                let replyText = result.preview || result.message;

                if (!result.preview) {
                    if (endpoint.includes('riwayat')) {
                        replyText = `📂 *Riwayat Ditemukan*\n\nTotal Log: ${result.logs?.length || 0}\nLikely sent as JSON object.`;
                    } else if (endpoint.includes('check')) {
                        replyText = `🔍 *Status Harian*\n\nSudah Absen: ${result.sudahAbsen ? '✅ YA' : '❌ BELUM'}\nMsg: ${result.message}`;
                    } else if (endpoint.includes('simulation')) {
                        replyText = result.pesan_tambahan ?
                            `✅ *[SIMULASI SUKSES]*\n\n${result.pesan_tambahan}\n\nUser: ${result.nama}` :
                            JSON.stringify(result, null, 2);
                    }
                }
                addToChat('bot', replyText);
            } else {
                addToChat('bot', `❌ Error: ${result.message}`, true);
            }

        } catch (error) {
            addToChat('system', `Network Error: ${error.message}`, true);
        } finally {
            setLoading(false);
        }
    };

    const handleSimulate = () => {
        const text = `!absen manual\n\n- ${manualData.aktivitas}\n- ${manualData.pembelajaran}\n- ${manualData.kendala}`;
        executeTest('Simulasi Absen', '/api/test/simulation', {
            aktivitas: manualData.aktivitas,
            pembelajaran: manualData.pembelajaran,
            kendala: manualData.kendala,
            simulation: true
        }, text);
    };

    return (
        <Grid container spacing={0} sx={{ height: 'calc(100vh - 100px)', mt: -3, ml: -3, width: 'calc(100% + 48px)' }}>

            {/* LEFT PANEL */}
            <Grid item xs={12} md={5} sx={{ borderRight: '1px solid #334155', bgcolor: '#1e293b', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 2, bgcolor: '#0f172a', borderBottom: '1px solid #334155', color: 'white' }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BiotechIcon color="primary" /> System Test
                    </Typography>
                </Box>

                <Box sx={{ p: 2, overflow: 'auto', flex: 1, color: 'white' }}>
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel sx={{ color: '#94a3b8' }}>Target User</InputLabel>
                        <Select
                            value={selectedUser}
                            label="Target User"
                            onChange={(e) => setSelectedUser(e.target.value)}
                            sx={{ color: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' } }}
                        >
                            {users.map((u) => (
                                <MenuItem key={u.email} value={u.email}>
                                    {u.email} ({u.phone})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Paper variant="outlined" sx={{ mb: 2, bgcolor: 'transparent', borderColor: '#334155' }}>
                        <Tabs
                            value={activeTab}
                            onChange={(e, v) => setActiveTab(v)}
                            variant="fullWidth"
                            textColor="primary"
                            indicatorColor="primary"
                        >
                            <Tab label="Commands" sx={{ color: '#94a3b8' }} />
                            <Tab label="Form Absen" sx={{ color: '#94a3b8' }} />
                            <Tab label="AI Test" sx={{ color: '#94a3b8' }} />
                        </Tabs>
                    </Paper>

                    {activeTab === 0 && (
                        <Stack spacing={2}>
                            <Button
                                variant="contained"
                                color="success"
                                fullWidth
                                startIcon={<SendIcon />}
                                onClick={() => executeTest('!menu', '/api/test/send-menu', { simulation: true }, '!menu')}
                                disabled={loading}
                            >
                                Kirim "!menu" (Simulasi)
                            </Button>
                            <Button
                                variant="outlined"
                                fullWidth
                                startIcon={<LinkIcon />}
                                onClick={() => executeTest('!daftar', '/api/test/gen-link', { simulation: true }, '!daftar')}
                                disabled={loading}
                                sx={{ borderColor: '#334155', color: '#94a3b8' }}
                            >
                                Generate Link (!daftar)
                            </Button>
                            <Divider sx={{ borderColor: '#334155' }} />
                            <Button
                                variant="outlined"
                                color="info"
                                fullWidth
                                startIcon={<FactCheckIcon />}
                                onClick={() => executeTest('!cek', '/api/test/check', {}, '!cek')}
                                disabled={loading}
                            >
                                Cek Status (!cek)
                            </Button>
                            <Button
                                variant="outlined"
                                color="secondary"
                                fullWidth
                                startIcon={<HistoryIcon />}
                                onClick={() => executeTest('!riwayat', '/api/test/riwayat', {}, '!riwayat')}
                                disabled={loading}
                            >
                                Cek Riwayat (!riwayat)
                            </Button>
                        </Stack>
                    )}

                    {activeTab === 1 && (
                        <Stack spacing={2}>
                            <Alert severity="info" sx={{ bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa' }}>Mock Mode: No data sent to server.</Alert>
                            <TextField
                                label="Aktivitas" multiline rows={3} size="small"
                                value={manualData.aktivitas}
                                onChange={(e) => setManualData({ ...manualData, aktivitas: e.target.value })}
                                InputLabelProps={{ style: { color: '#94a3b8' } }}
                                InputProps={{ style: { color: 'white' } }}
                                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' } }}
                            />
                            <TextField
                                label="Pembelajaran" multiline rows={2} size="small"
                                value={manualData.pembelajaran}
                                onChange={(e) => setManualData({ ...manualData, pembelajaran: e.target.value })}
                                InputLabelProps={{ style: { color: '#94a3b8' } }}
                                InputProps={{ style: { color: 'white' } }}
                                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' } }}
                            />
                            <TextField
                                label="Kendala" size="small"
                                value={manualData.kendala}
                                onChange={(e) => setManualData({ ...manualData, kendala: e.target.value })}
                                InputLabelProps={{ style: { color: '#94a3b8' } }}
                                InputProps={{ style: { color: 'white' } }}
                                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' } }}
                            />
                            <Button
                                variant="contained" color="warning"
                                startIcon={<PlayArrowIcon />}
                                onClick={handleSimulate}
                                disabled={loading}
                            >
                                Kirim Laporan
                            </Button>
                        </Stack>
                    )}

                    {activeTab === 2 && (
                        <Stack spacing={2}>
                            <Alert severity="warning" sx={{ bgcolor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>🤖 This calls real Groq API!</Alert>
                            <TextField
                                label="Cerita Bebas (seperti !absen [cerita])"
                                multiline
                                rows={5}
                                size="small"
                                value={aiStory}
                                onChange={(e) => setAiStory(e.target.value)}
                                placeholder="Contoh: Hari ini saya belajar React dan membuat komponen..."
                                InputLabelProps={{ style: { color: '#94a3b8' } }}
                                InputProps={{ style: { color: 'white' } }}
                                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' } }}
                            />
                            <Button
                                variant="contained"
                                color="secondary"
                                startIcon={<SmartToyIcon />}
                                onClick={() => {
                                    addToChat('user', `!absen ${aiStory}`);
                                    setLoading(true);
                                    fetch('/dashboard/api/test/ai-parse', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ story: aiStory })
                                    })
                                        .then(res => res.json())
                                        .then(result => {
                                            addToChat('bot', result.preview || result.message);
                                        })
                                        .catch(err => addToChat('system', `Error: ${err.message}`, true))
                                        .finally(() => setLoading(false));
                                }}
                                disabled={loading || aiStory.length < 10}
                            >
                                Test AI Parser (Groq)
                            </Button>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                                AI akan mengubah cerita bebas menjadi format laporan (Aktivitas, Pembelajaran, Kendala).
                            </Typography>
                        </Stack>
                    )}
                </Box>
            </Grid>

            {/* RIGHT PANEL: DARK WA UI */}
            <Grid item xs={12} md={7} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                {/* Header */}
                <Box sx={{
                    p: 1.5, bgcolor: '#202c33', color: '#e9edef',
                    display: 'flex', alignItems: 'center', gap: 2,
                    boxShadow: 1
                }}>
                    <IconButton sx={{ color: '#aebac1' }} size="small"><ArrowBackIcon /></IconButton>
                    <Avatar sx={{ bgcolor: '#00a884' }}><SmartToyIcon /></Avatar>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                            AbsenBot (MagangHub)
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#8696a0' }}>
                            {loading ? 'typing...' : 'business account'}
                        </Typography>
                    </Box>
                    <IconButton sx={{ color: '#aebac1' }}><MoreVertIcon /></IconButton>
                </Box>

                {/* Chat Area */}
                <Box sx={{
                    flex: 1,
                    bgcolor: WA_BG,
                    backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                    backgroundBlendMode: 'soft-light',
                    p: 2,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5
                }}>
                    {chatHistory.map((msg, idx) => (
                        <Box
                            key={idx}
                            sx={{
                                alignSelf: msg.sender === 'user' ? 'flex-end' : (msg.sender === 'system' ? 'center' : 'flex-start'),
                                maxWidth: '75%',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            {msg.sender === 'system' ? (
                                <Chip label={msg.text} size="small" sx={{ color: '#ffd', bgcolor: 'rgba(0,0,0,0.3)', my: 1 }} />
                            ) : (
                                <Paper sx={{
                                    p: 1, px: 1.5,
                                    bgcolor: msg.sender === 'user' ? WA_USER_BUBBLE : WA_BOT_BUBBLE,
                                    borderRadius: 2,
                                    color: WA_TEXT_MAIN,
                                    position: 'relative',
                                    boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
                                    ...(msg.sender === 'user' ? { borderTopRightRadius: 0 } : { borderTopLeftRadius: 0 })
                                }}>
                                    <Typography
                                        variant="body1"
                                        sx={{ fontSize: '0.9rem', lineHeight: 1.4 }}
                                        dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
                                    />
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
                                            {msg.time}
                                        </Typography>
                                        {msg.sender === 'user' && <CheckCheck sx={{ fontSize: 14, color: '#53bdeb' }} />}
                                    </Box>

                                    {/* Bubble Tail Overlay (CSS Trick) */}
                                    <Box sx={{
                                        position: 'absolute', top: 0,
                                        [msg.sender === 'user' ? 'right' : 'left']: -8,
                                        width: 0, height: 0,
                                        borderStyle: 'solid',
                                        borderWidth: '8px 8px 8px 8px',
                                        borderColor: 'transparent',
                                        [msg.sender === 'user' ? 'borderTopColor' : 'borderTopColor']: msg.sender === 'user' ? WA_USER_BUBBLE : WA_BOT_BUBBLE,
                                        [msg.sender === 'user' ? 'borderLeftColor' : 'borderRightColor']: msg.sender === 'user' ? WA_USER_BUBBLE : WA_BOT_BUBBLE,
                                        transform: msg.sender === 'user' ? 'none' : 'scaleX(-1)', // Flip for left
                                        zIndex: 0
                                    }} />
                                </Paper>
                            )}
                        </Box>
                    ))}
                    <div ref={bottomRef} />
                </Box>

                {/* Footer */}
                <Box sx={{ p: 1.5, bgcolor: '#202c33', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton onClick={handleClearChat} sx={{ color: '#8696a0' }}>
                        <DeleteIcon />
                    </IconButton>
                    <Paper sx={{ flex: 1, p: 1, px: 2, borderRadius: 2, bgcolor: '#2a3942', color: '#d1d7db' }}>
                        <Typography sx={{ color: '#8696a0', fontSize: '0.9rem' }}>Type a message</Typography>
                    </Paper>
                    <IconButton sx={{ color: '#8696a0' }}>
                        <SendIcon />
                    </IconButton>
                </Box>
            </Grid>
        </Grid>
    );
};

export default SystemTest;
