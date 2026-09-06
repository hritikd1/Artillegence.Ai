import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Search, BrainCircuit, Camera, TrendingUp, TrendingDown,
    Minus, AlertTriangle, Newspaper, RefreshCw, ChevronDown, ChevronUp,
    Eye, ClipboardPaste, MousePointer, Move, Edit3, Square, Circle as CircleIcon, Eraser, Paperclip
} from 'lucide-react';
import { apiPost, apiGet } from './api';
import { extractTextFromPdfFile } from './pdfUtils';
// Static imports removed for production stability

/* ─── Robust Plotly Loader ─── */
function SafePlot({ component, ...props }: any) {
    const P = component;
    if (!P) {
        return (
            <div className="h-[380px] flex flex-col items-center justify-center bg-slate-900/40 text-slate-500 rounded-xl border border-slate-800">
                <div className="w-8 h-8 border-2 border-neonBlue/20 border-t-neonBlue rounded-full animate-spin mb-3"></div>
                <p className="text-xl font-bold tracking-widest text-neonBlue/80">INITIALIZING AI ENGINE...</p>
                <p className="text-lg">Preparing high-fidelity visualization layer</p>
            </div>
        );
    }
    try {
        const data = props.data || [];
        const hasValidData = Array.isArray(data) && data.length > 0 && data.some(d => d.x && d.x.length > 0);
        if (!hasValidData) {
            return (
                <div className="h-[380px] flex flex-col items-center justify-center bg-slate-900/40 text-slate-500 rounded-xl border border-slate-800">
                    <BrainCircuit size={24} className="mb-2 opacity-30" />
                    <p className="text-xl font-bold tracking-widest">DATA VECTOR MISMATCH</p>
                    <p className="text-lg">The model couldn't find a high-confidence match for this symbol.</p>
                </div>
            );
        }
        return <P {...props} />;
    } catch (err) {
        return (
            <div className="h-[380px] flex flex-col items-center justify-center bg-red-950/20 text-red-400 rounded-xl border border-red-900/30">
                <AlertTriangle size={24} className="mb-2" />
                <p className="text-xl font-bold tracking-widest uppercase">SafeGuard Active</p>
                <p className="text-lg text-slate-400">Rendering error caught. App remains stable.</p>
            </div>
        );
    }
}

/* ─── Types ─── */
interface ChartAnalysis {
    symbol: string;
    bias: 'LONG' | 'SHORT' | 'NEUTRAL';
    trend: { direction: string; strength: string; description: string };
    key_levels: { support: string[]; resistance: string[] };
    patterns: string[];
    candlestick?: string;
    volume_analysis?: string;
    vwap_position?: string;
    entry_zone?: string;
    stop_loss?: string;
    target_1?: string;
    target_2?: string;
    risk_reward?: string;
    commentary?: string;
    confidence?: string;
    analyzed_at?: string;
    source?: string;
}

interface MistralThesis {
    symbol: string;
    bias: 'LONG' | 'SHORT' | 'NEUTRAL';
    thesis: string;
    news_sources?: { title: string; url: string; source: string }[];
    generated_at?: string;
}

/* ─── Helpers ─── */
function formatSymbol(raw: string): string {
    const upper = raw.trim().toUpperCase().replace(/\s+/g, '');
    return upper.includes(':') ? upper : `NSE:${upper}`;
}



function BiasChip({ bias }: { bias: 'LONG' | 'SHORT' | 'NEUTRAL' }) {
    const cfg = {
        LONG: { cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50', icon: <TrendingUp size={12} /> },
        SHORT: { cls: 'bg-red-500/20 text-red-300 border-red-500/50', icon: <TrendingDown size={12} /> },
        NEUTRAL: { cls: 'bg-slate-600/40 text-slate-300 border-slate-600', icon: <Minus size={12} /> },
    }[bias];
    return (
        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xl font-black tracking-widest border ${cfg.cls}`}>
            {cfg.icon} {bias}
        </span>
    );
}

function ConfidenceDot({ level }: { level?: string }) {
    const color = level === 'HIGH' ? 'bg-emerald-400' : level === 'MEDIUM' ? 'bg-amber-400' : 'bg-red-400';
    return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`} />;
}

/* ─── Main Component ─── */
export default function ChartsTab() {
    const [symbolInput, setSymbolInput] = useState('');
    const [activeSymbol, setActiveSymbol] = useState('NSE:RELIANCE');

    const [claudeAnalysis, setClaudeAnalysis] = useState<ChartAnalysis | null>(null);
    const [mistralThesis, setMistralThesis] = useState<MistralThesis | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isFetchingNews, setIsFetchingNews] = useState(false);
    const [showSources, setShowSources] = useState(false);
    const [activePanel, setActivePanel] = useState<'claude' | 'mistral'>('claude');

    // Chat state with localStorage persistence
    const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>(() => {
        try {
            const saved = localStorage.getItem('artillegence_chat_history');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [chatInput, setChatInput] = useState('');
    const [isChatting, setIsChatting] = useState(false);
    const [lastCapturedImage, setLastCapturedImage] = useState<string>(''); // Store the last image sent
    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isProcessingFile, setIsProcessingFile] = useState(false);

    useEffect(() => {
        try {
            localStorage.setItem('artillegence_chat_history', JSON.stringify(chatHistory));
        } catch {
            // ignore localStorage quota errors
        }
    }, [chatHistory]);

    const [forecastData, setForecastData] = useState<any>(null);
    const [lastContextSymbol, setLastContextSymbol] = useState<string>('');
    const [forecastError, setForecastError] = useState<string | null>(null);
    const [isFetchingForecast, setIsFetchingForecast] = useState(false);
    const [PlotComponent, setPlotComponent] = useState<any>(null);
    const [dragMode, setDragMode] = useState<string>('zoom');

    const TOOLBAR_ITEMS = [
        { mode: 'zoom', label: 'Zoom/Select', icon: <MousePointer size={14} /> },
        { mode: 'pan', label: 'Pan', icon: <Move size={14} /> },
        { mode: 'drawline', label: 'Trendline', icon: <Edit3 size={14} /> },
        { mode: 'drawrect', label: 'Rectangle', icon: <Square size={14} /> },
        { mode: 'drawcircle', label: 'Circle', icon: <CircleIcon size={14} /> },
        { mode: 'eraseshape', label: 'Eraser', icon: <Eraser size={14} /> },
    ];

    // Robust Plotly Loader
    useEffect(() => {
        let isMounted = true;
        const loadPlotly = async () => {
            try {
                // Dynamically import BOTH library and factory with high-priority chunking
                const [PlotlyModule, factoryModule] = await Promise.all([
                    import('plotly.js-dist-min'),
                    import('react-plotly.js/factory')
                ]);
                
                const Plotly = PlotlyModule.default;
                const factory = factoryModule.default;
                const created = factory(Plotly);
                
                if (isMounted) setPlotComponent(() => created);
            } catch (err) {
                console.error("CRITICAL: Plotly Engine Load Failure", err);
            }
        };
        loadPlotly();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory]);

    const handleSendChatMessage = async (e?: React.FormEvent, pastedImage?: string) => {
        if (e) e.preventDefault();
        const textToSend = chatInput.trim();
        const imgToSend = pastedImage || '';
        
        if (!textToSend && !imgToSend) return;

        const newUserMsg = { role: 'user', content: textToSend + (imgToSend ? " [Attached Image]" : "") };
        setChatHistory(prev => [...prev, newUserMsg]);
        setChatInput('');
        setIsChatting(true);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    message: textToSend,
                    image_base64: imgToSend || (chatHistory.length === 0 ? lastCapturedImage : ''),
                    history: chatHistory.map(m => ({
                        role: m.role,
                        content: m.content.replace(" [Attached Image]", "")
                    }))
                })
            });

            if (!response.ok) throw new Error("Failed to send message");
            if (!response.body) throw new Error("No readable stream");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkText = decoder.decode(value, { stream: true });
                const lines = chunkText.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;
                        
                        try {
                            const data = JSON.parse(jsonStr);
                            
                            setChatHistory(prev => {
                                const newHistory = [...prev];
                                const lastIndex = newHistory.length - 1;
                                
                                if (data.content) {
                                    newHistory[lastIndex].content += data.content;
                                }
                                if (data.reasoning) {
                                    newHistory[lastIndex].content += `\n> 💭 **Thinking**: ${data.reasoning}\n`;
                                }
                                if (data.status) {
                                    newHistory[lastIndex].content += `\n> 🛠️ **System**: ${data.status}\n\n`;
                                }
                                if (data.error) {
                                    newHistory[lastIndex].content += `\n> ⚠️ **Error**: ${data.error}\n\n`;
                                }
                                
                                return newHistory;
                            });
                        } catch (e) {
                            // ignore partial JSON parse errors 
                        }
                    }
                }
            }
        } catch (err: any) {
            setChatHistory(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${err.message}` }]);
        } finally {
            setIsChatting(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsProcessingFile(true);
        try {
            if (file.type === 'application/pdf') {
                const text = await extractTextFromPdfFile(file);
                setChatInput(prev => prev + (prev ? "\n\n" : "") + `[PDF Content: ${file.name}]\n${text}`);
            } else if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = (reader.result as string).split(',')[1];
                    handleSendChatMessage(undefined, base64String);
                };
                reader.readAsDataURL(file);
            }
        } catch (err: any) {
            console.error(err);
            setChatHistory(prev => [...prev, { role: 'assistant', content: `⚠️ Error attaching file: ${err.message}` }]);
        } finally {
            setIsProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    /* ── Scrape Mistral news thesis ── */
    const fetchMistralThesis = useCallback(async (symbol: string) => {
        setIsFetchingNews(true);
        setMistralThesis(null);
        try {
            const data: MistralThesis = await apiPost<MistralThesis>('/api/stock_analysis', { symbol });
            setMistralThesis(data);
        } catch (err: any) {
            setMistralThesis({
                symbol,
                bias: 'NEUTRAL',
                thesis: `⚠️ Could not fetch Mistral analysis: ${err.message}`,
            });
        } finally {
            setIsFetchingNews(false);
        }
    }, []);

    /* ── Fetch Forecast Data ── */
    const fetchForecast = useCallback(async (symbol: string) => {
        if (!symbol) return;
        setIsFetchingForecast(true);
        setForecastError(null);
        try {
            const data = await apiPost<any>('/api/stock_forecast', { symbol });
            if (data && data.error) {
                setForecastError(data.error);
                setForecastData(null);
            } else {
                setForecastData(data);
            }
        } catch (err: any) {
            console.error("Forecast error:", err);
            setForecastError(err.message || "Failed to retrieve forecast data.");
            setForecastData(null);
        } finally {
            setIsFetchingForecast(false);
        }
    }, []);

    // Auto-inject context into chat when search happens
    useEffect(() => {
        if (mistralThesis && forecastData && activeSymbol && activeSymbol !== lastContextSymbol) {
            setLastContextSymbol(activeSymbol);
            const contextMsg = `Here is the latest context for **${activeSymbol}**:\n\n` + 
                `**News & Bias:** ${mistralThesis.bias}\n${mistralThesis.thesis}\n\n` +
                `**Forecast Direction:** ${forecastData.forecast.direction} (Confidence: ${forecastData.forecast.confidence}%)\n` +
                `**Backtest Correlation:** ${(forecastData.backtest.correlation * 100).toFixed(1)}%\n\n` +
                `You can ask me questions about this stock based on this data!`;
            
            setChatHistory(prev => [...prev, { role: 'assistant', content: contextMsg }]);
            // Auto switch to vision chat to show it
            setActivePanel('claude');
        }
    }, [mistralThesis, forecastData, activeSymbol, lastContextSymbol]);

    // Initial load trigger on mount for default activeSymbol
    useEffect(() => {
        fetchMistralThesis(activeSymbol);
        fetchForecast(activeSymbol);
    }, [activeSymbol, fetchMistralThesis, fetchForecast]);

    /* ── Process Base64 & send to Mistral Vision backend ── */
    const processImageBase64 = async (base64Data: string) => {
        setIsCapturing(true);
        setClaudeAnalysis(null);
        setLastCapturedImage(base64Data);
        setChatHistory([]); // Reset chat for new chart

        try {
            const newsContext = mistralThesis?.news_sources
                ?.map(s => `- [${s.source}] ${s.title}`)
                .join('\n') || '';

            const data: ChartAnalysis = await apiPost<ChartAnalysis>('/api/claude_chart_analysis', {
                symbol: activeSymbol,
                image_base64: base64Data,
                media_type: 'image/png',
                news_context: newsContext
            });
            setClaudeAnalysis(data);
            setActivePanel('claude');
        } catch (err: any) {
            console.error('Vision analysis error:', err);
        } finally {
            setIsCapturing(false);
        }
    };

    /* ── Read from Clipboard explicitly on button click ── */
    const handlePasteFromClipboard = useCallback(async () => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
                    const type = item.types.includes('image/png') ? 'image/png' : 'image/jpeg';
                    const blob = await item.getType(type);

                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64String = (reader.result as string).split(',')[1];
                        processImageBase64(base64String);
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
            // If no image found in clipboard, fallback to backend scraper
            processImageBase64('');
        } catch (err) {
            console.warn('Clipboard read failed or permission denied, using backend scraper fallback:', err);
            // Fallback to backend scraper
            processImageBase64('');
        }
    }, [activeSymbol, mistralThesis]);

    /* ── Global Paste Listener (Ctrl+V) ── */
    useEffect(() => {
        const handleGlobalPaste = (e: ClipboardEvent) => {
            if (e.clipboardData && e.clipboardData.items) {
                for (let i = 0; i < e.clipboardData.items.length; i++) {
                    const item = e.clipboardData.items[i];
                    if (item.type.indexOf('image') !== -1) {
                        const blob = item.getAsFile();
                        if (blob) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const base64String = (reader.result as string).split(',')[1];
                                processImageBase64(base64String);
                            };
                            reader.readAsDataURL(blob);
                        }
                    }
                }
            }
        };
        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [activeSymbol, mistralThesis]);

    /* ── Default Capture (Backend Fallback) ── */
    const handleCapture = useCallback(() => {
        processImageBase64('');
    }, [activeSymbol, mistralThesis]);

    /* ── On symbol search ── */
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbolInput.trim()) return;
        const formatted = formatSymbol(symbolInput);
        setActiveSymbol(formatted);
        setMistralThesis(null);
        setShowSources(false);
        setSymbolInput('');
        
        // Fetch both news thesis and forecast data
        fetchMistralThesis(formatted);
        fetchForecast(formatted);
    };

    /* ─── Render Mistral Vision Panel ─── */
    const renderClaudePanel = () => {
        if (isCapturing) {
            return (
                <div className="flex flex-col items-center justify-center h-full space-y-4 py-8">
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 border-4 border-violet-500/20 rounded-full" />
                        <div className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        <ClipboardPaste className="absolute inset-0 m-auto text-violet-400 animate-pulse" size={22} />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-xl font-bold text-violet-300 tracking-widest animate-pulse">ANALYZING IMAGE...</p>
                        <p className="text-lg text-slate-500 font-mono">AI Vision scanning chart</p>
                    </div>
                </div>
            );
        }

        if (!claudeAnalysis) {
            if (chatHistory.length === 0 && !isChatting) {
                return (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50 py-8 px-4">
                        <ClipboardPaste size={42} className="text-violet-400" />
                        <div>
                            <p className="text-lg text-slate-300 font-bold mb-2">How to analyze exact chart:</p>
                            <ol className="text-[15px] text-slate-400 text-left space-y-1.5 list-decimal list-inside">
                                <li>Click the 📷 icon at the top right of the chart</li>
                                <li>Select <strong>Copy chart image</strong></li>
                                <li>Press <strong className="text-violet-300 bg-violet-900/40 px-1 rounded">Ctrl + V</strong> anywhere on this screen</li>
                            </ol>
                        </div>
                        <button
                            onClick={handleCapture}
                            className="mt-4 px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-lg font-bold border border-slate-700 hover:border-violet-500/40 transition-colors flex items-center gap-1.5"
                        >
                            <Camera size={12} /> USE GENERIC DAILY CHART INSTEAD
                        </button>
                    </div>
                );
            }
            return (
                <div className="space-y-3 animate-fade-in text-xl">
                    {(chatHistory.length > 0 || isChatting) && (
                        <div className="mt-2 space-y-3 pt-2">
                            <span className="text-[13px] font-bold text-violet-400 tracking-widest block mb-2">CHAT WITH AI VISION</span>
                            {chatHistory.map((msg, idx) => (
                                <div key={idx} className={`p-3 rounded-lg flex flex-col gap-1.5 ${msg.role === 'user' ? 'bg-violet-900/30 border border-violet-800/40 ml-4' : 'bg-slate-800/50 border border-slate-700/50 mr-4'}`}>
                                    <span className="text-[13px] font-bold text-slate-500 uppercase">{msg.role === 'user' ? 'YOU' : 'AI'}</span>
                                    <span className="text-slate-300 text-xl whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                                </div>
                            ))}
                            {isChatting && (
                                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 mr-4 flex gap-2 items-center text-xl text-slate-400">
                                    <div className="w-3 h-3 rounded-full border-2 border-violet-500/50 border-t-violet-400 animate-spin" />
                                    AI is analyzing...
                                </div>
                            )}
                            <div ref={chatEndRef} className="h-2" />
                        </div>
                    )}
                </div>
            );
        }

        const a = claudeAnalysis;
        const trendColor = a.trend?.direction === 'UPTREND' ? 'text-emerald-400' : a.trend?.direction === 'DOWNTREND' ? 'text-red-400' : 'text-slate-400';

        return (
            <div className="space-y-3 animate-fade-in text-xl">
                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-bold text-slate-500 tracking-widest">TREND</span>
                        <span className={`font-black text-lg ${trendColor}`}>
                            {a.trend?.direction} · {a.trend?.strength}
                        </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{a.trend?.description}</p>
                </div>

                {(a.key_levels?.support?.length > 0 || a.key_levels?.resistance?.length > 0) && (
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                        <span className="text-[13px] font-bold text-slate-500 tracking-widest block mb-2">KEY LEVELS</span>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <div className="text-[13px] text-emerald-500 font-bold mb-1">SUPPORT</div>
                                {a.key_levels.support.map((l, i) => (
                                    <div key={i} className="text-emerald-300 font-mono text-[15px] font-bold">{l}</div>
                                ))}
                            </div>
                            <div>
                                <div className="text-[13px] text-red-500 font-bold mb-1">RESISTANCE</div>
                                {a.key_levels.resistance.map((l, i) => (
                                    <div key={i} className="text-red-300 font-mono text-[15px] font-bold">{l}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {a.patterns && a.patterns.length > 0 && (
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                        <span className="text-[13px] font-bold text-slate-500 tracking-widest block mb-2">PATTERNS DETECTED</span>
                        <div className="flex flex-wrap gap-1.5">
                            {a.patterns.map((p, i) => (
                                <span key={i} className="px-2 py-0.5 bg-indigo-500/20 border border-indigo-500/40 rounded text-lg text-indigo-300 font-bold">
                                    {p}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {(a.entry_zone || a.stop_loss || a.target_1) && (
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800 space-y-2">
                        <span className="text-[13px] font-bold text-slate-500 tracking-widest block mb-1">TRADE SETUP</span>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-lg">
                            {a.entry_zone && <div><span className="text-slate-500">Entry: </span><span className="text-sky-300 font-bold font-mono">{a.entry_zone}</span></div>}
                            {a.stop_loss && <div><span className="text-slate-500">Stop: </span><span className="text-red-400 font-bold font-mono">{a.stop_loss}</span></div>}
                            {a.target_1 && <div><span className="text-slate-500">T1: </span><span className="text-emerald-400 font-bold font-mono">{a.target_1}</span></div>}
                            {a.target_2 && <div><span className="text-slate-500">T2: </span><span className="text-emerald-300 font-bold font-mono">{a.target_2}</span></div>}
                        </div>
                        {a.risk_reward && (
                            <div className="text-lg text-amber-400 font-bold border-t border-slate-800 pt-2">R:R = {a.risk_reward}</div>
                        )}
                    </div>
                )}

                {(a.volume_analysis || a.vwap_position) && (
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                        <span className="text-[13px] font-bold text-slate-500 tracking-widest block mb-1.5">VOLUME · VWAP</span>
                        {a.vwap_position && a.vwap_position !== 'NOT_VISIBLE' && (
                            <span className={`text-lg font-bold px-2 py-0.5 rounded mr-2 ${a.vwap_position === 'ABOVE' ? 'bg-emerald-500/20 text-emerald-400' : a.vwap_position === 'BELOW' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300'
                                }`}>
                                {a.vwap_position} VWAP
                            </span>
                        )}
                        {a.volume_analysis && <p className="text-slate-400 mt-1">{a.volume_analysis}</p>}
                    </div>
                )}

                {a.commentary && (
                    <div className="bg-indigo-950/30 rounded-lg p-3 border border-indigo-800/40">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[13px] font-bold text-indigo-400 tracking-widest">MISTRAL COMMENTARY</span>
                            <ConfidenceDot level={a.confidence} />
                            <span className="text-[13px] text-slate-500">{a.confidence}</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed">{a.commentary}</p>
                    </div>
                )}

                {a.analyzed_at && (
                    <div className="text-[13px] text-slate-600 font-mono mt-1">
                        Analyzed: {new Date(a.analyzed_at).toLocaleTimeString()} · {a.source}
                    </div>
                )}
                
                {/* Chat History */}
                {(chatHistory.length > 0 || isChatting) && (
                    <div className="mt-6 space-y-3 border-t border-slate-800/50 pt-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[13px] font-bold text-violet-400 tracking-widest block">CHAT WITH AI VISION</span>
                            <button
                                type="button"
                                onClick={() => { setChatHistory([]); localStorage.removeItem('artillegence_chat_history'); }}
                                className="text-lg text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                                title="Clear chat history"
                            >
                                <Eraser size={10} /> Clear Chat
                            </button>
                        </div>
                        {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`p-3 rounded-lg flex flex-col gap-1.5 ${msg.role === 'user' ? 'bg-violet-900/30 border border-violet-800/40 ml-4' : 'bg-slate-800/50 border border-slate-700/50 mr-4'}`}>
                                <span className="text-[13px] font-bold text-slate-500 uppercase">{msg.role === 'user' ? 'YOU' : 'AI'}</span>
                                <span className="text-slate-300 text-xl whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                            </div>
                        ))}
                        {isChatting && (
                            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 mr-4 flex gap-2 items-center text-xl text-slate-400">
                                <div className="w-3 h-3 rounded-full border-2 border-violet-500/50 border-t-violet-400 animate-spin" />
                                AI is analyzing...
                            </div>
                        )}
                        <div ref={chatEndRef} className="h-2" />
                    </div>
                )}
            </div>
        );
    };

    /* ─── Render Mistral Thesis Panel ─── */
    const renderMistralPanel = () => {
        if (isFetchingNews) {
            return (
                <div className="flex flex-col items-center justify-center h-full space-y-4 py-8">
                    <div className="relative w-14 h-14">
                        <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full" />
                        <div className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        <Newspaper className="absolute inset-0 m-auto text-orange-400 animate-pulse" size={20} />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-xl font-bold text-orange-300 tracking-widest animate-pulse">SCRAPING LIVE NEWS...</p>
                        <p className="text-lg text-slate-500 font-mono">Mistral analyzing headlines</p>
                    </div>
                </div>
            );
        }
        if (!mistralThesis) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-40 py-8">
                    <Newspaper size={36} className="text-slate-600" />
                    <p className="text-xl text-slate-500 max-w-[200px]">
                        Search a symbol to auto-trigger AI news scraping and fundamental analysis.
                    </p>
                </div>
            );
        }

        const m = mistralThesis;
        return (
            <div className="space-y-3 animate-fade-in text-xl">
                <div className="text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                    {m.thesis.split('**').map((chunk, i) =>
                        i % 2 === 1
                            ? <span key={i} className="font-bold text-orange-300 block mt-3 mb-0.5 not-italic">{chunk}</span>
                            : <span key={i}>{chunk}</span>
                    )}
                </div>

                {m.news_sources && m.news_sources.length > 0 && (
                    <div className="border-t border-slate-800 pt-3 mt-3">
                        <button onClick={() => setShowSources(s => !s)}
                            className="flex items-center gap-1.5 text-lg text-slate-500 hover:text-orange-400 transition-colors w-full text-left">
                            <Newspaper size={10} />
                            <span className="tracking-widest font-bold uppercase">{m.news_sources.length} live sources used</span>
                            {showSources ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
                        </button>
                        {showSources && (
                            <div className="mt-2 space-y-1">
                                {m.news_sources.map((s, i) => (
                                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                                        className="block text-lg text-sky-400 hover:text-sky-300 truncate">
                                        · {s.title || s.source}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {m.generated_at && (
                    <div className="text-[13px] text-slate-600 font-mono mt-1">
                        Mistral · {new Date(m.generated_at).toLocaleTimeString()}
                    </div>
                )}
            </div>
        );
    };

    /* ─── JSX ─── */
    const atrTrail = forecastData?.history?.atr_trail || [];
    const atrTrailBull = forecastData?.history?.atr_trail_bull || [];
    const atrBullY = atrTrail.map((v: any, idx: number) => atrTrailBull[idx] === true ? v : null);
    const atrBearY = atrTrail.map((v: any, idx: number) => atrTrailBull[idx] === false ? v : null);

    const volumeColors = forecastData?.history?.close?.map((c: number, idx: number) => {
        if (idx === 0) return '#10b981';
        const prev = forecastData.history.close[idx - 1];
        return c >= prev ? '#10b981' : '#ef4444';
    }) || [];

    const combinedTraces = (forecastData && forecastData.history && forecastData.forecast) ? [
        // Candlestick
        {
            x: forecastData.history.date,
            open: forecastData.history.open,
            high: forecastData.history.high,
            low: forecastData.history.low,
            close: forecastData.history.close,
            type: 'candlestick',
            name: 'Price',
            yaxis: 'y',
            increasing: { line: { color: '#10b981', width: 1.5 } },
            decreasing: { line: { color: '#ef4444', width: 1.5 } }
        },
        // ATR Trail Bull
        {
            x: forecastData.history.date,
            y: atrBullY,
            type: 'scatter',
            mode: 'lines',
            name: 'HTF Stop (Bull)',
            yaxis: 'y',
            line: { color: '#10b981', width: 2, shape: 'hv' },
            connectgaps: false
        },
        // ATR Trail Bear
        {
            x: forecastData.history.date,
            y: atrBearY,
            type: 'scatter',
            mode: 'lines',
            name: 'HTF Stop (Bear)',
            yaxis: 'y',
            line: { color: '#ef4444', width: 2, shape: 'hv' },
            connectgaps: false
        },
        // AI Projection (Future)
        {
            x: forecastData.forecast.date,
            y: forecastData.forecast.price,
            type: 'scatter',
            mode: 'lines',
            name: 'AI Forecast',
            yaxis: 'y',
            line: { color: '#facc15', width: 3, dash: 'dot', shape: 'spline' }
        },
        // Backtest AI Projection (Historical overlay)
        ...(forecastData.backtest ? [
            {
                x: [forecastData.backtest.start_date, ...forecastData.backtest.dates],
                y: [forecastData.backtest.start_price, ...forecastData.backtest.prices],
                type: 'scatter',
                mode: 'lines',
                name: 'AI Backtest Forecast',
                yaxis: 'y',
                line: { color: '#c084fc', width: 2.5, dash: 'dashdot', shape: 'spline' }
            }
        ] : []),
        // Volume (Row 2)
        {
            x: forecastData.history.date,
            y: forecastData.history.volume,
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: volumeColors }
        },
        // ADX (Row 3)
        {
            x: forecastData.history.date,
            y: forecastData.history.adx,
            type: 'scatter',
            mode: 'lines',
            name: 'ADX (Trend Strength)',
            yaxis: 'y3',
            line: { color: '#38bdf8', width: 2 }
        },
        // DI+ (Row 3)
        {
            x: forecastData.history.date,
            y: forecastData.history.plus_di,
            type: 'scatter',
            mode: 'lines',
            name: 'DI+',
            yaxis: 'y3',
            line: { color: '#10b981', width: 1.5, dash: 'dot' }
        },
        // DI- (Row 3)
        {
            x: forecastData.history.date,
            y: forecastData.history.minus_di,
            type: 'scatter',
            mode: 'lines',
            name: 'DI-',
            yaxis: 'y3',
            line: { color: '#ef4444', width: 1.5, dash: 'dot' }
        }
    ] : [];

    const combinedLayout = {
        autosize: true,
        height: 620,
        margin: { l: 50, r: 50, t: 30, b: 40 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        showlegend: true,
        legend: {
            orientation: 'h',
            y: 1.08,
            x: 0.5,
            xanchor: 'center',
            font: { color: '#94a3b8', size: 9, family: 'sans-serif' },
            bgcolor: 'rgba(0,0,0,0)'
        },
        dragmode: dragMode,
        newshape: {
            line: { color: '#38bdf8', width: 2.5 }
        },
        xaxis: {
            gridcolor: 'rgba(51, 65, 85, 0.1)',
            tickfont: { size: 9, color: '#64748b' },
            rangeslider: { visible: false },
            zeroline: false
        },
        yaxis: {
            domain: [0.42, 1.0],
            title: 'Price',
            side: 'right',
            gridcolor: 'rgba(51, 65, 85, 0.1)',
            zeroline: false,
            tickfont: { size: 9, color: '#64748b' }
        },
        yaxis2: {
            domain: [0.22, 0.38],
            title: 'Volume',
            side: 'right',
            gridcolor: 'rgba(51, 65, 85, 0.1)',
            zeroline: false,
            tickfont: { size: 9, color: '#64748b' }
        },
        yaxis3: {
            domain: [0.0, 0.18],
            title: 'ADX / DI',
            side: 'right',
            gridcolor: 'rgba(51, 65, 85, 0.1)',
            zeroline: false,
            tickfont: { size: 9, color: '#64748b' }
        },
        shapes: [
            {
                type: 'line',
                xref: 'paper',
                yref: 'y3',
                x0: 0,
                y0: 25,
                x1: 1,
                y1: 25,
                line: { color: 'rgba(148, 163, 184, 0.2)', width: 1, dash: 'dash' }
            }
        ],
        hovermode: 'x unified',
        hoverlabel: { bgcolor: '#0f172a', font: { size: 10, color: '#fff' } }
    };

    return (
        <div className="flex flex-col gap-5 animate-fade-in w-full">

            {/* ── Top Bar ── */}
            <div className="glass-panel p-4 flex flex-col md:flex-row items-center justify-between gap-4 border-b-2 border-violet-500/30">
                <div className="flex items-center gap-3">
                    <BrainCircuit className="text-violet-400" size={28} />
                    <div>
                        <h2 className="text-xl font-black tracking-wider text-white flex items-center gap-2">
                            AUTONOMOUS TRADING AGENT
                            <span className="text-[13px] font-normal text-slate-500 border border-slate-700 rounded px-1.5 py-0.5 ml-1">
                                AI Vision + AI News
                            </span>
                        </h2>
                        <p className="text-xl text-slate-400">Live TradingView chart · AI analysis · News scraping</p>
                    </div>
                </div>

                <form onSubmit={handleSearch} className="relative w-full md:w-80 flex-shrink-0">
                    <input
                        type="text"
                        placeholder="Search: RELIANCE, NASDAQ:NVDA, TCS..."
                        value={symbolInput}
                        onChange={(e) => setSymbolInput(e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2 pl-4 pr-10 text-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-400 transition-colors">
                        <Search size={18} />
                    </button>
                </form>
            </div>
            {/* ── Main Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5" style={{ minHeight: '640px' }}>
                {/* Left Column: Charts Area */}
                <div className="lg:col-span-3 flex flex-col gap-4">
                    
                    {/* Combined AI Market Terminal Chart */}
                    <div className="glass-panel overflow-hidden border border-slate-800/80 shadow-2xl relative flex flex-col p-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-800/50">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="text-neonBlue" size={16} />
                                <h3 className="text-xl font-black text-white tracking-widest uppercase italic">
                                    AI MARKET FORECAST TERMINAL
                                </h3>
                                <span className="text-[13px] font-bold text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded uppercase">
                                    {activeSymbol}
                                </span>
                            </div>

                            {/* Custom Drawing Toolbar */}
                            <div className="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800 self-start md:self-auto gap-0.5">
                                {TOOLBAR_ITEMS.map(item => (
                                    <button
                                        key={item.mode}
                                        type="button"
                                        onClick={() => setDragMode(item.mode)}
                                        className={`p-1.5 rounded transition-all flex items-center gap-1 text-lg font-bold ${
                                            dragMode === item.mode
                                                ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                                                : 'text-slate-400 hover:text-slate-200 border border-transparent'
                                        }`}
                                        title={item.label}
                                    >
                                        {item.icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chart Render Area */}
                        <div className="flex-1 min-h-[600px] relative">
                            {isFetchingForecast ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/30 z-10">
                                    <div className="relative">
                                        <div className="w-16 h-16 border-4 border-neonBlue/10 rounded-full"></div>
                                        <div className="absolute top-0 left-0 w-16 h-16 border-4 border-t-neonBlue rounded-full animate-spin"></div>
                                        <BrainCircuit className="absolute inset-0 m-auto text-neonBlue animate-pulse" size={24} />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl text-neonBlue font-black tracking-[0.2em] mb-1">RUNNING AI FORECAST MODEL</p>
                                        <p className="text-[13px] text-slate-500 font-mono">Loading data, executing pattern correlation and indicators...</p>
                                    </div>
                                </div>
                            ) : null}

                            {forecastError ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900/40 rounded-xl border border-dashed border-red-500/30 z-10 p-6 text-center">
                                    <AlertTriangle size={48} className="text-red-500 mb-4 animate-pulse" />
                                    <p className="text-xl font-black text-red-400 tracking-widest uppercase mb-2">FORECAST ENGINE ERROR</p>
                                    <p className="text-[15px] text-slate-300 font-mono max-w-md bg-slate-950/80 px-4 py-2.5 rounded-lg border border-slate-800">{forecastError}</p>
                                    <p className="text-lg text-slate-500 italic mt-3">Try formatting your search (e.g. NSE:TCS, NASDAQ:AAPL, RELIANCE)</p>
                                </div>
                            ) : null}

                            {forecastData ? (
                                <SafePlot
                                    component={PlotComponent}
                                    data={combinedTraces}
                                    layout={combinedLayout}
                                    config={{
                                        displayModeBar: true,
                                        responsive: true,
                                        modeBarButtonsToAdd: [
                                            'drawline',
                                            'drawopenpath',
                                            'drawclosedpath',
                                            'drawcircle',
                                            'drawrect',
                                            'eraseshape'
                                        ]
                                    }}
                                    className="w-full h-full"
                                />
                            ) : (
                                <div className="h-[550px] flex flex-col items-center justify-center text-slate-600 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/40">
                                    <BrainCircuit size={48} className="opacity-10 mb-4 animate-pulse" />
                                    <div className="text-center">
                                        <p className="text-xl font-bold text-slate-500 tracking-widest uppercase">Predictive model idle</p>
                                        <p className="text-lg text-slate-600 mt-1 italic">Search a symbol to initialize cross-window correlation matching</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 🚀 Backtesting Performance Report */}
                    {forecastData?.backtest && (
                        <div className="glass-panel p-5 border border-slate-800/80 rounded-xl relative overflow-hidden bg-slate-950/20">
                            <div className="absolute top-0 left-0 w-1 h-full bg-violet-500/40"></div>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-black text-violet-400 tracking-widest uppercase italic">AI MODEL BACKTEST REPORT</span>
                                        <span className={`text-[15px] px-1.5 py-0.5 rounded font-black border tracking-wider ${
                                            forecastData.backtest.direction_match
                                                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                                                : 'bg-red-950/40 text-red-400 border-red-500/30'
                                        }`}>
                                            {forecastData.backtest.direction_match ? 'ACCURACY MATCHED' : 'DIRECTION MISMATCH'}
                                        </span>
                                    </div>
                                    <p className="text-lg text-slate-500 font-medium">Evaluating last 30 business days prediction against actual price actions</p>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <div className="text-[15px] text-slate-500 font-bold uppercase">Start Date</div>
                                        <div className="text-xl font-mono font-bold text-white">{forecastData.backtest.start_date}</div>
                                    </div>
                                    <div className="h-6 w-[1px] bg-slate-800"></div>
                                    <div className="text-right">
                                        <div className="text-[15px] text-slate-500 font-bold uppercase">Start Price</div>
                                        <div className="text-xl font-mono font-bold text-white">₹{forecastData.backtest.start_price.toFixed(2)}</div>
                                    </div>
                                    <div className="h-6 w-[1px] bg-slate-800"></div>
                                    <div className="text-right">
                                        <div className="text-[15px] text-slate-500 font-bold uppercase">Correlation Accuracy</div>
                                        <div className={`text-lg font-black italic ${
                                            forecastData.backtest.correlation >= 0.7 
                                                ? 'text-emerald-400' 
                                                : forecastData.backtest.correlation >= 0.4 
                                                ? 'text-amber-400' 
                                                : 'text-red-400'
                                        }`}>
                                            {(forecastData.backtest.correlation * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[15px] text-slate-400 leading-relaxed">
                                <span className="text-violet-300 font-bold">Backtest Summary: </span>
                                On <span className="text-white font-mono">{forecastData.backtest.start_date}</span>, the model executed a similarity scan and predicted the market trajectory for the subsequent 30 days. The predicted path showed a <span className="text-white font-bold">{Math.abs(forecastData.backtest.correlation * 100).toFixed(1)}%</span> correlation to what actually transpired. The predicted direction was <span className={forecastData.backtest.direction_match ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{forecastData.backtest.direction_match ? 'CORRECT' : 'INCORRECT'}</span>.
                            </div>
                        </div>
                    )}

                    {/* Original Tools Bar and Quick Select */}
                    <div className="flex flex-col gap-3">
                        <div className="glass-panel px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Eye size={14} className="text-slate-500" />
                                <span className="text-[15px] text-slate-400">Viewing: </span>
                                <span className="text-sky-400 font-mono font-bold text-lg tracking-widest">{activeSymbol}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePasteFromClipboard}
                                    disabled={isCapturing}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-600 disabled:opacity-50 border border-violet-500/50 text-white text-xl font-bold transition-all shadow-lg shadow-violet-900/30"
                                >
                                    <ClipboardPaste size={14} className={isCapturing ? 'animate-pulse' : ''} />
                                    {isCapturing ? 'ANALYZING...' : 'CHART SCANNER 📋'}
                                </button>
                                <button
                                    onClick={() => fetchMistralThesis(activeSymbol)}
                                    disabled={isFetchingNews}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/40 text-orange-400 text-xl font-bold transition-all disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={isFetchingNews ? 'animate-spin' : ''} />
                                    LIVE NEWS
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-bold text-slate-600 tracking-widest uppercase mr-1">Quick Watch:</span>
                                {['NSE:RELIANCE', 'NSE:TCS', 'NASDAQ:NVDA', 'NSE:INFY', 'NSE:HDFCBANK'].map(sym => (
                                    <button
                                        key={sym}
                                        onClick={() => { setActiveSymbol(sym); fetchMistralThesis(sym); fetchForecast(sym); }}
                                        className={`px-3 py-1 rounded-md text-lg font-mono font-bold transition-all border ${activeSymbol === sym
                                                ? 'bg-sky-600/20 text-sky-400 border-sky-500/50'
                                                : 'bg-slate-900/40 text-slate-500 border-transparent hover:border-slate-700'
                                            }`}
                                    >
                                        {sym.split(':')[1]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: AI Thesis Panel */}
                <div className="lg:col-span-1 glass-panel flex flex-col rounded-xl border border-slate-700/50 overflow-hidden" style={{ maxHeight: '660px' }}>

                    <div className="flex border-b border-slate-800 flex-shrink-0">
                        <button
                            onClick={() => setActivePanel('claude')}
                            className={`flex-1 py-2.5 text-lg font-bold tracking-widest transition-all flex items-center justify-center gap-1.5 ${activePanel === 'claude'
                                    ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-950/20'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            <Camera size={12} /> AI VISION
                        </button>
                        <button
                            onClick={() => setActivePanel('mistral')}
                            className={`flex-1 py-2.5 text-lg font-bold tracking-widest transition-all flex items-center justify-center gap-1.5 ${activePanel === 'mistral'
                                    ? 'text-orange-400 border-b-2 border-orange-500 bg-orange-950/20'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            <Newspaper size={12} /> AI NEWS
                        </button>
                    </div>

                    <div className="flex items-center justify-between px-4 py-2 bg-slate-900/40 border-b border-slate-800/60 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            {activePanel === 'claude' && claudeAnalysis && <BiasChip bias={claudeAnalysis.bias} />}
                            {activePanel === 'mistral' && mistralThesis && <BiasChip bias={mistralThesis.bias} />}
                            {!claudeAnalysis && !mistralThesis && (
                                <span className="text-lg text-slate-600 italic">No analysis yet</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {activePanel === 'claude' && (
                                <span className="text-[13px] text-violet-400 font-bold tracking-wider">AI VISION</span>
                            )}
                            {activePanel === 'mistral' && (
                                <span className="text-[13px] text-orange-400 font-bold tracking-wider">AI NEWS</span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
                        {activePanel === 'claude' ? renderClaudePanel() : renderMistralPanel()}
                    </div>

                    {activePanel === 'claude' && (
                        <form onSubmit={(e) => handleSendChatMessage(e)} className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center gap-2 shrink-0">
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/png, image/jpeg, application/pdf"
                                onChange={handleFileUpload}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isChatting || isProcessingFile}
                                className="p-2 text-slate-400 hover:text-violet-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                                title="Attach Image or PDF"
                            >
                                <Paperclip size={18} className={isProcessingFile ? 'animate-pulse text-violet-400' : ''} />
                            </button>
                            <input 
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onPaste={(e) => {
                                    if (e.clipboardData && e.clipboardData.items) {
                                        for (let i = 0; i < e.clipboardData.items.length; i++) {
                                            const item = e.clipboardData.items[i];
                                            if (item.type.indexOf('image') !== -1) {
                                                e.preventDefault();
                                                const blob = item.getAsFile();
                                                if (blob) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        const base64String = (reader.result as string).split(',')[1];
                                                        handleSendChatMessage(undefined, base64String);
                                                    };
                                                    reader.readAsDataURL(blob);
                                                }
                                                return;
                                            }
                                        }
                                    }
                                }}
                                placeholder="Ask about this chart or attach a file..."
                                disabled={isChatting}
                                className="flex-1 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                            />
                            <button 
                                type="submit" 
                                disabled={isChatting || isProcessingFile || (!chatInput.trim() && chatHistory.length === 0)}
                                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-xl font-bold transition-colors"
                            >
                                SEND
                            </button>
                        </form>
                    )}

                    <div className="p-3 bg-red-950/20 border-t border-red-900/30 flex items-start gap-2 flex-shrink-0">
                        <AlertTriangle size={11} className="text-red-500/60 mt-0.5 shrink-0" />
                        <p className="text-[13px] text-slate-500 leading-tight">
                            AI analysis is for informational purposes only and does not constitute certified financial advice.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Symbol Specific Fundamentals (Infographic View) ── */}
            <div className="grid grid-cols-1 gap-5 mt-5">
                <FundamentalsInfographicWidget symbol={activeSymbol} />
            </div>

            {/* ── Market Movers (Top Gainers & Losers + Sensex Heatmap) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                {/* Top Gainers & Losers Widget */}
                <TopGainersLosersWidget onSelectSymbol={(sym) => { setActiveSymbol(sym); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

                {/* Stock Heatmap Widget */}
                <div className="glass-panel p-5 flex flex-col rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="text-violet-400" size={20} /> SENSEX HEATMAP
                        </h2>
                        <span className="text-xl text-slate-500 bg-slate-800 px-2 py-1 rounded">TRADINGVIEW</span>
                    </div>
                    <div className="w-full flex justify-center bg-[#131722] rounded-lg overflow-hidden border border-slate-800/50" style={{ height: '550px' }}>
                        <TradingViewHeatmapWidget />
                    </div>
                </div>
            </div>

        </div>
    );
}

const TradingViewBSEWidget = React.memo(() => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        
        const widgetWrapper = document.createElement('div');
        widgetWrapper.className = 'tradingview-widget-container__widget';
        widgetWrapper.style.height = '100%';
        widgetWrapper.style.width = '100%';
        containerRef.current.appendChild(widgetWrapper);
        
        const copyrightStr = document.createElement('div');
        copyrightStr.className = 'tradingview-widget-copyright';
        copyrightStr.innerHTML = '<a href="https://www.tradingview.com/markets/stocks-usa/" rel="noopener nofollow" target="_blank"><span class="blue-text">Stocks today</span></a><span class="trademark"> by TradingView</span>';
        containerRef.current.appendChild(copyrightStr);
        
        const script = document.createElement('script');
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-hotlists.js";
        script.type = "text/javascript";
        script.async = true;
        script.innerHTML = JSON.stringify({
            "exchange": "BSE",
            "colorTheme": "dark",
            "dateRange": "1D",
            "showChart": true,
            "locale": "en",
            "largeChartUrl": "",
            "isTransparent": false,
            "showSymbolLogo": false,
            "showFloatingTooltip": false,
            "plotLineColorGrowing": "rgba(41, 98, 255, 1)",
            "plotLineColorFalling": "rgba(41, 98, 255, 1)",
            "gridLineColor": "rgba(240, 243, 250, 0)",
            "scaleFontColor": "#DBDBDB",
            "belowLineFillColorGrowing": "rgba(41, 98, 255, 0.12)",
            "belowLineFillColorFalling": "rgba(41, 98, 255, 0.12)",
            "belowLineFillColorGrowingBottom": "rgba(41, 98, 255, 0)",
            "belowLineFillColorFallingBottom": "rgba(41, 98, 255, 0)",
            "symbolActiveColor": "rgba(41, 98, 255, 0.12)",
            "width": "100%",
            "height": "100%"
        });
        containerRef.current.appendChild(script);
        
    }, []);

    return (
        <div className="tradingview-widget-container" style={{ height: '100%', width: '100%' }} ref={containerRef}>
        </div>
    );
});

const TradingViewHeatmapWidget = React.memo(() => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        
        const widgetWrapper = document.createElement('div');
        widgetWrapper.className = 'tradingview-widget-container__widget';
        widgetWrapper.style.height = '100%';
        widgetWrapper.style.width = '100%';
        containerRef.current.appendChild(widgetWrapper);
        
        const copyrightStr = document.createElement('div');
        copyrightStr.className = 'tradingview-widget-copyright';
        copyrightStr.innerHTML = '<a href="https://www.tradingview.com/heatmap/stock/" rel="noopener nofollow" target="_blank"><span class="blue-text">Stock Heatmap</span></a><span class="trademark"> by TradingView</span>';
        containerRef.current.appendChild(copyrightStr);
        
        const script = document.createElement('script');
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
        script.type = "text/javascript";
        script.async = true;
        script.innerHTML = JSON.stringify({
            "dataSource": "SENSEX",
            "blockSize": "market_cap_basic",
            "blockColor": "change",
            "grouping": "sector",
            "locale": "en",
            "symbolUrl": "",
            "colorTheme": "dark",
            "exchanges": [],
            "hasTopBar": false,
            "isDataSetEnabled": false,
            "isZoomEnabled": true,
            "hasSymbolTooltip": true,
            "isMonoSize": false,
            "width": "100%",
            "height": "100%"
        });
        containerRef.current.appendChild(script);
        
    }, []);

    return (
        <div className="tradingview-widget-container" style={{ height: '100%', width: '100%' }} ref={containerRef}>
        </div>
    );
});

const TradingViewFinancialsWidget = React.memo(({ symbol }: { symbol: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        
        const widgetWrapper = document.createElement('div');
        widgetWrapper.className = 'tradingview-widget-container__widget';
        widgetWrapper.style.height = '100%';
        widgetWrapper.style.width = '100%';
        containerRef.current.appendChild(widgetWrapper);
        
        const copyrightStr = document.createElement('div');
        copyrightStr.className = 'tradingview-widget-copyright';
        // Cleanup stock symbol for href, e.g. NSE:RELIANCE to reliance
        const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1].toLowerCase() : symbol.toLowerCase();
        copyrightStr.innerHTML = `<a href="https://www.tradingview.com/symbols/${cleanSymbol}/financials-overview/" rel="noopener nofollow" target="_blank"><span class="blue-text">${symbol} fundamentals</span></a><span class="trademark"> by TradingView</span>`;
        containerRef.current.appendChild(copyrightStr);
        
        const script = document.createElement('script');
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-financials.js";
        script.type = "text/javascript";
        script.async = true;
        // The script config handles standard TradingView symbol formats
        script.innerHTML = JSON.stringify({
            "isTransparent": false,
            "largeChartUrl": "",
            "displayMode": "regular",
            "width": "100%",
            "height": "100%",
            "colorTheme": "dark",
            "symbol": symbol,
            "locale": "en"
        });
        containerRef.current.appendChild(script);
        
    }, [symbol]);

    return (
        <div className="tradingview-widget-container" style={{ height: '100%', width: '100%' }} ref={containerRef}>
        </div>
    );
});

/* ─── Comprehensive Infographics Fundamentals Widget ─── */
const FundamentalsInfographicWidget = React.memo(({ symbol }: { symbol: string }) => {
    const [viewMode, setViewMode] = useState<'infographic' | 'tradingview'>('infographic');
    const [loading, setLoading] = useState<boolean>(true);
    const [dataState, setDataState] = useState<{ financials: any; quarterlyResults: any[]; annualResults: any[] }>({
        financials: null,
        quarterlyResults: [],
        annualResults: []
    });

    const cleanSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;

    useEffect(() => {
        let active = true;
        setLoading(true);
        setDataState({ financials: null, quarterlyResults: [], annualResults: [] });

        const fetchFinancials = async () => {
            try {
                let data: any = null;
                try {
                    data = await apiGet(`/api/stock_financials?symbol=${encodeURIComponent(symbol)}`);
                } catch {
                    const res = await fetch(`/api/stock_financials?symbol=${encodeURIComponent(symbol)}`);
                    if (res.ok) data = await res.json();
                }
                if (active && data && data.status === 'success') {
                    setDataState({
                        financials: data.financials,
                        quarterlyResults: data.quarterlyResults || [],
                        annualResults: data.annualResults || []
                    });
                }
            } catch (err) {
                console.error("Failed to fetch financials for", symbol, err);
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchFinancials();
        return () => { active = false; };
    }, [symbol]);

    const financials = dataState.financials || {
        floatShares: "N/A",
        totalShares: "N/A",
        floatPct: 0,
        todayVolume: "N/A",
        fiveDayAvgVol: "N/A",
        volSurgePct: 0,
        currentPE: "N/A",
        fiveYearAvgPE: "N/A",
        peDiscountPct: 0,
        marketCap: "N/A",
        enterpriseValue: "N/A",
        pbRatio: "N/A",
        psRatio: "N/A",
        evEbitda: "N/A",
        evRevenue: "N/A",
        roe: 0,
        roa: 0,
        roce: 0,
        divYield: 0,
        debtToEquity: 0,
        currentRatio: 0,
        quickRatio: 0,
        interestCoverage: "N/A",
        grossMargin: 0,
        operatingMargin: 0,
        netMargin: 0,
    };

    const quarterlyResults = dataState.quarterlyResults;
    const annualResults = dataState.annualResults;

    const parseValStr = (val: any) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const m = String(val).match(/\d[\d.]*/);
        if (!m) return 0;
        let n = parseFloat(m[0]);
        if (String(val).includes('T')) n *= 1000000;
        if (String(val).includes('B')) n *= 1000;
        if (String(val).includes('Cr')) n *= 10;
        if (String(val).includes('M')) n *= 1;
        if (String(val).includes('K')) n *= 0.001;
        return n;
    };

    const maxAnnualRev = annualResults.length > 0 ? Math.max(...annualResults.map(a => a.rev || 100), 1000) : 1000;
    const maxQuarterlyRev = quarterlyResults.length > 0 ? Math.max(...quarterlyResults.map(q => q.revValue || parseValStr(q.rev) || 100), 1000) : 1000;

    return (
        <div className="glass-panel p-5 flex flex-col rounded-xl border border-slate-700/50 gap-5">
            {/* Header & Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="text-violet-400" size={22} />
                    <div>
                        <h2 className="text-lg font-bold text-white uppercase tracking-wider">{cleanSym} FINANCIAL INFOGRAPHICS</h2>
                        <span className="text-lg text-slate-400 font-mono">Detailed ratios, quarterly metrics & 5-year growth trajectory</span>
                    </div>
                </div>
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-lg">
                    <button
                        type="button"
                        onClick={() => setViewMode('infographic')}
                        className={`px-3.5 py-1.5 rounded font-bold transition-all ${viewMode === 'infographic' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        📊 INFOGRAPHICS VIEW
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('tradingview')}
                        className={`px-3.5 py-1.5 rounded font-bold transition-all ${viewMode === 'tradingview' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        📋 TRADINGVIEW DATA
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center p-12 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3 min-h-[300px]">
                    <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin"></div>
                    <span className="text-xl text-violet-300 font-mono font-bold animate-pulse tracking-wider">FETCHING REAL-TIME FINANCIAL METRICS FOR {cleanSym}...</span>
                    <span className="text-lg text-slate-500 font-mono">Querying live financial filings & market ratios</span>
                </div>
            ) : viewMode === 'tradingview' ? (
                <div className="w-full flex justify-center bg-[#131722] rounded-lg overflow-hidden border border-slate-800/50" style={{ height: '550px' }}>
                    <TradingViewFinancialsWidget symbol={symbol} />
                </div>
            ) : (
                <div className="flex flex-col gap-6 animate-fade-in">
                    
                    {/* ── TOP HIGHLIGHT STRIP: Float, Volume & P/E Comparison ── */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        
                        {/* Float Shares Card */}
                        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-sm">
                            <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                                <span className="text-lg font-bold text-sky-400 uppercase tracking-widest">Share Structure</span>
                                <span className="text-[13px] bg-sky-950 text-sky-300 px-1.5 py-0.5 rounded border border-sky-800/40 font-mono">{financials.floatPct}% Float</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <div>
                                    <span className="text-slate-400 text-[13px] block">Float Shares</span>
                                    <span className="text-white text-xl font-black font-mono">{financials.floatShares}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-slate-400 text-[13px] block">Total Shares</span>
                                    <span className="text-slate-300 text-lg font-bold font-mono">{financials.totalShares}</span>
                                </div>
                            </div>
                            <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 mt-1">
                                <div className="h-full bg-sky-400 rounded-full" style={{ width: `${financials.floatPct}%` }} />
                            </div>
                        </div>

                        {/* Volume Stats Card */}
                        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-sm">
                            <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                                <span className="text-lg font-bold text-emerald-400 uppercase tracking-widest">Volume Surveillance</span>
                                <span className="text-[13px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800/40 font-mono font-bold">⚡ +{financials.volSurgePct}% Surge</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <div>
                                    <span className="text-slate-400 text-[13px] block">Today's Volume</span>
                                    <span className="text-emerald-400 text-xl font-black font-mono">{financials.todayVolume}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-slate-400 text-[13px] block">5-Day Avg Vol</span>
                                    <span className="text-slate-300 text-lg font-bold font-mono">{financials.fiveDayAvgVol}</span>
                                </div>
                            </div>
                            <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 mt-1 relative">
                                <div className="h-full bg-emerald-400 rounded-full" style={{ width: '82%' }} />
                            </div>
                        </div>

                        {/* Current P/E vs 5-Year Avg P/E Card */}
                        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-sm">
                            <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                                <span className="text-lg font-bold text-amber-400 uppercase tracking-widest">P/E Benchmark</span>
                                <span className="text-[13px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/40 font-mono">13.1% Discount</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <div>
                                    <span className="text-slate-400 text-[13px] block">Current P/E</span>
                                    <span className="text-amber-400 text-xl font-black font-mono">{financials.currentPE}x</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-slate-400 text-[13px] block">5-Year Avg P/E</span>
                                    <span className="text-slate-300 text-lg font-bold font-mono">{financials.fiveYearAvgPE}x</span>
                                </div>
                            </div>
                            <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 mt-1 relative">
                                <div className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 rounded-full" style={{ width: `${(financials.currentPE / financials.fiveYearAvgPE) * 100}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* ── RATIOS GRID: Valuation, Profitability, Liquidity & Solvency ── */}
                    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 flex flex-col gap-4">
                        <h3 className="text-xl font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800/80 pb-2">
                            Key Financial Ratios Overview
                        </h3>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-lg">
                            {/* Valuation Ratios */}
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">P/E Ratio</span>
                                <span className="text-white font-bold font-mono text-lg">{financials.currentPE}x</span>
                                <span className="text-[15px] text-emerald-400 font-mono">5Y Avg: {financials.fiveYearAvgPE}x</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Price to Book (P/B)</span>
                                <span className="text-white font-bold font-mono text-lg">{financials.pbRatio}x</span>
                                <span className="text-[15px] text-slate-400 font-mono">Sector: 12.4x</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Price to Sales (P/S)</span>
                                <span className="text-white font-bold font-mono text-lg">{financials.psRatio}x</span>
                                <span className="text-[15px] text-slate-400 font-mono">Top Quartile</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">EV / EBITDA</span>
                                <span className="text-white font-bold font-mono text-lg">{financials.evEbitda}x</span>
                                <span className="text-[15px] text-sky-400 font-mono">EV/Rev: {financials.evRevenue}x</span>
                            </div>

                            {/* Return & Efficiency */}
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Return on Equity (ROE)</span>
                                <span className="text-emerald-400 font-bold font-mono text-lg">{financials.roe}%</span>
                                <span className="text-[15px] text-slate-400 font-mono">High Capital Return</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Return on Assets (ROA)</span>
                                <span className="text-emerald-400 font-bold font-mono text-lg">{financials.roa}%</span>
                                <span className="text-[15px] text-slate-400 font-mono">Efficient Asset Base</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">ROCE %</span>
                                <span className="text-emerald-400 font-bold font-mono text-lg">{financials.roce}%</span>
                                <span className="text-[15px] text-emerald-400 font-mono">Strong Efficiency</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Dividend Yield</span>
                                <span className="text-indigo-300 font-bold font-mono text-lg">{financials.divYield}%</span>
                                <span className="text-[15px] text-slate-400 font-mono">Quarterly Payout</span>
                            </div>

                            {/* Solvency & Liquidity */}
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Debt to Equity</span>
                                <span className="text-sky-300 font-bold font-mono text-lg">{financials.debtToEquity}</span>
                                <span className="text-[15px] text-emerald-400 font-mono">Low Leverage</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Current Ratio</span>
                                <span className="text-white font-bold font-mono text-lg">{financials.currentRatio}x</span>
                                <span className="text-[15px] text-slate-400 font-mono">Healthy Liquidity</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Quick Ratio</span>
                                <span className="text-white font-bold font-mono text-lg">{financials.quickRatio}x</span>
                                <span className="text-[15px] text-slate-400 font-mono">Acid-Test Secure</span>
                            </div>
                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/50 flex flex-col justify-between gap-1">
                                <span className="text-slate-500 text-[13px]">Interest Coverage</span>
                                <span className="text-emerald-400 font-bold font-mono text-lg">{financials.interestCoverage}x</span>
                                <span className="text-[15px] text-emerald-400 font-mono">High Solvency Buffer</span>
                            </div>
                        </div>
                    </div>

                    {/* ── LAST 4 QUARTERS RESULTS (VERTICAL BARS) ── */}
                    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <div>
                                <h3 className="text-base font-bold text-slate-300 uppercase tracking-widest">
                                    Last 4 Quarters Financial Results
                                </h3>
                                <p className="text-[13px] text-slate-500 mt-0.5">Vertical comparison bars for Revenue (Blue) vs Net Profit (Green)</p>
                            </div>
                            <div className="flex items-center gap-4 text-[13px] font-mono">
                                <span className="flex items-center gap-1.5 text-sky-400">
                                    <span className="w-2.5 h-2.5 bg-sky-500 rounded-sm"></span> Revenue
                                </span>
                                <span className="flex items-center gap-1.5 text-emerald-400">
                                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></span> Net Profit
                                </span>
                            </div>
                        </div>

                        {/* Styled Vertical Bar Chart */}
                        <div className="h-[220px] bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 flex items-end justify-between gap-4">
                            {quarterlyResults.map((q, idx) => {
                                const rVal = q.revValue || parseValStr(q.rev);
                                const pVal = q.profitValue || parseValStr(q.profit);
                                const revHeightPct = rVal ? (rVal / maxQuarterlyRev) * 100 : 0;
                                const profitHeightPct = pVal ? (pVal / maxQuarterlyRev) * 100 * 3.5 : 0;

                                return (
                                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end gap-2 group">
                                        {/* Values overlay */}
                                        <div className="flex flex-col items-center text-[11px] font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                                            <span className="text-sky-300 font-bold">{q.rev}</span>
                                            <span className="text-emerald-400 font-bold">{q.profit}</span>
                                        </div>

                                        {/* Dual Vertical Bar Column */}
                                        <div className="flex items-end gap-1.5 w-full justify-center h-[140px] border-b border-slate-800/60 pb-1">
                                            {/* Revenue Bar */}
                                            <div 
                                                className="w-1/2 max-w-[28px] bg-gradient-to-t from-sky-600 to-sky-400 rounded-t-md transition-all duration-700 group-hover:brightness-125 shadow-[0_0_8px_rgba(56,189,248,0.2)]"
                                                style={{ height: `${Math.min(revHeightPct, 100)}%` }}
                                                title={`Revenue ${q.quarter}: ${q.rev}`}
                                            />
                                            {/* Net Profit Bar */}
                                            <div 
                                                className="w-1/2 max-w-[28px] bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md transition-all duration-700 group-hover:brightness-125 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                                                style={{ height: `${Math.min(profitHeightPct, 100)}%` }}
                                                title={`Net Profit ${q.quarter}: ${q.profit}`}
                                            />
                                        </div>

                                        {/* Quarter Label */}
                                        <span className="text-sm font-bold text-slate-300 font-mono tracking-wider">{q.quarter}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── LAST 5 YEARS ANNUAL RESULTS (VERTICAL BARS) ── */}
                    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <div>
                                <h3 className="text-xl font-bold text-slate-300 uppercase tracking-widest">
                                    Last 5 Years Annual Performance Growth
                                </h3>
                                <p className="text-[13px] text-slate-500 mt-0.5">Vertical comparison bars for Revenue (Blue) vs Net Profit (Green)</p>
                            </div>
                            <div className="flex items-center gap-4 text-[13px] font-mono">
                                <span className="flex items-center gap-1.5 text-sky-400">
                                    <span className="w-2.5 h-2.5 bg-sky-500 rounded-sm"></span> Revenue
                                </span>
                                <span className="flex items-center gap-1.5 text-emerald-400">
                                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></span> Net Profit
                                </span>
                            </div>
                        </div>

                        {/* Styled Vertical Bar Chart */}
                        <div className="h-[220px] bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 flex items-end justify-between gap-4">
                            {annualResults.map((item, idx) => {
                                const revHeightPct = (item.rev / maxAnnualRev) * 100;
                                const profitHeightPct = (item.profit / maxAnnualRev) * 100 * 3.5; // Scaled for visual contrast

                                return (
                                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end gap-2 group">
                                        {/* Values overlay */}
                                        <div className="flex flex-col items-center text-[15px] font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                                            <span className="text-sky-300 font-bold">{item.revLabel}</span>
                                            <span className="text-emerald-400 font-bold">{item.profitLabel}</span>
                                        </div>

                                        {/* Dual Vertical Bar Column */}
                                        <div className="flex items-end gap-1.5 w-full justify-center h-[140px] border-b border-slate-800/60 pb-1">
                                            {/* Revenue Bar */}
                                            <div 
                                                className="w-1/2 max-w-[28px] bg-gradient-to-t from-sky-600 to-sky-400 rounded-t-md transition-all duration-700 group-hover:brightness-125 shadow-[0_0_8px_rgba(56,189,248,0.2)]"
                                                style={{ height: `${revHeightPct}%` }}
                                                title={`Revenue ${item.year}: ${item.revLabel}`}
                                            />
                                            {/* Net Profit Bar */}
                                            <div 
                                                className="w-1/2 max-w-[28px] bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md transition-all duration-700 group-hover:brightness-125 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                                                style={{ height: `${profitHeightPct}%` }}
                                                title={`Net Profit ${item.year}: ${item.profitLabel}`}
                                            />
                                        </div>

                                        {/* Year Label */}
                                        <span className="text-lg font-bold text-slate-300 font-mono tracking-wider">{item.year}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
});

/* ─── Top Gainers & Losers Widget ─── */
const TopGainersLosersWidget = React.memo(({ onSelectSymbol }: { onSelectSymbol: (symbol: string) => void }) => {
    const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');

    const gainers = [
        { symbol: "NSE:RELIANCE", name: "Reliance Industries", price: "₹2,950.40", change: "+3.20%", changeNum: 3.20, diff: "+₹91.46", vol: "12.4M" },
        { symbol: "NSE:TCS", name: "Tata Consultancy Services", price: "₹4,120.15", change: "+2.85%", changeNum: 2.85, diff: "+₹114.20", vol: "4.1M" },
        { symbol: "NSE:HDFCBANK", name: "HDFC Bank Ltd", price: "₹1,680.50", change: "+2.40%", changeNum: 2.40, diff: "+₹39.38", vol: "21.8M" },
        { symbol: "NSE:INFY", name: "Infosys Limited", price: "₹1,540.80", change: "+2.15%", changeNum: 2.15, diff: "+₹32.40", vol: "8.5M" },
        { symbol: "NSE:ICICIBANK", name: "ICICI Bank Ltd", price: "₹1,120.65", change: "+1.95%", changeNum: 1.95, diff: "+₹21.43", vol: "15.2M" },
        { symbol: "NSE:SBIN", name: "State Bank of India", price: "₹785.40", change: "+1.75%", changeNum: 1.75, diff: "+₹13.51", vol: "18.6M" },
    ];

    const losers = [
        { symbol: "NSE:ITC", name: "ITC Limited", price: "₹420.15", change: "-1.80%", changeNum: -1.80, diff: "-₹7.70", vol: "14.2M" },
        { symbol: "NSE:KOTAKBANK", name: "Kotak Mahindra Bank", price: "₹1,740.25", change: "-1.45%", changeNum: -1.45, diff: "-₹25.60", vol: "5.4M" },
        { symbol: "NSE:ASIANPAINT", name: "Asian Paints Ltd", price: "₹2,850.60", change: "-1.20%", changeNum: -1.20, diff: "-₹34.62", vol: "1.8M" },
        { symbol: "NSE:BAJFINANCE", name: "Bajaj Finance Ltd", price: "₹6,420.80", change: "-1.15%", changeNum: -1.15, diff: "-₹74.72", vol: "2.1M" },
        { symbol: "NSE:HINDUNILVR", name: "Hindustan Unilever", price: "₹2,340.10", change: "-0.95%", changeNum: -0.95, diff: "-₹22.45", vol: "2.5M" },
        { symbol: "NSE:AXISBANK", name: "Axis Bank Ltd", price: "₹1,050.30", change: "-0.85%", changeNum: -0.85, diff: "-₹9.00", vol: "9.2M" },
    ];

    const currentList = tab === 'gainers' ? gainers : losers;

    return (
        <div className="glass-panel p-5 flex flex-col rounded-xl border border-slate-700/50 h-full">
            {/* Header & Tabs */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <TrendingUp size={20} className={tab === 'gainers' ? 'text-emerald-400' : 'text-rose-400'} />
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">TOP GAINERS & LOSERS</h2>
                </div>
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-lg">
                    <button
                        type="button"
                        onClick={() => setTab('gainers')}
                        className={`px-3 py-1 rounded font-bold transition-all ${tab === 'gainers' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        🔥 GAINERS
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('losers')}
                        className={`px-3 py-1 rounded font-bold transition-all ${tab === 'losers' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        📉 LOSERS
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto max-h-[480px] scrollbar-thin space-y-2 pr-1">
                {currentList.map((item, idx) => (
                    <div
                        key={idx}
                        onClick={() => onSelectSymbol(item.symbol)}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/60 hover:border-slate-700 transition-all cursor-pointer group"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-mono font-bold text-slate-500 w-5">#{idx + 1}</span>
                            <div>
                                <h4 className="text-xl font-bold text-white group-hover:text-violet-300 transition-colors">{item.symbol.replace('NSE:', '')}</h4>
                                <span className="text-[13px] text-slate-400 block truncate max-w-[140px]">{item.name}</span>
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="flex items-center justify-end gap-2">
                                <span className="text-xl font-bold text-slate-200 font-mono">{item.price}</span>
                                <span className={`text-lg font-bold font-mono px-2 py-0.5 rounded border ${item.changeNum >= 0 ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50' : 'bg-rose-950/60 text-rose-400 border-rose-800/50'}`}>
                                    {item.change}
                                </span>
                            </div>
                            <div className="flex items-center justify-end gap-2 text-[13px] font-mono text-slate-500 mt-0.5">
                                <span>{item.diff}</span>
                                <span>· Vol {item.vol}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});
