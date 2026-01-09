import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Save, Sun, Moon, RefreshCw, CheckCheck, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    Box, Card, CardHeader, CardContent, TextField, Select, MenuItem,
    InputLabel, FormControl, Button, Typography, Chip, ListSubheader,
    useMediaQuery, useTheme, Skeleton
} from '@mui/material';

export default function Development() {
    const [messages, setMessages] = useState({});
    const [selectedKey, setSelectedKey] = useState('morning_reminder');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    useEffect(() => {
        loadMessages();
    }, []);

    const loadMessages = async () => {
        try {
            const res = await api.get('/messages');
            setMessages(res.data);
            if (res.data['morning_reminder']) {
                setContent(res.data['morning_reminder']);
            }
            setLoading(false);
        } catch (e) {
            toast.error('Failed to load messages');
            setLoading(false);
        }
    };

    const handleSelectChange = (e) => {
        const key = e.target.value;
        setSelectedKey(key);
        setContent(messages[key] || '');
    };

    const handleSave = async () => {
        try {
            await api.post('/messages', { key: selectedKey, content });
            setMessages({ ...messages, [selectedKey]: content });
            toast.success('Message updated!');
        } catch (e) {
            toast.error('Failed to save message');
        }
    };

    const triggerTest = async (type) => {
        try {
            await api.post('/test/trigger', { type });
            toast.success(`Test ${type} triggered!`);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Test failed');
        }
    };

    // Helper to format WA markdown to HTML
    const formatPreview = (text) => {
        if (!text) return '';
        let html = text
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/\*([^*]+)\*/g, '<span class="wa-bold">$1</span>')
            .replace(/_([^_]+)_/g, '<span class="wa-italic">$1</span>')
            .replace(/~([^~]+)~/g, '<span class="wa-strike">$1</span>')
            .replace(/```([^`]+)```/g, '<span class="wa-code">$1</span>')
            .replace(/\n/g, '<br/>');
        html = html.replace(/\{([^}]+)\}/g, '<span style="color: #60a5fa; background: rgba(59, 130, 246, 0.1); border-radius: 4px; padding: 0 2px;">{$1}</span>');
        return html;
    };

    const getVariables = (text) => {
        const matches = text ? text.match(/\{([^}]+)\}/g) : [];
        return matches ? [...new Set(matches)] : [];
    };

    // Group keys logic
    const categories = {
        'Scheduler': ['morning_', 'afternoon_', 'evening_'],
        'Registration': ['registration_', 'not_registered', 'already_registered'],
        'Absen Process': ['absen_'],
        'Drafts & Submission': ['draft_', 'submit_', 'emergency_'],
        'Status & History': ['cek_', 'riwayat_'],
        'Admin & Group': ['setgroup_', 'hapus_', 'listuser_', 'siapa_'],
        'General': ['menu', 'help', 'holiday', 'maintenance', 'voicenote']
    };

    const keys = Object.keys(messages).sort();
    const groups = {};
    const usedKeys = new Set();
    Object.keys(categories).forEach(k => groups[k] = []);
    groups['General'] = [];

    for (const [catName, prefixes] of Object.entries(categories)) {
        groups[catName] = keys.filter(k => {
            if (usedKeys.has(k)) return false;
            const match = prefixes.some(p => k.startsWith(p));
            if (match) usedKeys.add(k);
            return match;
        });
    }
    groups['General'] = [...groups['General'], ...keys.filter(k => !usedKeys.has(k))];

    const variables = getVariables(content);

    // Loading skeleton
    if (loading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Card>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                        <Skeleton width="40%" height={32} sx={{ mb: 2 }} />
                        <Skeleton height={44} sx={{ mb: 2 }} />
                        <Skeleton height={200} sx={{ mb: 2 }} />
                        <Skeleton height={44} />
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: { xs: 2, sm: 3 }
        }}>
            {/* Editor Section */}
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardHeader
                    title="Message Editor"
                    avatar={<MessageSquare size={20} />}
                    sx={{
                        borderBottom: 1,
                        borderColor: 'divider',
                        py: { xs: 1.5, sm: 2 }
                    }}
                    titleTypographyProps={{ variant: 'h6', fontSize: { xs: '0.9375rem', sm: '1rem' } }}
                />
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, p: { xs: 2, sm: 3 } }}>
                    <FormControl fullWidth size={isMobile ? 'small' : 'medium'}>
                        <InputLabel>Select Template</InputLabel>
                        <Select
                            value={selectedKey}
                            label="Select Template"
                            onChange={handleSelectChange}
                        >
                            {Object.entries(groups).map(([group, groupKeys]) => (
                                groupKeys.length > 0 && [
                                    <ListSubheader key={group} sx={{ bgcolor: 'background.paper', fontWeight: 'bold', fontSize: '0.75rem' }}>{group}</ListSubheader>,
                                    ...groupKeys.map(key => (
                                        <MenuItem key={key} value={key} sx={{ pl: 4, fontSize: '0.875rem' }}>
                                            {key.replace(/_/g, ' ')}
                                        </MenuItem>
                                    ))
                                ]
                            ))}
                        </Select>
                    </FormControl>

                    <TextField
                        label="Message Content"
                        multiline
                        minRows={isMobile ? 6 : 10}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Type your message here..."
                        helperText="Markdown Supported (*bold*, _italic_, ~strike~)"
                        InputProps={{
                            sx: { fontFamily: 'monospace', fontSize: { xs: '0.8125rem', sm: '0.9rem' } }
                        }}
                        sx={{ flex: 1 }}
                    />

                    {variables.length > 0 && (
                        <Box>
                            <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>Variables Detected:</Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {variables.map(v => (
                                    <Chip key={v} label={v} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.6875rem' }} />
                                ))}
                            </Box>
                        </Box>
                    )}

                    <Button
                        variant="contained"
                        fullWidth
                        size="large"
                        onClick={handleSave}
                        startIcon={<Save size={18} />}
                    >
                        Save Template
                    </Button>
                </CardContent>
            </Card>

            {/* Preview Section */}
            <Card sx={{ height: '100%' }}>
                <CardHeader
                    title="Live Preview"
                    action={<Chip label="WHATSAPP STYLE" color="success" size="small" sx={{ fontSize: '0.625rem' }} />}
                    sx={{ borderBottom: 1, borderColor: 'divider', py: { xs: 1.5, sm: 2 } }}
                    titleTypographyProps={{ variant: 'h6', fontSize: { xs: '0.9375rem', sm: '1rem' } }}
                />
                <Box sx={{ p: 0 }}>
                    <div className="whatsapp-preview">
                        {/* Bot Bubble */}
                        <div className="wa-bubble">
                            <span dangerouslySetInnerHTML={{ __html: formatPreview(content) || '<span style="color:rgba(255,255,255,0.5)">(Empty message)</span>' }}></span>
                            <div className="wa-time">
                                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                <CheckCheck size={14} color="#53bdeb" style={{ marginLeft: 3 }} />
                            </div>
                        </div>

                        {/* Fake Keyboard Area for realism */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.75rem', background: '#1f2c34', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #8696a0' }}></div>
                            <div style={{ flex: 1, height: 36, background: '#2a3942', borderRadius: 18, padding: '0 1rem', display: 'flex', alignItems: 'center', color: '#8696a0', fontSize: '0.8rem' }}>Type a message</div>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <RefreshCw size={18} color="white" />
                            </div>
                        </div>
                    </div>

                    <CardContent sx={{ p: { xs: 2, sm: 2 } }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.8125rem' } }}>
                            <strong>Tip:</strong> Use variables like <code style={{ color: '#60a5fa' }}>{`{name}`}</code> dynamically.
                        </Typography>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>Test Actions</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                            <Button variant="outlined" fullWidth onClick={() => triggerTest('morning')} startIcon={<Sun size={16} />} size={isMobile ? 'small' : 'medium'}>
                                Test Morning
                            </Button>
                            <Button variant="outlined" fullWidth onClick={() => triggerTest('evening')} startIcon={<Moon size={16} />} size={isMobile ? 'small' : 'medium'}>
                                Test Evening
                            </Button>
                        </Box>
                    </CardContent>
                </Box>
            </Card>
        </Box>
    );
}
