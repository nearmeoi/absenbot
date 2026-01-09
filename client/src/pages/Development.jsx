import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Save, Sun, Moon, RefreshCw, CheckCheck, MessageSquare, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTheme, useMediaQuery } from '@mui/material';

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

    const formatPreview = (text) => {
        if (!text) return '';
        let html = text
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/\*([^*]+)\*/g, '<span class="font-bold text-gray-900">$1</span>') // Bold
            .replace(/_([^_]+)_/g, '<span class="italic">$1</span>') // Italic
            .replace(/~([^~]+)~/g, '<span class="line-through">$1</span>') // Strike
            .replace(/```([^`]+)```/g, '<span class="font-mono bg-gray-100 text-gray-800 px-1 rounded text-sm">$1</span>') // Code
            .replace(/\n/g, '<br/>');
        html = html.replace(/\{([^}]+)\}/g, '<span class="bg-gray-200 text-gray-700 px-1 rounded text-xs font-bold uppercase">{$1}</span>');
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

    if (loading) {
        return (
            <div className="border-[3px] border-black p-8 bg-white shadow-[4px_4px_0_#000] rounded-2xl animate-pulse h-96">
                <div className="h-8 bg-gray-300 w-1/3 mb-4 rounded-lg"></div>
                <div className="h-64 bg-gray-200 w-full rounded-xl"></div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-sans pb-10">
            {/* Editor Section */}
            <div className="flex flex-col border-[3px] border-black bg-white shadow-[4px_4px_0_#000] rounded-2xl overflow-hidden h-fit">
                <div className="bg-white border-b-[3px] border-black p-4 flex items-center gap-3">
                    <div className="bg-black text-white p-2 rounded-lg border-2 border-black">
                        <MessageSquare size={20} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">Message Editor</h2>
                </div>
                
                <div className="p-6 flex flex-col gap-6">
                    <div className="space-y-2">
                        <label className="font-bold text-sm text-gray-900 block">Select Template</label>
                        <div className="relative">
                            <select
                                value={selectedKey}
                                onChange={handleSelectChange}
                                className="w-full appearance-none border-[3px] border-black p-4 pr-10 font-medium bg-white focus:outline-none focus:shadow-[4px_4px_0_#000] transition-all cursor-pointer rounded-xl text-black"
                            >
                                {Object.entries(groups).map(([group, groupKeys]) => (
                                    groupKeys.length > 0 && (
                                        <optgroup key={group} label={group} className="font-bold">
                                            {groupKeys.map(key => (
                                                <option key={key} value={key} className="font-normal">
                                                    {key.replace(/_/g, ' ')}
                                                </option>
                                            ))}
                                        </optgroup>
                                    )
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-black" size={20} strokeWidth={3} />
                        </div>
                    </div>

                    <div className="space-y-2 flex flex-col">
                        <label className="font-bold text-sm text-gray-900 block">Content</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full min-h-[400px] border-[3px] border-black p-4 font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0_#000] transition-all resize-none rounded-xl placeholder-gray-400 text-black"
                            placeholder="Type your message here..."
                        ></textarea>
                    </div>

                    {variables.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {variables.map(v => (
                                <span key={v} className="bg-black text-white px-2 py-1 text-xs font-bold border-2 border-black rounded-lg">
                                    {v}
                                </span>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        className="bg-[#00a884] border-[3px] border-black py-4 font-bold uppercase text-lg shadow-[4px_4px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-3 hover:bg-[#008f6f] text-white rounded-xl w-full"
                    >
                        <Save size={24} strokeWidth={2.5} /> SAVE TEMPLATE
                    </button>
                </div>
            </div>

            {/* Preview Section */}
            <div className="flex flex-col border-[3px] border-black bg-[#efeae2] shadow-[4px_4px_0_#000] rounded-2xl overflow-hidden relative h-fit">
                {/* Custom pattern overlay for WA feel */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                <div className="bg-[#00a884] border-b-[3px] border-black p-4 flex justify-between items-center z-10 text-white">
                    <h2 className="text-xl font-bold tracking-tight">Live Preview</h2>
                    <span className="bg-white text-[#00a884] border-2 border-black px-3 py-1 text-xs font-bold rounded-full shadow-[2px_2px_0_rgba(0,0,0,0.5)]">
                        WHATSAPP MODE
                    </span>
                </div>

                <div className="p-6 flex flex-col relative z-10">
                    {/* WhatsApp Chat UI */}
                    <div className="h-[500px] overflow-y-auto space-y-4 pr-2">
                        <div className="flex flex-col gap-1 items-end ml-auto max-w-[85%]">
                            <div className="bg-[#d9fdd3] text-gray-900 p-3 rounded-lg rounded-tr-none shadow-sm text-sm relative">
                                <div 
                                    className="leading-relaxed whitespace-pre-wrap"
                                    dangerouslySetInnerHTML={{ __html: formatPreview(content) || '<span class="opacity-50 italic text-gray-500">Empty message</span>' }}
                                />
                                <div className="flex items-center justify-end gap-1 mt-1">
                                    <span className="text-[10px] text-gray-500">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    <CheckCheck size={14} className="text-[#53bdeb]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Fake Input */}
                    <div className="mt-4 pt-4 border-t-2 border-gray-300/50 flex gap-2">
                         <div className="flex-1 bg-white h-10 rounded-full flex items-center px-4 text-gray-400 text-sm shadow-sm border border-gray-200">
                            Type a message...
                        </div>
                        <div className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white shadow-sm hover:bg-[#008f6f] cursor-pointer transition-colors">
                            <RefreshCw size={20} strokeWidth={2.5} />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t-[3px] border-black bg-white z-10">
                    <h3 className="font-bold text-xs uppercase text-gray-500 mb-2">Test Triggers</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => triggerTest('morning')}
                            className="border-[3px] border-black py-3 font-bold text-sm uppercase hover:bg-[#fff5c4] shadow-[3px_3px_0_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 rounded-lg bg-white"
                        >
                            <Sun size={18} strokeWidth={2.5} /> Morning
                        </button>
                        <button 
                            onClick={() => triggerTest('evening')}
                            className="border-[3px] border-black py-3 font-bold text-sm uppercase hover:bg-[#f3e8ff] shadow-[3px_3px_0_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 rounded-lg bg-white"
                        >
                            <Moon size={18} strokeWidth={2.5} /> Evening
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
