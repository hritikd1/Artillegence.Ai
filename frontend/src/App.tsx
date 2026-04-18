import { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react'
import {
  Activity, Radio, Cpu, Satellite, TrendingUp, Search,
  Lightbulb, BarChart3, ExternalLink, Flame, IndianRupee,
  ChevronRight, ChevronDown, RefreshCw, Clock, Globe,
  DollarSign, Eye, Newspaper, Zap, Target, ArrowRight, Shield
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TelegramFeed from './TelegramFeed'
import { apiGet, apiPost } from './api'

const ParticleGlobe = lazy(() => import('./ParticleGlobe'));
const EarthMap = lazy(() => import('./EarthMap'));
const ChartsTab = lazy(() => import('./ChartsTab'));

interface GeoEvent {
  id: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: string;
}

/* ─── Types ─── */

interface NewsItem {
  title: string;
  source: string;
  url: string;
  snippet?: string;
  image?: string;
  timestamp?: string;
}

interface LiveEvent {
  agent: string;
  title: string;
  summary: string;
  news_items?: NewsItem[];
  trending_items?: NewsItem[];
  market_items?: NewsItem[];
  sources?: NewsItem[];
  section?: string;
  action?: string;
  source_count?: number;
  news_count?: number;
  timestamp: string;
}

interface AgentInfo {
  status: string;
  last_run: string | null;
  cycle_count: number;
}

interface AnalysisSection {
  timestamp: string;
  analysis: string;
  news_count?: number;
  sources?: NewsItem[];
}

/* ─── Helpers ─── */

function getSourceDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return ''; }
}

function getSourceColor(source: string): string {
  const colors = [
    'from-sky-600 to-blue-800',
    'from-purple-600 to-indigo-800',
    'from-emerald-600 to-teal-800',
    'from-amber-600 to-orange-800',
    'from-rose-600 to-red-800',
    'from-cyan-600 to-blue-800',
    'from-pink-600 to-fuchsia-800',
  ];
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = source.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/* ─── Parsing helpers for visual charts ─── */

function parseSentimentScore(text: string): number | null {
  // Look for patterns like "SENTIMENT: Bearish" or "confidence score from 1-10" or "7/10"
  const match = text.match(/(?:confidence|score)[:\s]*(\d+)/i) || text.match(/(\d+)\s*\/\s*10/);
  if (match) return parseInt(match[1]);
  if (/bullish/i.test(text.slice(0, 200))) return 7;
  if (/bearish/i.test(text.slice(0, 200))) return 3;
  if (/neutral|mixed/i.test(text.slice(0, 200))) return 5;
  return null;
}

function parseSectorScores(text: string): { name: string; score: number }[] {
  const sectors: { name: string; score: number }[] = [];
  const sectorNames = ['IT', 'Banking', 'Pharma', 'Auto', 'Energy', 'FMCG', 'Infrastructure', 'Metals'];
  for (const name of sectorNames) {
    const regex = new RegExp(`${name}[:\\s]*(?:\\[)?(\\d+)(?:\\/10)?`, 'i');
    const match = text.match(regex);
    if (match) sectors.push({ name, score: parseInt(match[1]) });
  }
  return sectors;
}

/* ─── Main App ─── */

function App() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'news' | 'charts' | 'monitor'>('news');
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({});
  const [marketData, setMarketData] = useState<Record<string, AnalysisSection> | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [geoEvents, setGeoEvents] = useState<GeoEvent[]>([]);
  const [telegramData, setTelegramData] = useState<LiveEvent | null>(null);
  const [trendsData, setTrendsData] = useState<any>(null);
  const [signalData, setSignalData] = useState<any>(null);
  const [chainResult, setChainResult] = useState<any>(null);
  const [chainInput, setChainInput] = useState('');
  const [chainLoading, setChainLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Authentication check — run once on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('[AUTH] No token found, redirecting to login from Dashboard');
      navigate('/login', { replace: true });
    } else {
      console.log('[AUTH] Token found, validating session...');
      setAuthChecked(true);
    }
  }, [navigate]);

  // Buffer WS events — ALL hooks must be declared before any early return!
  const eventBufferRef = useRef<LiveEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushBuffer = useCallback(() => {
    if (eventBufferRef.current.length > 0) {
      const buffered = [...eventBufferRef.current];
      eventBufferRef.current = [];
      setEvents((prev) => [...prev, ...buffered]);
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    flushTimerRef.current = setInterval(flushBuffer, 500);
    return () => { if (flushTimerRef.current) clearInterval(flushTimerRef.current); };
  }, [flushBuffer, authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const token = localStorage.getItem('token');
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const ws = new WebSocket(
      `${wsProtocol}//${wsHost}/ws${token ? `?token=${token}` : ''}`
    );
    ws.onopen = () => setConnected(true);
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'geo_events_update') {
          setGeoEvents(data.events as GeoEvent[]);
        } else if (data.type === 'geo_event') {
          setGeoEvents(prev => {
            const exists = prev.some(e => e.id === data.id);
            if (exists) return prev.map(e => e.id === data.id ? data as GeoEvent : e);
            return [...prev, data as GeoEvent].slice(-12);
          });
        } else {
          eventBufferRef.current.push(data);
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    return () => ws.close();
  }, [authChecked]);

  // Load initial geo events
  useEffect(() => {
    if (!authChecked) return;
    const poll = async () => {
      try {
        const data = await apiGet<any>('/api/geo/events');
        if (Array.isArray(data)) setGeoEvents(data);
      } catch { /* */ }
    };
    poll(); const id = setInterval(poll, 30000); return () => clearInterval(id);
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const poll = async () => {
      try { setAgents(await apiGet<any>('/api/agents/status')); }
      catch { /* */ }
    };
    poll(); const id = setInterval(poll, 10000); return () => clearInterval(id);
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const poll = async () => {
      try {
        const data = await apiGet<any>('/api/market/analysis');
        if (!data.status && !data.error) setMarketData(data);
      } catch { /* */ }
    };
    poll(); const id = setInterval(poll, 60000); return () => clearInterval(id);
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const poll = async () => {
      try {
        const data = await apiGet<any>('/api/telegram/status');
        if (!data.status && !data.error) setTelegramData(data);
      } catch { /* */ }
    };
    poll(); const id = setInterval(poll, 60000); return () => clearInterval(id);
  }, [authChecked]);

  // Fetch Google Trends data
  useEffect(() => {
    if (!authChecked) return;
    const poll = async () => {
      try {
        const data = await apiGet<any>('/api/google-trends');
        if (!data.status && !data.error) setTrendsData(data);
      } catch { /* */ }
    };
    poll(); const id = setInterval(poll, 60000); return () => clearInterval(id);
  }, [authChecked]);

  // Fetch Signal scorecard
  useEffect(() => {
    if (!authChecked) return;
    const poll = async () => {
      try {
        const data = await apiGet<any>('/api/signals');
        if (!data.error) setSignalData(data);
      } catch { /* */ }
    };
    poll(); const id = setInterval(poll, 30000); return () => clearInterval(id);
  }, [authChecked]);

  // Event Chain Prediction handler
  const handlePredictChain = async () => {
    if (!chainInput.trim()) return;
    setChainLoading(true);
    setChainResult(null);
    try {
      const data = await apiPost<any>('/api/predict_chain', { event_text: chainInput });
      setChainResult(data);
    } catch (err) {
      setChainResult({ error: 'Failed to connect to Artillegence AI' });
    } finally {
      setChainLoading(false);
    }
  };

  // Fetch initial widget states on mount
  useEffect(() => {
    if (!authChecked) return;
    const loadWidgets = async () => {
      try {
        const [optRes, trdRes, indRes] = await Promise.all([
          apiGet<any>('/api/opportunities').catch(() => null),
          apiGet<any>('/api/trending').catch(() => null),
          apiGet<any>('/api/indian-market').catch(() => null)
        ]);

        const newEvents: LiveEvent[] = [];
        if (optRes && !optRes.status && !optRes.error) newEvents.push(optRes);
        if (trdRes && !trdRes.status && !trdRes.error) newEvents.push(trdRes);
        if (indRes && !indRes.status && !indRes.error) newEvents.push(indRes);

        if (newEvents.length > 0) {
          setEvents(prev => {
            const existingIds = new Set(prev.map(e => e.agent));
            const uniqueNew = newEvents.filter(e => !existingIds.has(e.agent));
            return [...prev, ...uniqueNew];
          });
        }
      } catch { /* ignore */ }
    };
    loadWidgets();
  }, [authChecked]);

  // ── Guard: Don't render dashboard until auth is confirmed ──
  if (!authChecked) return null;

  const latestNewsScan = [...events].reverse().find(e => e.agent === 'news_scanner');
  const latestTrending = [...events].reverse().find(e => e.agent === 'trending_tracker');
  const latestIndianMarket = [...events].reverse().find(e => e.agent === 'indian_market_tracker');
  const latestOpportunity = [...events].reverse().find(e => e.agent === 'opportunity_finder');
  const latestTelegram = [...events].reverse().find(e => e.agent === 'telegram_scanner');
  const marketAnalyzerEvents = events.filter(e => e.agent === 'market_analyzer');

  const AGENT_KEYS = ['news_scanner', 'market_analyzer', 'opportunity_finder', 'trending_tracker', 'indian_market_tracker', 'google_trends_tracker'] as const;

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6">
      {/* Top Ticker Widget */}
      <TradingViewTickerTape />

      {/* Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-2 mt-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-1 flex items-center gap-3 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]">
            <img src="/logo-icon.png" alt="Artillegence AI" className="w-10 h-10 min-w-[40px] flex-shrink-0 object-cover rounded-lg shadow-[0_0_15px_rgba(56,189,248,0.4)]" />
            Artillegence <span className="text-neonBlue font-light">Intelligence</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium">AI-Powered Stock Market News Intelligence System</p>
        </div>
        <div className="glass-panel px-5 py-2 mt-3 md:mt-0 flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neonBlue opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${connected ? 'bg-neonBlue' : 'bg-red-500'}`}></span>
          </div>
          <span className="text-xs font-semibold tracking-wider text-slate-300">
            {connected ? 'SYSTEM ONLINE' : 'CONNECTING...'}
          </span>
        </div>
      </header>

      {/* ── Tab Navigation Bar ── */}
      <nav className="flex items-center gap-2 mt-4 border-b border-slate-800 pb-[1px]">
        <button
          onClick={() => setActiveTab('news')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'news' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-slate-800/60 shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30 border-b-[3px] border-transparent'}`}
        >
          WORLD NEWS
        </button>
        <button
          onClick={() => setActiveTab('charts')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'charts' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-slate-800/60 shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30 border-b-[3px] border-transparent'}`}
        >
          CHARTS
        </button>
        <button
          onClick={() => setActiveTab('monitor')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'monitor' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-slate-800/60 shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30 border-b-[3px] border-transparent'}`}
        >
          MONITOR
        </button>
      </nav>

      <div className={activeTab === 'news' ? 'flex flex-col gap-6 animate-fade-in' : 'hidden'}>
        {/* ── Globe Map + Telegram Feed ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 glass-panel overflow-hidden" style={{ minHeight: '500px' }}>
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <Radio className="animate-pulse text-neonBlue" size={32} />
                <span className="text-slate-500 ml-3">Loading Earth Map...</span>
              </div>
            }>
              <ParticleGlobe events={geoEvents} />
            </Suspense>
          </div>
          <div className="lg:col-span-1">
            <TelegramFeed data={latestTelegram || telegramData} />
          </div>
        </div>

        {/* Top Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="flex flex-col gap-4 lg:col-span-1">
            <div className="glass-panel p-4">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2 tracking-wider">
                <Cpu className="text-neonPurple" size={16} /> AI AGENTS
              </h2>
              <div className="space-y-2">
                {AGENT_KEYS.map((key) => <AgentCard key={key} agentKey={key} info={agents[key]} />)}
              </div>
            </div>
            <div className="glass-panel p-4 text-center">
              <div className="text-4xl font-black text-neonBlue drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">{events.length}</div>
              <div className="text-xs text-slate-500 mt-1">intelligence events</div>
            </div>
          </div>

          {/* Market Summary */}
          <div className="glass-panel p-5 lg:col-span-3 flex flex-col" style={{ maxHeight: '520px' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Satellite className="text-neonBlue" size={18} /> LIVE MARKET BRIEFING
              </h2>
              {latestNewsScan && <span className="text-xs text-slate-500 flex items-center gap-1"><RefreshCw size={10} /> Every 5 min</span>}
            </div>
            <div className="flex-1 overflow-y-auto mb-4 pr-1">
              {latestNewsScan ? (
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{latestNewsScan.summary}</p>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-slate-500 opacity-60">
                  <Radio className="animate-pulse mb-2" size={32} />
                  <p className="text-sm">News Scanner booting up... first briefing in ~1 minute</p>
                </div>
              )}
            </div>
            {latestNewsScan?.news_items && latestNewsScan.news_items.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 tracking-widest mb-2">NEWS SOURCES</h3>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {latestNewsScan.news_items.map((item, i) => <NewsCard key={i} item={item} />)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Advanced Features Row (Google Trends / Signal Tracker / Event Chain) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Google Trends Intelligence */}
          <GoogleTrendsWidget data={trendsData} />

          {/* Signal Accuracy Scorecard */}
          <SignalScorecard data={signalData} />

          {/* Event Chain Prediction */}
          <EventChainPredictor
            chainInput={chainInput}
            setChainInput={setChainInput}
            chainLoading={chainLoading}
            chainResult={chainResult}
            onPredict={handlePredictChain}
          />
        </div>

        {/* Indian Market + Trending */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AgentSection
            icon={<IndianRupee className="text-orange-400" size={20} />}
            title="INDIAN MARKET TRACKER" subtitle="Live Nifty, Sensex, sectoral tracking"
            accentColor="orange" event={latestIndianMarket} items={latestIndianMarket?.market_items}
            placeholder="Indian Market Tracker will start tracking in ~10 seconds..."
          />
          <AgentSection
            icon={<Flame className="text-rose-400" size={20} />}
            title="TRENDING NOW" subtitle="What's buzzing in the market"
            accentColor="rose" event={latestTrending} items={latestTrending?.trending_items}
            placeholder="Trending Tracker scanning market buzz..."
          />
        </div>

        {/* News Grid (Bottom) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          <AgentSection
            icon={<Flame size={16} />} title="TRENDING GEOPOLITICS" subtitle="High Engagement" accentColor="orange"
            event={latestTrending} items={latestTrending?.trending_items} placeholder="Analyzing global focus areas..." fullWidth
          />
          <AgentSection
            icon={<Lightbulb size={16} />} title="STRATEGIC OPPORTUNITIES" subtitle="Deep Insight" accentColor="emerald"
            event={latestOpportunity} items={latestOpportunity?.sources} placeholder="Calculating multi-order impacts..." fullWidth
          />
        </div>

        {/* Opportunity Finder */}
        <AgentSection
          icon={<Lightbulb className="text-emerald-400" size={20} />}
          title="INVESTMENT OPPORTUNITIES" subtitle="AI-picked stocks based on cross-referenced analysis"
          accentColor="emerald" event={latestOpportunity} items={undefined}
          placeholder="Opportunity Finder agent is analyzing markets..." fullWidth
        />

        {/* Market Deep Dive / Stocks Today */}
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="text-neonPurple" size={20} /> STOCKS TODAY
            </h2>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">TRADINGVIEW</span>
          </div>

          {/* Stocks Today Widget */}
          <div className="mb-8 w-full border border-slate-800/50 rounded-lg overflow-hidden bg-[#131722]">
            <TradingViewHotlists />
          </div>

          <div className="flex items-center justify-between mb-5 mt-10 border-t border-slate-800/50 pt-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="text-neonBlue" size={20} /> MARKET DEEP DIVE
            </h2>
            <span className="text-xs text-slate-500 flex items-center gap-1"><RefreshCw size={10} /> Every 2 hrs</span>
          </div>

          {/* Expandable Analysis Cards */}
          {marketData && Object.keys(marketData!).length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(marketData!).map(([key, section]: [string, AnalysisSection]) => {
                const title = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                const isExpanded = expandedSection === key;
                const icons: Record<string, React.ReactNode> = {
                  'market_overview': <TrendingUp size={14} className="text-neonBlue" />,
                  'global_impact': <Globe size={14} className="text-green-400" />,
                  'fii_dii_data': <DollarSign size={14} className="text-neonPurple" />,
                  'sectoral_analysis': <BarChart3 size={14} className="text-amber-400" />,
                  'raw_materials': <Activity size={14} className="text-orange-400" />,
                  'company_performance': <Lightbulb size={14} className="text-emerald-400" />,
                };
                return (
                  <div key={key} className="glass-panel p-4 text-left hover:border-neonBlue/20 transition-all">
                    <div className="flex items-center justify-between mb-2 cursor-pointer"
                      onClick={() => setExpandedSection(isExpanded ? null : key)}>
                      <div className="flex items-center gap-2">
                        {icons[key] || <Eye size={14} className="text-slate-400" />}
                        <h4 className="text-sm font-bold text-neonBlue uppercase tracking-wider">{title}</h4>
                      </div>
                      {isExpanded
                        ? <ChevronDown size={14} className="text-slate-500" />
                        : <ChevronRight size={14} className="text-slate-500" />}
                    </div>

                    <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line"
                      style={isExpanded ? {} : { maxHeight: '100px', overflow: 'hidden' }}>
                      {section.analysis}
                    </div>
                    {!isExpanded && <div className="h-6 bg-gradient-to-t from-[rgba(11,25,44,0.95)] to-transparent -mt-6 relative z-10"></div>}

                    {/* Source Citations */}
                    {section.sources && section.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-800/50">
                        <span className="text-[9px] font-bold text-slate-500 tracking-widest">SOURCES</span>
                        <div className="mt-1 space-y-1">
                          {section.sources.slice(0, isExpanded ? 5 : 2).map((src, i) => (
                            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 truncate">
                              <ExternalLink size={8} className="flex-shrink-0" />
                              <span className="truncate">{src.title}</span>
                              <span className="text-slate-600 flex-shrink-0">— {src.source}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] text-slate-500 flex items-center gap-1">
                        <Clock size={8} />
                        {new Date(section.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {section.news_count && <span className="text-[9px] text-slate-500">· {section.news_count} articles analyzed</span>}
                      <span className="text-[9px] text-neonBlue ml-auto cursor-pointer"
                        onClick={() => setExpandedSection(isExpanded ? null : key)}>
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <BarChart3 className="mx-auto mb-3 opacity-40" size={36} />
              <p className="text-sm">Market Analyzer is running its first deep analysis cycle...</p>
            </div>
          )}
        </div>

        {/* Activity Log */}
        {
          marketAnalyzerEvents.length > 0 && (
            <div className="glass-panel p-5">
              <h2 className="text-sm font-bold text-white mb-4 tracking-wider flex items-center gap-2">
                <Activity className="text-green-400" size={16} /> RECENT UPDATES
              </h2>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {marketAnalyzerEvents.slice(-6).reverse().map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 bg-slate-900/40 rounded-lg border border-slate-800/50">
                    <BarChart3 size={12} className="text-purple-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-white">{ev.title}</span>
                        <span className="text-[9px] text-slate-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{ev.summary.substring(0, 150)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }
      </div>

      {/* ChartsTab is ALWAYS mounted to prevent TradingView widget from reloading on tab switch */}
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center p-20 glass-panel h-[700px]">
          <Activity className="animate-pulse text-neonBlue mb-4" size={48} />
          <span className="text-slate-400 font-bold tracking-widest">LOADING TRADING/AI ANALYST...</span>
        </div>
      }>
        <div style={{ display: activeTab === 'charts' ? 'block' : 'none' }}>
          <ChartsTab />
        </div>
      </Suspense>

      {activeTab === 'monitor' && (
        <div className="flex flex-col items-center justify-center p-20 glass-panel h-[700px] animate-fade-in border-dashed border-2 border-slate-700/50">
          <Globe className="animate-pulse text-slate-600 mb-6" size={64} />
          <h2 className="text-2xl font-black text-slate-500 mb-2">MONITOR DASHBOARD</h2>
          <span className="text-slate-600 font-bold tracking-widest text-sm">CONSTRUCTION IN PROGRESS</span>
        </div>
      )}

    </div>
  );
}

/* ═══════════════════════════════════════ */
/* Visual Chart Components                */
/* ═══════════════════════════════════════ */

export function SentimentGauge({ analysis }: { analysis: string }) {
  const score = parseSentimentScore(analysis) ?? 5;
  const label = score >= 7 ? 'BULLISH' : score <= 3 ? 'BEARISH' : 'MIXED';
  const color = score >= 7 ? 'text-emerald-400' : score <= 3 ? 'text-red-400' : 'text-amber-400';
  const bgColor = score >= 7 ? 'bg-emerald-400' : score <= 3 ? 'bg-red-400' : 'bg-amber-400';
  const pct = (score / 10) * 100;

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={16} className="text-neonBlue" />
        <h3 className="text-xs font-bold tracking-wider text-slate-100">MARKET SENTIMENT</h3>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-[9px] text-slate-500 mb-1">
            <span>Bearish</span><span>Neutral</span><span>Bullish</span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden relative">
            <div className="absolute inset-0 flex">
              <div className="w-[30%] bg-gradient-to-r from-red-500/30 to-red-500/10"></div>
              <div className="w-[40%] bg-gradient-to-r from-amber-500/10 to-amber-500/10"></div>
              <div className="w-[30%] bg-gradient-to-r from-emerald-500/10 to-emerald-500/30"></div>
            </div>
            <div className={`h-full ${bgColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }}></div>
          </div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-black ${color}`}>{score}</div>
          <div className={`text-[9px] font-bold ${color}`}>{label}</div>
        </div>
      </div>
    </div>
  );
}

export function SectorHeatMap({ analysis }: { analysis: string }) {
  const sectors = parseSectorScores(analysis);
  if (sectors.length === 0) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-amber-400" />
          <h3 className="text-xs font-bold tracking-wider text-slate-100">SECTOR HEAT MAP</h3>
        </div>
        <p className="text-[10px] text-slate-500">Sectors loading... will appear after Market Analyzer completes.</p>
      </div>
    );
  }

  const getColor = (s: number) =>
    s >= 8 ? 'bg-emerald-500' : s >= 6 ? 'bg-emerald-600/70' : s >= 5 ? 'bg-amber-500/70' : s >= 3 ? 'bg-orange-500/70' : 'bg-red-500/70';
  const getTextColor = (s: number) =>
    s >= 8 ? 'text-emerald-300' : s >= 6 ? 'text-emerald-400' : s >= 5 ? 'text-amber-300' : s >= 3 ? 'text-orange-300' : 'text-red-300';

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={16} className="text-amber-400" />
        <h3 className="text-xs font-bold tracking-wider text-slate-100">SECTOR HEAT MAP</h3>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {sectors.map((s) => (
          <div key={s.name} className={`${getColor(s.score)} rounded-lg p-2 text-center transition-all hover:scale-105`}>
            <div className="text-[9px] font-bold text-white">{s.name}</div>
            <div className={`text-lg font-black ${getTextColor(s.score)}`}>{s.score}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[8px] text-slate-600">
        <span>🔴 Weak</span><span>🟡 Neutral</span><span>🟢 Strong</span>
      </div>
    </div>
  );
}

export function FIIDIIFlow({ analysis }: { analysis: string }) {
  const isFIIBuying = /fii[:\s]*(?:stance[:\s]*)?buy/i.test(analysis);
  const isFIISelling = /fii[:\s]*(?:stance[:\s]*)?sell/i.test(analysis);
  const isDIIBuying = /dii[:\s]*(?:stance[:\s]*)?buy/i.test(analysis);
  const isDIISelling = /dii[:\s]*(?:stance[:\s]*)?sell/i.test(analysis);

  const fiiDirection = isFIIBuying ? 'Buying' : isFIISelling ? 'Selling' : 'Mixed';
  const diiDirection = isDIIBuying ? 'Buying' : isDIISelling ? 'Selling' : 'Mixed';

  const fiiColor = isFIIBuying ? 'bg-emerald-500' : isFIISelling ? 'bg-red-500' : 'bg-amber-500';
  const diiColor = isDIIBuying ? 'bg-emerald-500' : isDIISelling ? 'bg-red-500' : 'bg-amber-500';
  const fiiTextColor = isFIIBuying ? 'text-emerald-400' : isFIISelling ? 'text-red-400' : 'text-amber-400';
  const diiTextColor = isDIIBuying ? 'text-emerald-400' : isDIISelling ? 'text-red-400' : 'text-amber-400';

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign size={16} className="text-neonPurple" />
        <h3 className="text-xs font-bold tracking-wider text-slate-100">INSTITUTIONAL FLOWS</h3>
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-400 font-medium">FII (Foreign)</span>
            <span className={`font-bold ${fiiTextColor}`}>{fiiDirection}</span>
          </div>
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${fiiColor} rounded-full transition-all duration-500`}
              style={{ width: isFIIBuying ? '75%' : isFIISelling ? '25%' : '50%' }}></div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-400 font-medium">DII (Domestic)</span>
            <span className={`font-bold ${diiTextColor}`}>{diiDirection}</span>
          </div>
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${diiColor} rounded-full transition-all duration-500`}
              style={{ width: isDIIBuying ? '75%' : isDIISelling ? '25%' : '50%' }}></div>
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-2 text-[8px] text-slate-600">
        <span>← Net Selling</span><span>Net Buying →</span>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════ */
/* News Card with Thumbnail                */
/* ═══════════════════════════════════════ */

function NewsCard({ item }: { item: NewsItem }) {
  const [imgError, setImgError] = useState(false);
  const domain = getSourceDomain(item.url);
  const gradientClass = getSourceColor(item.source);
  const hasImage = item.image && !imgError;
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';

  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      className="flex-shrink-0 w-56 bg-slate-900/60 rounded-lg border border-slate-800 hover:border-neonBlue/50 transition-all duration-200 group overflow-hidden">
      {hasImage ? (
        <div className="w-full h-28 overflow-hidden bg-slate-800">
          <img src={item.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)} />
        </div>
      ) : (
        <div className={`w-full h-20 bg-gradient-to-br ${gradientClass} flex items-center justify-center relative`}>
          {faviconUrl && (
            <img src={faviconUrl} alt="" className="w-6 h-6 rounded opacity-80" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <Newspaper size={20} className="text-white/30 absolute right-2 bottom-2" />
        </div>
      )}
      <div className="p-2.5">
        <p className="text-[11px] text-white font-medium line-clamp-2 group-hover:text-neonBlue transition leading-tight">{item.title}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-sky-400 truncate max-w-[120px]">{item.source}</span>
          <ExternalLink size={8} className="text-slate-600 group-hover:text-neonBlue flex-shrink-0" />
        </div>
      </div>
    </a>
  );
}


/* ═══════════════════════════════════════ */
/* Agent Status Card                       */
/* ═══════════════════════════════════════ */

function AgentCard({ agentKey, info }: { agentKey: string; info?: AgentInfo }) {
  const configs: Record<string, { icon: React.ReactNode; label: string }> = {
    news_scanner: { icon: <Search size={12} />, label: 'NEWS SCANNER' },
    market_analyzer: { icon: <BarChart3 size={12} />, label: 'MARKET ANALYZER' },
    opportunity_finder: { icon: <Lightbulb size={12} />, label: 'OPPORTUNITY FINDER' },
    trending_tracker: { icon: <Flame size={12} />, label: 'TRENDING TRACKER' },
    indian_market_tracker: { icon: <IndianRupee size={12} />, label: 'MARKET TRACKER 🇮🇳' },
    google_trends_tracker: { icon: <TrendingUp size={12} />, label: 'GOOGLE TRENDS 📈' },
  };
  const cfg = configs[agentKey] || { icon: <Cpu size={12} />, label: agentKey };
  const status = info?.status || 'waiting';
  const statusStyle = status === 'active' ? 'text-neonBlue bg-neonBlue/20'
    : status === 'idle' ? 'text-amber-400 bg-amber-400/20'
      : status === 'error' ? 'text-red-500 bg-red-500/20'
        : 'text-slate-500 bg-slate-500/20';

  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/50">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-400 flex-shrink-0">{cfg.icon}</span>
        <div className="min-w-0">
          <span className="text-[11px] font-medium text-slate-200 block truncate">{cfg.label}</span>
          {info?.last_run && (
            <span className="text-[9px] text-slate-500">
              #{info.cycle_count} · {new Date(info.last_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
      <div className={`px-2 py-0.5 text-[9px] font-bold rounded flex items-center gap-1 flex-shrink-0 ${statusStyle}`}>
        {status === 'active' && <div className="h-1.5 w-1.5 rounded-full bg-neonBlue animate-pulse"></div>}
        {status.toUpperCase()}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════ */
/* Agent Section (Reusable)                */
/* ═══════════════════════════════════════ */

function AgentSection({
  icon, title, subtitle, accentColor, event, items, placeholder, fullWidth
}: {
  icon: React.ReactNode; title: string; subtitle: string; accentColor: string;
  event?: LiveEvent; items?: NewsItem[]; placeholder: string; fullWidth?: boolean;
}) {
  const borderColors: Record<string, string> = {
    orange: 'border-orange-500/30', rose: 'border-rose-500/30',
    emerald: 'border-emerald-500/30', purple: 'border-purple-500/30',
  };

  return (
    <div className={`glass-panel p-5 ${borderColors[accentColor] || ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">{icon}{title}</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        {event && (
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Clock size={10} />
            {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {event ? (
        <div>
          <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line mb-4"
            style={{ maxHeight: fullWidth ? '400px' : '250px', overflow: 'auto' }}>
            {event.summary}
          </div>

          {/* Source citations */}
          {event.sources && event.sources.length > 0 && (
            <div className="mb-3 pt-2 border-t border-slate-800/50">
              <span className="text-[9px] font-bold text-slate-500 tracking-widest">CITED SOURCES</span>
              <div className="mt-1 space-y-1">
                {event.sources.slice(0, 3).map((src, i) => (
                  <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 truncate">
                    <ExternalLink size={8} className="flex-shrink-0" />
                    <span className="truncate">{src.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {items && items.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-slate-500 tracking-widest mb-2 mt-2">RELATED NEWS / MEDIA</h3>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {items.map((item, i) => (
                  <NewsCard key={i} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 text-center text-slate-500 opacity-60">
          <Radio className="mx-auto animate-pulse mb-2" size={24} />
          <p className="text-xs">{placeholder}</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* ADVANCED: Google Trends Widget           */
/* ═══════════════════════════════════════ */

function GoogleTrendsWidget({ data }: { data: any }) {
  const trendItems = data?.trend_items || [];
  const trendingSearches = data?.trending_searches || [];
  const spikeCount = data?.spike_count || 0;

  return (
    <div className="glass-panel p-5 flex flex-col" style={{ maxHeight: '480px' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <TrendingUp className="text-green-400" size={16} /> GOOGLE TRENDS
        </h2>
        {spikeCount > 0 && (
          <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full animate-pulse">
            🔥 {spikeCount} SPIKE{spikeCount > 1 ? 'S' : ''}
          </span>
        )}
      </div>

      {trendItems.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-2 mb-3 scrollbar-thin">
          {trendItems.map((item: any, i: number) => {
            const barWidth = Math.min(item.current_interest, 100);
            const barColor = item.is_spiking ? 'bg-red-500' : item.trend_direction === 'UP' ? 'bg-emerald-500' : item.trend_direction === 'DOWN' ? 'bg-amber-500' : 'bg-sky-500';
            return (
              <div key={i} className={`p-2.5 rounded-lg border ${item.is_spiking ? 'bg-red-950/30 border-red-500/30' : 'bg-slate-900/40 border-slate-800/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-white truncate max-w-[180px]">{item.keyword}</span>
                  <span className={`text-[10px] font-bold ${item.is_spiking ? 'text-red-400' : item.trend_direction === 'UP' ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {item.spike_ratio}x {item.is_spiking && '🔥'}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${barWidth}%` }}></div>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-slate-500">now: {item.current_interest}</span>
                  <span className="text-[9px] text-slate-500">avg: {item.avg_interest}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <TrendingUp className="mx-auto mb-2 opacity-40" size={28} />
            <p className="text-xs">Trends agent starting up...</p>
          </div>
        </div>
      )}

      {trendingSearches.length > 0 && (
        <div className="border-t border-slate-800 pt-3 mt-auto">
          <span className="text-[9px] font-bold text-slate-500 tracking-widest">TRENDING IN INDIA</span>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {trendingSearches.slice(0, 8).map((t: any, i: number) => (
              <span key={i} className="text-[9px] bg-slate-800/60 text-slate-300 px-2 py-1 rounded border border-slate-700/50">
                #{t.rank} {t.term}
              </span>
            ))}
          </div>
        </div>
      )}

      {data?.summary && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-3">{data.summary.substring(0, 200)}...</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* ADVANCED: Signal Accuracy Scorecard     */
/* ═══════════════════════════════════════ */

function SignalScorecard({ data }: { data: any }) {
  const accuracy = data?.accuracy_pct || 0;
  const total = data?.total_signals || 0;
  const verified = data?.verified_signals || 0;
  const correct = data?.correct_signals || 0;
  const pending = data?.pending_verification || 0;
  const recentSignals = data?.recent_signals || [];

  const accuracyColor = accuracy >= 65 ? 'text-emerald-400' : accuracy >= 50 ? 'text-amber-400' : accuracy > 0 ? 'text-red-400' : 'text-slate-500';
  const accuracyBg = accuracy >= 65 ? 'bg-emerald-500' : accuracy >= 50 ? 'bg-amber-500' : accuracy > 0 ? 'bg-red-500' : 'bg-slate-600';

  return (
    <div className="glass-panel p-5 flex flex-col" style={{ maxHeight: '480px' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Target className="text-violet-400" size={16} /> SIGNAL TRACKER
        </h2>
        <span className="text-[10px] text-slate-500">{total} signals logged</span>
      </div>

      {/* Accuracy Gauge */}
      <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-bold text-slate-500 tracking-widest">ARTILLEGENCE ACCURACY</span>
          <span className={`text-2xl font-black ${accuracyColor}`}>{verified > 0 ? `${accuracy}%` : '—'}</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${accuracyBg} rounded-full transition-all duration-1000`} style={{ width: `${accuracy}%` }}></div>
        </div>
        <div className="flex justify-between mt-2 text-[9px] text-slate-500">
          <span>✅ {correct} correct</span>
          <span>❌ {verified - correct} wrong</span>
          <span>⏳ {pending} pending</span>
        </div>
      </div>

      {/* Recent Signals */}
      <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
        <span className="text-[9px] font-bold text-slate-500 tracking-widest">RECENT SIGNALS</span>
        {recentSignals.length > 0 ? recentSignals.map((sig: any, i: number) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded bg-slate-900/40 border border-slate-800/50">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              sig.direction === 'BULLISH' ? 'bg-emerald-400' : sig.direction === 'BEARISH' ? 'bg-red-400' : 'bg-slate-400'
            }`}></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white font-medium truncate">{sig.target}</span>
                <span className={`text-[9px] font-bold ${
                  sig.correct === true ? 'text-emerald-400' : sig.correct === false ? 'text-red-400' : 'text-slate-500'
                }`}>
                  {sig.correct === true ? '✅' : sig.correct === false ? '❌' : '⏳'}
                </span>
              </div>
              <span className={`text-[9px] ${
                sig.direction === 'BULLISH' ? 'text-emerald-500' : sig.direction === 'BEARISH' ? 'text-red-500' : 'text-slate-500'
              }`}>{sig.direction} · {sig.confidence}</span>
            </div>
          </div>
        )) : (
          <div className="text-center py-4 text-slate-500">
            <Target className="mx-auto mb-2 opacity-40" size={20} />
            <p className="text-[10px]">Signals will appear as agents generate predictions</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* ADVANCED: Event Chain Predictor         */
/* ═══════════════════════════════════════ */

function EventChainPredictor({ chainInput, setChainInput, chainLoading, chainResult, onPredict }: {
  chainInput: string;
  setChainInput: (v: string) => void;
  chainLoading: boolean;
  chainResult: any;
  onPredict: () => void;
}) {
  const dirColor = (d: string) => d === 'UP' ? 'text-emerald-400' : d === 'DOWN' ? 'text-red-400' : 'text-amber-400';
  const dirBg = (d: string) => d === 'UP' ? 'bg-emerald-500/20 border-emerald-500/40' : d === 'DOWN' ? 'bg-red-500/20 border-red-500/40' : 'bg-amber-500/20 border-amber-500/40';

  return (
    <div className="glass-panel p-5 flex flex-col" style={{ maxHeight: '480px' }}>
      <div className="flex items-center gap-2 mb-4">
        <Zap className="text-amber-400" size={16} />
        <h2 className="text-sm font-bold text-white">EVENT CHAIN PREDICTION</h2>
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={chainInput}
          onChange={(e) => setChainInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onPredict()}
          placeholder="e.g. Iran blocks Strait of Hormuz..."
          className="flex-1 bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
        />
        <button
          onClick={onPredict}
          disabled={chainLoading || !chainInput.trim()}
          className="px-3 py-2 bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50 rounded-lg text-white text-[10px] font-bold tracking-wider border border-amber-500/50 flex items-center gap-1"
        >
          {chainLoading ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
          {chainLoading ? 'PREDICTING...' : 'PREDICT'}
        </button>
      </div>

      {/* Chain Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {chainLoading && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-3"></div>
            <p className="text-xs text-amber-300 animate-pulse tracking-widest">MODELING CASCADE...</p>
          </div>
        )}

        {chainResult && !chainLoading && (
          <div className="space-y-2 animate-fade-in">
            {/* Header */}
            {chainResult.event && (
              <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold text-amber-400 tracking-widest">TRIGGER EVENT</span>
                  {chainResult.severity && (
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                      chainResult.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                      chainResult.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' :
                      'bg-slate-700 text-slate-300 border border-slate-600'
                    }`}>{chainResult.severity}</span>
                  )}
                </div>
                <p className="text-xs text-white font-medium">{chainResult.event}</p>
              </div>
            )}

            {/* Chain Steps */}
            {chainResult.chain?.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex flex-col items-center flex-shrink-0 mt-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border ${dirBg(step.direction)}`}>
                    {step.step}
                  </div>
                  {i < (chainResult.chain?.length || 0) - 1 && <div className="w-0.5 h-4 bg-slate-700 mt-1"></div>}
                </div>
                <div className={`flex-1 p-2.5 rounded-lg border ${dirBg(step.direction)}`}>
                  <p className="text-[11px] text-white font-medium mb-1">{step.impact}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-slate-300">{step.affected}</span>
                    <ArrowRight size={8} className="text-slate-600" />
                    <span className={`text-[9px] font-bold ${dirColor(step.direction)}`}>{step.direction} {step.magnitude}</span>
                    <span className="text-[8px] text-slate-500">({step.probability} prob · {step.timeframe})</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Affected Indian Stocks */}
            {chainResult.indian_stocks_affected?.length > 0 && (
              <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800 mt-2">
                <span className="text-[9px] font-bold text-sky-400 tracking-widest">INDIAN STOCKS AFFECTED</span>
                <div className="mt-2 space-y-1">
                  {chainResult.indian_stocks_affected.map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="text-white font-medium">{s.name} <span className="text-slate-500">({s.ticker})</span></span>
                      <span className={s.impact === 'POSITIVE' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                        {s.impact === 'POSITIVE' ? '📈' : '📉'} {s.impact}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hedge Suggestion */}
            {chainResult.hedge_suggestion && (
              <div className="bg-indigo-950/30 rounded-lg p-3 border border-indigo-800/40 flex items-start gap-2">
                <Shield size={12} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-slate-300 leading-relaxed">{chainResult.hedge_suggestion}</p>
              </div>
            )}

            {chainResult.error && (
              <p className="text-xs text-red-400">{chainResult.error}</p>
            )}
          </div>
        )}

        {!chainResult && !chainLoading && (
          <div className="flex flex-col items-center justify-center py-6 text-slate-500">
            <Zap className="mb-2 opacity-40" size={28} />
            <p className="text-[10px] text-center max-w-[200px]">Enter a geopolitical event to predict its cascading impact on Indian markets</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TradingViewTickerTape() {
  useEffect(() => {
    if (!document.getElementById("tv-ticker-tape")) {
      const script = document.createElement("script");
      script.id = "tv-ticker-tape";
      script.src = "https://widgets.tradingview-widget.com/w/en/tv-ticker-tape.js";
      script.type = "module";
      document.body.appendChild(script);
    }
  }, []);
  return (
    <div className="w-full mb-2">
      {/* @ts-ignore */}
      <tv-ticker-tape symbols="NSE:NIFTY,NSE:BANKNIFTY,BSE:SENSEX,BSE:RELIANCE,BSE:TCS,BSE:HDFCBANK,BSE:ICICIBANK,BSE:INFY,BSE:SBIN,BSE:BHARTIARTL" colorTheme="dark" isTransparent="true"></tv-ticker-tape>
    </div>
  );
}

function TradingViewHotlists() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (container.current && container.current.getElementsByTagName("script").length === 0) {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-hotlists.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        "exchange": "BSE",
        "colorTheme": "dark",
        "dateRange": "12M",
        "showChart": true,
        "locale": "en",
        "largeChartUrl": "",
        "isTransparent": true,
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
      container.current.appendChild(script);
    }
  }, []);
  return (
    <div className="tradingview-widget-container w-full" style={{height: 550}} ref={container}>
      <div className="tradingview-widget-container__widget h-full w-full"></div>
    </div>
  );
}

export default App
