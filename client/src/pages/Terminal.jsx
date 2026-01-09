import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import api from '../utils/api';

export default function TerminalPage() {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const wsRef = useRef(null);
    const [inputValue, setInputValue] = useState('');
    const [ctrlActive, setCtrlActive] = useState(false);
    const [altActive, setAltActive] = useState(false);
    const [status, setStatus] = useState('CONNECTING...');

    useEffect(() => {
        const term = new XTerm({
            theme: {
                background: '#000000',
                foreground: '#ffffff',
                cursor: '#ffffff',
                selectionBackground: '#ffffff40',
                black: '#000000',
                white: '#ffffff',
                brightBlack: '#666666',
                brightWhite: '#ffffff',
            },
            fontFamily: "'Roboto', sans-serif",
            fontSize: 11,
            letterSpacing: -8,
            lineHeight: 1,
            cursorBlink: true,
            cursorStyle: 'block',
            disableStdin: false, 
            allowTransparency: false,
            convertEol: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        if (terminalRef.current) {
            term.open(terminalRef.current);
            setTimeout(() => fitAddon.fit(), 100);
        }

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/term-socket`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus('CONNECTED');
            term.write('\r\n\x1b[1;32m✓ SSH Connection Established\x1b[0m\r\n');
            ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
        };

        ws.onmessage = (event) => {
            if (event.data instanceof Blob) {
                const reader = new FileReader();
                reader.onload = () => term.write(reader.result);
                reader.readAsText(event.data);
            } else {
                term.write(event.data);
            }
        };

        ws.onclose = () => {
            setStatus('DISCONNECTED');
            term.write('\r\n\x1b[1;31m✗ Connection Closed\x1b[0m\r\n');
        };

        term.onData(data => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        const handleResize = () => {
            fitAddon.fit();
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            ws.close();
            term.dispose();
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const sendRaw = (data) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(data);
            xtermRef.current?.focus();
        }
    };

    const handleInputSubmit = (e) => {
        if (e.key === 'Enter') {
            sendRaw(inputValue + '\r');
            setInputValue('');
        }
    };

    const handleVirtualKey = (key) => {
        if (key === 'CTRL') { setCtrlActive(!ctrlActive); return; }
        if (key === 'ALT') { setAltActive(!altActive); return; }

        let payload = '';
        switch (key) {
            case 'ESC': payload = '\x1b'; break;
            case 'TAB': payload = '\t'; break;
            case '↑': payload = '\x1b[A'; break;
            case '↓': payload = '\x1b[B'; break;
            case '←': payload = '\x1b[D'; break;
            case '→': payload = '\x1b[C'; break;
            default: return;
        }
        sendRaw(payload);
    };
    
    return (
        <div className="fixed inset-0 h-screen w-screen bg-black overflow-hidden flex flex-col font-['Roboto',sans-serif] text-white z-[9999]">
            <header className="h-[36px] flex-none flex items-center justify-between px-4 border-b border-[#1a1a1a]">
                <span className="text-[11px] text-[#666] font-medium">gemini-vps</span>
                <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${status === 'CONNECTED' ? 'bg-[#0df259] animate-pulse' : 'bg-red-500'}`}></div>
                    <span className={`text-[10px] font-bold tracking-widest ${status === 'CONNECTED' ? 'text-[#0df259]' : 'text-red-500'}`}>
                        {status}
                    </span>
                </div>
            </header>

            <main className="flex-1 overflow-hidden relative bg-black pt-2 px-2">
                <div ref={terminalRef} className="h-full w-full" />
            </main>

            <div className="flex-none bg-black border-t border-[#1a1a1a] px-4 py-3 flex items-center gap-3">
                <span className="text-[#0df259] font-mono text-lg select-none">❯</span>
                <input 
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleInputSubmit}
                    placeholder="Type command..."
                    className="bg-transparent border-none text-white font-['Roboto',sans-serif] text-[11px] w-full focus:outline-none placeholder-[#333]"
                    autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false"
                />
            </div>

            <nav className="flex-none h-[48px] bg-[#000] grid grid-cols-8 gap-[1px] border-t border-[#1a1a1a]">
                {['ESC', 'TAB', 'CTRL', 'ALT', '←', '↓', '↑', '→'].map((key) => (
                    <button
                        key={key}
                        onClick={() => handleVirtualKey(key)}
                        className={`flex items-center justify-center text-[10px] font-bold transition-colors ${ 
                            ((key === 'CTRL' && ctrlActive) || (key === 'ALT' && altActive)) 
                                ? 'bg-[#eee] text-black' 
                                : 'bg-black text-[#888] active:bg-[#222]'
                        }`}
                    >
                        {key}
                    </button>
                ))}
            </nav>
        </div>
    );
}
