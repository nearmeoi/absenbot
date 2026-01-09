import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { 
    Send, Play, History, Trash2, Bot, 
    CheckCheck, ChevronDown, Link as LinkIcon, 
    FlaskConical, Search, FileText, Brain, Terminal
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SystemTest() {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('commands');

    const [chatHistory, setChatHistory] = useState([{
        id: 1, sender: 'bot',
        text: 'Halo! Saya AbsenBot (Test Mode). Silakan jalankan perintah dari panel kontrol di atas.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    const bottomRef = useRef(null);

    const [manualData, setManualData] = useState({
        aktivitas: 'Melakukan testing fitur dashboard',
        pembelajaran: 'Memahami flow sistem',
        kendala: 'Tidak ada kendala'
    });
    const [aiStory, setAiStory] = useState('Hari ini saya belajar React dan membuat komponen dashboard. Saya berhasil memahami konsep state dan props. Tidak ada kendala berarti.');

    useEffect(() => {
        loadUsers();
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    const loadUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data);
            if (res.data.length > 0) setSelectedUser(res.data[0].email);
        } catch (e) {
            toast.error('Gagal memuat users');
        }
    };

    const addToChat = (sender, text, isError = false) => {
        setChatHistory(prev => [...prev, {
            id: Date.now(),
            sender,
            text: typeof text === 'object' ? JSON.stringify(text, null, 2) : text,
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            isError
        }]);
    };

    const executeTest = async (actionName, endpoint, payload = {}, displayText = null) => {
        if (!selectedUser) {
            toast.error("Pilih user target terlebih dahulu!");
            return;
        }

        const userMsg = displayText || `/${actionName.toLowerCase()}`;
        addToChat('user', userMsg);
        setLoading(true);

        try {
            const targetUser = users.find(u => u.email === selectedUser);
            if (!targetUser) throw new Error("User data not found");

            const fullPayload = {
                email: targetUser.email,
                password: targetUser.password,
                ...payload
            };

            const res = await api.post(endpoint, fullPayload);
            const result = res.data;

            if (result.success) {
                let replyText = result.preview || result.message;
                
                if (!result.preview) {
                    if (endpoint.includes('riwayat')) {
                         replyText = `📂 *Riwayat Ditemukan*\n\nTotal Log: ${result.logs?.length || 0}\n(Check console for details)`;
                    } else if (endpoint.includes('check')) {
                        replyText = `🔍 *Status Harian*\n\nSudah Absen: ${result.sudahAbsen ? '✅ YA' : '❌ BELUM'}\nMsg: ${result.message}`;
                    } else if (endpoint.includes('simulation')) {
                        replyText = result.message;
                    }
                }
                addToChat('bot', replyText);
            } else {
                addToChat('bot', `❌ Error: ${result.message}`, true);
            }
        } catch (error) {
            addToChat('system', `Network Error: ${error.response?.data?.message || error.message}`, true);
        } finally {
            setLoading(false);
        }
    };

    const formatMessage = (text) => {
        if (!text) return '';
        let html = text
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/\*([^*]+)\*/g, '<span class="font-bold text-gray-900">$1</span>')
            .replace(/_([^_]+)_/g, '<span class="italic">$1</span>')
            .replace(/~([^~]+)~/g, '<span class="line-through">$1</span>')
            .replace(/```([^`]+)```/g, '<span class="font-mono bg-gray-100 px-1 rounded text-sm">$1</span>')
            .replace(/\n/g, '<br/>');
        return html;
    };

    return (
        <div className="flex flex-col gap-8 font-sans pb-10 max-w-2xl mx-auto">
            
            {/* 1. CONTROL PANEL */}
            <div className="flex flex-col border-[3px] border-black bg-white shadow-[4px_4px_0_#000] rounded-2xl overflow-hidden">
                <div className="bg-white border-b-[3px] border-black p-4 flex items-center gap-3">
                    <div className="bg-black text-white p-2 rounded-lg border-2 border-black">
                        <FlaskConical size={20} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">System Test</h2>
                </div>

                <div className="p-5 flex flex-col gap-5">
                    {/* User Select */}
                    <div>
                        <label className="font-bold text-xs uppercase text-gray-500 mb-1 block">Target User</label>
                        <div className="relative">
                            <select 
                                value={selectedUser}
                                onChange={(e) => setSelectedUser(e.target.value)}
                                className="w-full appearance-none border-[3px] border-black p-3 pr-10 font-bold bg-white focus:outline-none focus:shadow-[4px_4px_0_#000] transition-all cursor-pointer rounded-xl text-black"
                            >
                                <option value="" disabled>Select User</option>
                                {users.map(u => (
                                    <option key={u.email} value={u.email}>{u.email} ({u.phone})</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-black" size={20} strokeWidth={3} />
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-[3px] border-black rounded-xl overflow-hidden shadow-[2px_2px_0_#000]">
                        {[ 
                            { id: 'commands', icon: Terminal, label: 'CMD' },
                            { id: 'form', icon: FileText, label: 'Form' },
                            { id: 'ai', icon: Brain, label: 'AI' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 py-3 flex items-center justify-center gap-2 font-bold transition-all
                                    ${activeTab === tab.id 
                                        ? 'bg-black text-white' 
                                        : 'bg-white text-black hover:bg-gray-100'
                                    }
                                    ${tab.id !== 'ai' ? 'border-r-[3px] border-black' : ''}
                                `}
                            >
                                <tab.icon size={18} strokeWidth={2.5} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-[200px]">
                        {activeTab === 'commands' && (
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => executeTest('!menu', '/test/send-menu', { simulation: true }, '!menu')} disabled={loading} className="p-3 border-[3px] border-black rounded-xl font-bold flex flex-col items-center gap-2 hover:bg-[#d9fdd3] active:translate-y-1 transition-all shadow-[3px_3px_0_#000] active:shadow-none">
                                    <Send size={24} /> !menu
                                </button>
                                <button onClick={() => executeTest('!cek', '/test/check', {}, '!cek')} disabled={loading} className="p-3 border-[3px] border-black rounded-xl font-bold flex flex-col items-center gap-2 hover:bg-[#ccebfd] active:translate-y-1 transition-all shadow-[3px_3px_0_#000] active:shadow-none">
                                    <Search size={24} /> !cek status
                                </button>
                                <button onClick={() => executeTest('!riwayat', '/test/riwayat', {}, '!riwayat')} disabled={loading} className="p-3 border-[3px] border-black rounded-xl font-bold flex flex-col items-center gap-2 hover:bg-[#fff5c4] active:translate-y-1 transition-all shadow-[3px_3px_0_#000] active:shadow-none">
                                    <History size={24} /> !riwayat
                                </button>
                                <button onClick={() => executeTest('!daftar', '/test/gen-link', { simulation: true }, '!daftar')} disabled={loading} className="p-3 border-[3px] border-black rounded-xl font-bold flex flex-col items-center gap-2 hover:bg-[#f0f0f0] active:translate-y-1 transition-all shadow-[3px_3px_0_#000] active:shadow-none">
                                    <LinkIcon size={24} /> !daftar
                                </button>
                            </div>
                        )}

                        {activeTab === 'form' && (
                            <div className="flex flex-col gap-3">
                                <div className="space-y-1">
                                    <label className="font-bold text-xs uppercase text-gray-500">Aktivitas</label>
                                    <input value={manualData.aktivitas} onChange={e => setManualData({...manualData, aktivitas: e.target.value})} className="w-full border-[3px] border-black p-2 rounded-lg font-mono text-sm focus:outline-none focus:shadow-[3px_3px_0_#000] transition-all" />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-bold text-xs uppercase text-gray-500">Pembelajaran</label>
                                    <input value={manualData.pembelajaran} onChange={e => setManualData({...manualData, pembelajaran: e.target.value})} className="w-full border-[3px] border-black p-2 rounded-lg font-mono text-sm focus:outline-none focus:shadow-[3px_3px_0_#000] transition-all" />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-bold text-xs uppercase text-gray-500">Kendala</label>
                                    <input value={manualData.kendala} onChange={e => setManualData({...manualData, kendala: e.target.value})} className="w-full border-[3px] border-black p-2 rounded-lg font-mono text-sm focus:outline-none focus:shadow-[3px_3px_0_#000] transition-all" />
                                </div>
                                <button 
                                    onClick={() => {
                                        const text = `!absen manual\n\n- ${manualData.aktivitas}\n- ${manualData.pembelajaran}\n- ${manualData.kendala}`;
                                        executeTest('Simulasi Absen', '/test/simulation', { ...manualData, simulation: true }, text);
                                    }}
                                    disabled={loading}
                                    className="mt-2 bg-[#00a884] text-white p-3 border-[3px] border-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#008f6f] active:translate-y-1 transition-all shadow-[4px_4px_0_#000] active:shadow-none"
                                >
                                    <Play size={20} /> KIRIM LAPORAN
                                </button>
                            </div>
                        )}

                        {activeTab === 'ai' && (
                            <div className="flex flex-col gap-3">
                                <div className="bg-yellow-100 border-2 border-yellow-500 p-3 rounded-lg text-xs font-bold text-yellow-800">
                                    ⚠️ Menggunakan API Groq Asli
                                </div>
                                <textarea 
                                    value={aiStory}
                                    onChange={e => setAiStory(e.target.value)}
                                    className="w-full h-32 border-[3px] border-black p-3 rounded-lg font-mono text-sm focus:outline-none focus:shadow-[3px_3px_0_#000] transition-all resize-none"
                                    placeholder="Ceritakan kegiatan hari ini..."
                                />
                                <button 
                                    onClick={() => {
                                        addToChat('user', `!absen ${aiStory}`);
                                        setLoading(true);
                                        api.post('/test/ai-parse', { story: aiStory })
                                            .then(res => {
                                                const result = res.data;
                                                addToChat('bot', result.preview || result.message);
                                            })
                                            .catch(err => addToChat('system', `Error: ${err.message}`, true))
                                            .finally(() => setLoading(false));
                                    }}
                                    disabled={loading || aiStory.length < 10}
                                    className="bg-[#8b5cf6] text-white p-3 border-[3px] border-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#7c3aed] active:translate-y-1 transition-all shadow-[4px_4px_0_#000] active:shadow-none"
                                >
                                    <Brain size={20} /> TEST AI PARSER
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 2. LIVE PREVIEW */}
            <div className="flex flex-col border-[3px] border-black bg-[#efeae2] shadow-[4px_4px_0_#000] rounded-2xl overflow-hidden relative h-[600px]">
                 {/* Pattern */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                {/* WA Header */}
                <div className="bg-[#00a884] border-b-[3px] border-black p-3 flex items-center gap-3 z-10 text-white">
                    <div className="w-10 h-10 bg-white rounded-full border-2 border-black flex items-center justify-center">
                        <Bot className="text-[#00a884]" size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold leading-tight">AbsenBot (Test)</h3>
                        <p className="text-xs opacity-90">{loading ? 'typing...' : 'online'}</p>
                    </div>
                    <div className="ml-auto">
                        <button onClick={() => setChatHistory([])} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Clear Chat">
                            <Trash2 size={20} />
                        </button>
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 z-10 relative">
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col max-w-[85%] ${msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'} ${msg.sender === 'system' ? 'mx-auto items-center !max-w-full' : ''}`}>
                            {msg.sender === 'system' ? (
                                <span className="bg-black/20 text-black text-xs px-2 py-1 rounded-full font-bold">{msg.text}</span>
                            ) : (
                                <div className={`relative p-3 rounded-xl border-2 border-black/10 shadow-sm text-sm
                                    ${msg.sender === 'user' 
                                        ? 'bg-[#d9fdd3] text-gray-900 rounded-tr-none' 
                                        : (msg.isError ? 'bg-red-100 text-red-800' : 'bg-white text-gray-900 rounded-tl-none')
                                    }
                                `}>
                                    <div 
                                        className="leading-relaxed whitespace-pre-wrap"
                                        dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
                                    />
                                    <div className="flex items-center justify-end gap-1 mt-1 opacity-50">
                                        <span className="text-[10px] font-bold">{msg.time}</span>
                                        {msg.sender === 'user' && <CheckCheck size={14} className="text-blue-500" />}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            </div>
        </div>
    );
}