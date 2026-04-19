import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Search, BrainCircuit, Camera, TrendingUp, TrendingDown,
    Minus, AlertTriangle, Newspaper, RefreshCw, ChevronDown, ChevronUp,
    Eye, ClipboardPaste
} from 'lucide-react';
import { apiPost } from './api';
import Plotly from 'plotly.js-dist-min';
import createPlotComponent from 'react-plotly.js/factory';
const Plot = createPlotComponent(Plotly);

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
        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black tracking-widest border ${cfg.cls}`}>
            {cfg.icon} {bias}
        </span>
    );
}

function ConfidenceDot({ level }: { level?: string }) {
    const color = level === 'HIGH' ? 'bg-emerald-400' : level === 'MEDIUM' ? 'bg-amber-400' : 'bg-red-400';
    return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`} />;
}

const TradingViewWidget = React.memo(({ symbol }: { symbol: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        
        containerRef.current.innerHTML = '';
        
        const widgetWrapper = document.createElement('div');
        widgetWrapper.className = 'tradingview-widget-container__widget';
        widgetWrapper.style.height = 'calc(100% - 32px)';
        widgetWrapper.style.width = '100%';
        containerRef.current.appendChild(widgetWrapper);
        
        const script = document.createElement('script');
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
        script.type = "text/javascript";
        script.async = true;
        script.innerHTML = JSON.stringify({
            "allow_symbol_change": true,
            "calendar": false,
            "details": false,
            "hide_side_toolbar": true,
            "hide_top_toolbar": false,
            "hide_legend": false,
            "hide_volume": false,
            "hotlist": false,
            "interval": "D",
            "locale": "en",
            "save_image": true,
            "style": "1",
            "symbol": symbol,
            "theme": "dark",
            "timezone": "Etc/UTC",
            "backgroundColor": "#0F0F0F",
            "gridColor": "rgba(242, 242, 242, 0.06)",
            "watchlist": [],
            "withdateranges": false,
            "range": "ALL",
            "compareSymbols": [],
            "studies": [],
            "autosize": true
        });
        containerRef.current.appendChild(script);
        
        const copyrightStr = document.createElement('div');
        copyrightStr.className = 'tradingview-widget-copyright';
        copyrightStr.innerHTML = `<a href="https://www.tradingview.com/symbols/${encodeURIComponent(symbol)}/" rel="noopener nofollow" target="_blank"><span class="blue-text">${symbol} stock chart</span></a><span class="trademark"> by TradingView</span>`;
        containerRef.current.appendChild(copyrightStr);
        
    }, [symbol]);

    return (
        <div className="tradingview-widget-container" style={{ height: '100%', width: '100%' }} ref={containerRef}>
            <div className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 32px)', width: '100%' }}></div>
        </div>
    );
});

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

    // Chat state
    const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatting, setIsChatting] = useState(false);
    const [lastCapturedImage, setLastCapturedImage] = useState<string>(''); // Store the last image sent
    const chatEndRef = useRef<HTMLDivElement>(null);

    const [forecastData, setForecastData] = useState<any>(null);
    const [forecastInput, setForecastInput] = useState('');
    const [isFetchingForecast, setIsFetchingForecast] = useState(false);

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
            const data = await apiPost<any>('/api/chat', {
                message: textToSend,
                image_base64: imgToSend || (chatHistory.length === 0 ? lastCapturedImage : ''),
                history: chatHistory.map(m => ({
                    role: m.role,
                    content: m.content.replace(" [Attached Image]", "")
                }))
            });
            setChatHistory(prev => [...prev, { role: 'assistant', content: data.response }]);
        } catch (err: any) {
            setChatHistory(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${err.message}` }]);
        } finally {
            setIsChatting(false);
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
    const fetchForecast = async (symbol: string) => {
        if (!symbol) return;
        setIsFetchingForecast(true);
        try {
            const data = await apiPost<any>('/api/stock_forecast', { symbol });
            setForecastData(data);
        } catch (err) {
            console.error("Forecast error:", err);
        } finally {
            setIsFetchingForecast(false);
        }
    };

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
        
        // Auto-fetch News layer ONLY (Forecast is now decoupled)
        fetchMistralThesis(formatted);
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
                        <p className="text-xs font-bold text-violet-300 tracking-widest animate-pulse">ANALYZING IMAGE...</p>
                        <p className="text-[10px] text-slate-500 font-mono">Mistral Vision scanning chart</p>
                    </div>
                </div>
            );
        }

        if (!claudeAnalysis) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50 py-8 px-4">
                    <ClipboardPaste size={42} className="text-violet-400" />
                    <div>
                        <p className="text-sm text-slate-300 font-bold mb-2">How to analyze exact chart:</p>
                        <ol className="text-[11px] text-slate-400 text-left space-y-1.5 list-decimal list-inside">
                            <li>Click the 📷 icon at the top right of the chart</li>
                            <li>Select <strong>Copy chart image</strong></li>
                            <li>Press <strong className="text-violet-300 bg-violet-900/40 px-1 rounded">Ctrl + V</strong> anywhere on this screen</li>
                        </ol>
                    </div>
                    <button
                        onClick={handleCapture}
                        className="mt-4 px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700 hover:border-violet-500/40 transition-colors flex items-center gap-1.5"
                    >
                        <Camera size={12} /> USE GENERIC DAILY CHART INSTEAD
                    </button>
                </div>
            );
        }

        const a = claudeAnalysis;
        const trendColor = a.trend?.direction === 'UPTREND' ? 'text-emerald-400' : a.trend?.direction === 'DOWNTREND' ? 'text-red-400' : 'text-slate-400';

        return (
            <div className="space-y-3 animate-fade-in text-xs">
                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-bold text-slate-500 tracking-widest">TREND</span>
                        <span className={`font-black text-[10px] ${trendColor}`}>
                            {a.trend?.direction} · {a.trend?.strength}
                        </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{a.trend?.description}</p>
                </div>

                {(a.key_levels?.support?.length > 0 || a.key_levels?.resistance?.length > 0) && (
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                        <span className="text-[9px] font-bold text-slate-500 tracking-widest block mb-2">KEY LEVELS</span>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <div className="text-[9px] text-emerald-500 font-bold mb-1">SUPPORT</div>
                                {a.key_levels.support.map((l, i) => (
                                    <div key={i} className="text-emerald-300 font-mono text-[11px] font-bold">{l}</div>
                                ))}
                            </div>
                            <div>
                                <div className="text-[9px] text-red-500 font-bold mb-1">RESISTANCE</div>
                                {a.key_levels.resistance.map((l, i) => (
                                    <div key={i} className="text-red-300 font-mono text-[11px] font-bold">{l}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {a.patterns && a.patterns.length > 0 && (
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                        <span className="text-[9px] font-bold text-slate-500 tracking-widest block mb-2">PATTERNS DETECTED</span>
                        <div className="flex flex-wrap gap-1.5">
                            {a.patterns.map((p, i) => (
                                <span key={i} className="px-2 py-0.5 bg-indigo-500/20 border border-indigo-500/40 rounded text-[10px] text-indigo-300 font-bold">
                                    {p}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {(a.entry_zone || a.stop_loss || a.target_1) && (
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800 space-y-2">
                        <span className="text-[9px] font-bold text-slate-500 tracking-widest block mb-1">TRADE SETUP</span>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[10px]">
                            {a.entry_zone && <div><span className="text-slate-500">Entry: </span><span className="text-sky-300 font-bold font-mono">{a.entry_zone}</span></div>}
                            {a.stop_loss && <div><span className="text-slate-500">Stop: </span><span className="text-red-400 font-bold font-mono">{a.stop_loss}</span></div>}
                            {a.target_1 && <div><span className="text-slate-500">T1: </span><span className="text-emerald-400 font-bold font-mono">{a.target_1}</span></div>}
                            {a.target_2 && <div><span className="text-slate-500">T2: </span><span className="text-emerald-300 font-bold font-mono">{a.target_2}</span></div>}
                        </div>
                        {a.risk_reward && (
                            <div className="text-[10px] text-amber-400 font-bold border-t border-slate-800 pt-2">R:R = {a.risk_reward}</div>
                        )}
                    </div>
                )}

                {(a.volume_analysis || a.vwap_position) && (
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                        <span className="text-[9px] font-bold text-slate-500 tracking-widest block mb-1.5">VOLUME · VWAP</span>
                        {a.vwap_position && a.vwap_position !== 'NOT_VISIBLE' && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded mr-2 ${a.vwap_position === 'ABOVE' ? 'bg-emerald-500/20 text-emerald-400' : a.vwap_position === 'BELOW' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300'
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
                            <span className="text-[9px] font-bold text-indigo-400 tracking-widest">MISTRAL COMMENTARY</span>
                            <ConfidenceDot level={a.confidence} />
                            <span className="text-[9px] text-slate-500">{a.confidence}</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed">{a.commentary}</p>
                    </div>
                )}

                {a.analyzed_at && (
                    <div className="text-[9px] text-slate-600 font-mono mt-1">
                        Analyzed: {new Date(a.analyzed_at).toLocaleTimeString()} · {a.source}
                    </div>
                )}
                
                {/* Chat History */}
                {(chatHistory.length > 0 || isChatting) && (
                    <div className="mt-6 space-y-3 border-t border-slate-800/50 pt-5">
                        <span className="text-[9px] font-bold text-violet-400 tracking-widest block mb-2">CHAT WITH GROQ VISION</span>
                        {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`p-3 rounded-lg flex flex-col gap-1.5 ${msg.role === 'user' ? 'bg-violet-900/30 border border-violet-800/40 ml-4' : 'bg-slate-800/50 border border-slate-700/50 mr-4'}`}>
                                <span className="text-[9px] font-bold text-slate-500 uppercase">{msg.role === 'user' ? 'YOU' : 'GROQ'}</span>
                                <span className="text-slate-300 text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                            </div>
                        ))}
                        {isChatting && (
                            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 mr-4 flex gap-2 items-center text-xs text-slate-400">
                                <div className="w-3 h-3 rounded-full border-2 border-violet-500/50 border-t-violet-400 animate-spin" />
                                Groq is analyzing...
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
                        <p className="text-xs font-bold text-orange-300 tracking-widest animate-pulse">SCRAPING LIVE NEWS...</p>
                        <p className="text-[10px] text-slate-500 font-mono">Mistral analyzing headlines</p>
                    </div>
                </div>
            );
        }
        if (!mistralThesis) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-40 py-8">
                    <Newspaper size={36} className="text-slate-600" />
                    <p className="text-xs text-slate-500 max-w-[200px]">
                        Search a symbol to auto-trigger Mistral news scraping and fundamental analysis.
                    </p>
                </div>
            );
        }

        const m = mistralThesis;
        return (
            <div className="space-y-3 animate-fade-in text-xs">
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
                            className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-orange-400 transition-colors w-full text-left">
                            <Newspaper size={10} />
                            <span className="tracking-widest font-bold uppercase">{m.news_sources.length} live sources used</span>
                            {showSources ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
                        </button>
                        {showSources && (
                            <div className="mt-2 space-y-1">
                                {m.news_sources.map((s, i) => (
                                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                                        className="block text-[10px] text-sky-400 hover:text-sky-300 truncate">
                                        · {s.title || s.source}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {m.generated_at && (
                    <div className="text-[9px] text-slate-600 font-mono mt-1">
                        Mistral · {new Date(m.generated_at).toLocaleTimeString()}
                    </div>
                )}
            </div>
        );
    };

    /* ─── JSX ─── */
    return (
        <div className="flex flex-col gap-5 animate-fade-in w-full">

            {/* ── Top Bar ── */}
            <div className="glass-panel p-4 flex flex-col md:flex-row items-center justify-between gap-4 border-b-2 border-violet-500/30">
                <div className="flex items-center gap-3">
                    <BrainCircuit className="text-violet-400" size={28} />
                    <div>
                        <h2 className="text-xl font-black tracking-wider text-white flex items-center gap-2">
                            AUTONOMOUS TRADING AGENT
                            <span className="text-[9px] font-normal text-slate-500 border border-slate-700 rounded px-1.5 py-0.5 ml-1">
                                Mistral Vision + Mistral News
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400">Live TradingView chart · AI analysis · News scraping</p>
                    </div>
                </div>

                <form onSubmit={handleSearch} className="relative w-full md:w-80 flex-shrink-0">
                    <input
                        type="text"
                        placeholder="Search: RELIANCE, NASDAQ:NVDA, TCS..."
                        value={symbolInput}
                        onChange={(e) => setSymbolInput(e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-lg py-2 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
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
                    
                    {/* Primary TradingView Chart Container */}
                    <div 
                        className="glass-panel overflow-hidden border-2 border-slate-800/50 shadow-2xl relative group" 
                        style={{ height: '560px' }}
                    >
                        {/* Overlay "Analyzing" Badge when active */}
                        {isFetchingNews && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 bg-orange-600/90 backdrop-blur-md rounded-full border border-orange-400/50 flex items-center gap-2 shadow-lg shadow-orange-950/40">
                                <RefreshCw size={12} className="animate-spin text-white" />
                                <span className="text-[10px] font-black text-white tracking-widest">AGENT SCANNING LIVE FEEDS...</span>
                            </div>
                        )}
                        <TradingViewWidget symbol={activeSymbol} />
                    </div>

                    {/* 🚀 AI Predictive Forecast Integration (PlotyForecast Project) */}
                    <div className="glass-panel p-6 border border-slate-800/50 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-neonBlue/40"></div>
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-neonBlue/10 rounded-lg border border-neonBlue/20">
                                    <TrendingUp className="text-neonBlue" size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-white tracking-widest uppercase italic flex items-center gap-2">
                                        AI Predictive Asset Forecast 
                                        <span className="text-[8px] font-normal text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded not-italic tracking-normal">PATTERN MATCHED</span>
                                    </h3>
                                    <p className="text-[10px] text-slate-500 font-medium">Historical matching algorithm detects future trajectory</p>
                                </div>
                            </div>
                            
                            {/* Decoupled Search Field */}
                            <div className="flex items-center gap-2">
                                <form 
                                    onSubmit={(e) => { e.preventDefault(); fetchForecast(forecastInput); }}
                                    className="relative"
                                >
                                    <input 
                                        type="text"
                                        placeholder="Forecast Symbol"
                                        value={forecastInput}
                                        onChange={(e) => setForecastInput(e.target.value)}
                                        className="bg-slate-900 border border-slate-700 rounded py-1 px-3 text-[10px] text-white focus:outline-none focus:border-neonBlue w-32"
                                    />
                                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-neonBlue transition-colors">
                                        <Search size={10} />
                                    </button>
                                </form>

                                <div className="h-8 w-[1px] bg-slate-800 mx-1"></div>

                                {forecastData?.correlation_score && (
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <div className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">Model Confidence</div>
                                            <div className="text-sm font-black text-neonBlue italic">{(forecastData.correlation_score * 100).toFixed(1)}%</div>
                                        </div>
                                        <div className="h-8 w-[1px] bg-slate-800"></div>
                                        <button 
                                            onClick={() => fetchForecast(forecastInput || activeSymbol)} 
                                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-neonBlue transition-all"
                                            title="Rerun forecast match"
                                        >
                                            <RefreshCw size={14} className={isFetchingForecast ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {isFetchingForecast ? (
                            <div className="h-[380px] flex flex-col items-center justify-center space-y-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/30">
                                <div className="relative">
                                    <div className="w-16 h-16 border-4 border-neonBlue/10 rounded-full"></div>
                                    <div className="absolute top-0 left-0 w-16 h-16 border-4 border-t-neonBlue rounded-full animate-spin"></div>
                                    <BrainCircuit className="absolute inset-0 m-auto text-neonBlue animate-pulse" size={24} />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-neonBlue font-black tracking-[0.2em] mb-1">COMPUTING PATTERN VECTORS</p>
                                    <p className="text-[9px] text-slate-500 font-mono">Comparing current structure to 2-year market history...</p>
                                </div>
                            </div>
                        ) : forecastData ? (
                            <div className="w-full overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40 relative">
                                <Plot
                                    data={[
                                        {
                                            x: forecastData.history.date,
                                            open: forecastData.history.open,
                                            high: forecastData.history.high,
                                            low: forecastData.history.low,
                                            close: forecastData.history.close,
                                            type: 'candlestick',
                                            name: 'Market Price',
                                            increasing: { line: { color: '#22c55e', width: 1.5 } },
                                            decreasing: { line: { color: '#ef4444', width: 1.5 } },
                                        },
                                        {
                                            x: forecastData.forecast.date,
                                            y: forecastData.forecast.price,
                                            type: 'scatter',
                                            mode: 'lines',
                                            name: 'AI Projection',
                                            line: { color: '#facc15', width: 3, dash: 'dot', shape: 'spline' },
                                            fill: 'none'
                                        }
                                    ]}
                                    layout={{
                                        autosize: true,
                                        height: 380,
                                        margin: { l: 45, r: 25, t: 15, b: 40 },
                                        paper_bgcolor: 'rgba(0,0,0,0)',
                                        plot_bgcolor: 'rgba(0,0,0,0)',
                                        showlegend: true,
                                        legend: { 
                                            orientation: 'h', 
                                            y: 1.08, 
                                            x: 1, 
                                            xanchor: 'right',
                                            font: { color: '#94a3b8', size: 10, family: 'sans-serif' },
                                            bgcolor: 'rgba(0,0,0,0)'
                                        },
                                        xaxis: {
                                            gridcolor: 'rgba(51, 65, 85, 0.4)',
                                            tickfont: { size: 9, color: '#64748b' },
                                            rangeslider: { visible: false },
                                            zeroline: false
                                        },
                                        yaxis: {
                                            gridcolor: 'rgba(51, 65, 85, 0.4)',
                                            tickfont: { size: 9, color: '#64748b' },
                                            zeroline: false,
                                            side: 'right'
                                        },
                                        hovermode: 'x unified',
                                        hoverlabel: { bgcolor: '#0f172a', font: { size: 11, color: '#fff' } }
                                    }}
                                    config={{ displayModeBar: false, responsive: true }}
                                    className="w-full"
                                />
                                <div className="p-4 bg-slate-900/60 border-t border-slate-800/80 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle size={12} className="text-amber-500/50" />
                                        <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Strategic Disclaimer</span>
                                    </div>
                                    <p className="text-[9px] text-slate-500 italic max-w-lg text-right">
                                        Match determined by recursive correlation analysis. Historical performance is not indicative of future results.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="h-[220px] flex flex-col items-center justify-center text-slate-600 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/40">
                                <BrainCircuit size={48} className="opacity-10 mb-4 animate-pulse" />
                                <div className="text-center">
                                    <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">Predictive model idle</p>
                                    <p className="text-[10px] text-slate-600 mt-1 italic">Search a symbol to initialize cross-window correlation matching</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Original Tools Bar and Quick Select */}
                    <div className="flex flex-col gap-3">
                        <div className="glass-panel px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Eye size={14} className="text-slate-500" />
                                <span className="text-[11px] text-slate-400">Viewing: </span>
                                <span className="text-sky-400 font-mono font-bold text-sm tracking-widest">{activeSymbol}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePasteFromClipboard}
                                    disabled={isCapturing}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-600 disabled:opacity-50 border border-violet-500/50 text-white text-xs font-bold transition-all shadow-lg shadow-violet-900/30"
                                >
                                    <ClipboardPaste size={14} className={isCapturing ? 'animate-pulse' : ''} />
                                    {isCapturing ? 'ANALYZING...' : 'CHART SCANNER 📋'}
                                </button>
                                <button
                                    onClick={() => fetchMistralThesis(activeSymbol)}
                                    disabled={isFetchingNews}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/40 text-orange-400 text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={isFetchingNews ? 'animate-spin' : ''} />
                                    LIVE NEWS
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-slate-600 tracking-widest uppercase mr-1">Quick Watch:</span>
                                {['NSE:RELIANCE', 'NSE:TCS', 'NASDAQ:NVDA', 'NSE:INFY', 'NSE:HDFCBANK'].map(sym => (
                                    <button
                                        key={sym}
                                        onClick={() => { setActiveSymbol(sym); fetchMistralThesis(sym); }}
                                        className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all border ${activeSymbol === sym
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
                            className={`flex-1 py-2.5 text-[10px] font-bold tracking-widest transition-all flex items-center justify-center gap-1.5 ${activePanel === 'claude'
                                    ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-950/20'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            <Camera size={12} /> MISTRAL VISION
                        </button>
                        <button
                            onClick={() => setActivePanel('mistral')}
                            className={`flex-1 py-2.5 text-[10px] font-bold tracking-widest transition-all flex items-center justify-center gap-1.5 ${activePanel === 'mistral'
                                    ? 'text-orange-400 border-b-2 border-orange-500 bg-orange-950/20'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            <Newspaper size={12} /> MISTRAL NEWS
                        </button>
                    </div>

                    <div className="flex items-center justify-between px-4 py-2 bg-slate-900/40 border-b border-slate-800/60 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            {activePanel === 'claude' && claudeAnalysis && <BiasChip bias={claudeAnalysis.bias} />}
                            {activePanel === 'mistral' && mistralThesis && <BiasChip bias={mistralThesis.bias} />}
                            {!claudeAnalysis && !mistralThesis && (
                                <span className="text-[10px] text-slate-600 italic">No analysis yet</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {activePanel === 'claude' && (
                                <span className="text-[9px] text-violet-400 font-bold tracking-wider">MISTRAL VISION</span>
                            )}
                            {activePanel === 'mistral' && (
                                <span className="text-[9px] text-orange-400 font-bold tracking-wider">MISTRAL LARGE</span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
                        {activePanel === 'claude' ? renderClaudePanel() : renderMistralPanel()}
                    </div>

                    {activePanel === 'claude' && (
                        <form onSubmit={(e) => handleSendChatMessage(e)} className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center gap-2 shrink-0">
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
                                placeholder="Ask about this chart or paste an image here..."
                                disabled={isChatting}
                                className="flex-1 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                            />
                            <button 
                                type="submit" 
                                disabled={isChatting || (!chatInput.trim() && chatHistory.length === 0)}
                                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
                            >
                                SEND
                            </button>
                        </form>
                    )}

                    <div className="p-3 bg-red-950/20 border-t border-red-900/30 flex items-start gap-2 flex-shrink-0">
                        <AlertTriangle size={11} className="text-red-500/60 mt-0.5 shrink-0" />
                        <p className="text-[9px] text-slate-500 leading-tight">
                            AI analysis is for informational purposes only and does not constitute certified financial advice.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Symbol Specific Insights (2nd dashboard bottom tier 1) ── */}
            <div className="grid grid-cols-1 gap-5 mt-5">
                <div className="glass-panel p-5 flex flex-col rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="text-violet-400" size={20} /> {activeSymbol.split(':')[1] || activeSymbol} FUNDAMENTALS
                        </h2>
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">TRADINGVIEW</span>
                    </div>
                    <div className="w-full flex justify-center bg-[#131722] rounded-lg overflow-hidden border border-slate-800/50" style={{ height: '550px' }}>
                        <TradingViewFinancialsWidget symbol={activeSymbol} />
                    </div>
                </div>
            </div>

            {/* ── Additional Widgets (2nd Dashboard Bottom) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                {/* Stocks Today Widget */}
                <div className="glass-panel p-5 flex flex-col rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="text-violet-400" size={20} /> STOCKS TODAY
                        </h2>
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">TRADINGVIEW</span>
                    </div>
                    <div className="w-full flex justify-center bg-[#131722] rounded-lg overflow-hidden border border-slate-800/50" style={{ height: '550px' }}>
                        <TradingViewBSEWidget />
                    </div>
                </div>

                {/* Stock Heatmap Widget */}
                <div className="glass-panel p-5 flex flex-col rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="text-violet-400" size={20} /> SENSEX HEATMAP
                        </h2>
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">TRADINGVIEW</span>
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
