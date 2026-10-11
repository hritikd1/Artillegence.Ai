import { useState, useEffect } from 'react';
import {
  Compass, Globe, RefreshCw, Zap, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, Search, Calendar, ShieldCheck,
  ExternalLink, Sparkles, Filter, CheckCircle2
} from 'lucide-react';
import { apiFetch } from './api';

interface StockMatch {
  symbol: string;
  name: string;
  status: 'CROSSED_30' | 'ABOVE_30' | 'NEAR_30';
  plus_di: number;
  minus_di: number;
  adx: number;
  adx_rising: boolean;
  crossed_days_ago: number | null;
  price: number;
  above_ema20: boolean;
  pct_from_52w_high: number;
  score: number;
  themes?: string[];
}

interface ThemeItem {
  theme: string;
  rationale: string;
  window: string;
  confidence: 'High' | 'Medium' | 'Low';
  tickers_scanned: number;
  matches: StockMatch[];
}

interface WebSource {
  query: string;
  title: string;
  source: string;
  date: string;
  link: string;
}

interface ThemeScanResponse {
  status: string;
  theme_source: string;
  web_sources: WebSource[];
  generated_at: string;
  criteria: {
    plus_di_threshold: number;
    fresh_cross_lookback_days: number;
    statuses: string[];
  };
  themes: ThemeItem[];
  top_picks: StockMatch[];
  disclaimer: string;
  error?: string;
}

export default function ThemeAnalysisTab() {
  const [data, setData] = useState<ThemeScanResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [customContext, setCustomContext] = useState<string>('');
  const [includeNear, setIncludeNear] = useState<boolean>(true);
  const [selectedTheme, setSelectedTheme] = useState<string>('all');
  const [showWebSources, setShowWebSources] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CROSSED_30' | 'ABOVE_30' | 'NEAR_30'>('ALL');

  const fetchThemeScan = async (forceRefresh: boolean = false, contextOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const ctx = contextOverride !== undefined ? contextOverride : customContext;
      const params = new URLSearchParams();
      if (forceRefresh) params.append('refresh', 'true');
      if (ctx.trim()) params.append('context', ctx.trim());
      params.append('include_near', includeNear ? 'true' : 'false');

      const res = await apiFetch<ThemeScanResponse>(`/api/theme_scan?${params.toString()}`, {
        timeoutMs: 300000 // up to 5 mins for live web search + LLM + technical calculations
      } as any);

      if (res && res.status === 'success') {
        setData(res);
      } else {
        throw new Error(res?.error || 'Failed to fetch theme scan results');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing theme analysis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThemeScan(false);
  }, []);

  const freshCrossCount = data?.top_picks?.filter(p => p.status === 'CROSSED_30').length || 0;
  const webSourceCount = data?.web_sources?.length || 0;
  const topPick = data?.top_picks?.[0];

  const filteredPicks = (data?.top_picks || []).filter(pick => {
    if (statusFilter !== 'ALL' && pick.status !== statusFilter) return false;
    if (selectedTheme !== 'all') {
      const themes = pick.themes || [];
      if (!themes.some(t => t.toLowerCase().includes(selectedTheme.toLowerCase()))) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-12">
      {/* ── Top Header Panel ── */}
      <div className="glass-panel p-6 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/60 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-wide uppercase flex items-center gap-2.5">
              <Compass className="text-sky-600 dark:text-neonBlue" size={30} />
              Theme Analysis
            </h2>
            <span className="text-xs px-2.5 py-1 bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 rounded-md font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <Sparkles size={13} className="text-purple-500 dark:text-purple-300 animate-pulse" />
              6-MONTH RADAR
            </span>
            {data?.theme_source === 'llm' && (
              <span className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-md font-mono font-bold flex items-center gap-1">
                <Globe size={13} />
                LIVE WEB GROUNDED
              </span>
            )}
          </div>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1.5">
            Macro-thematic stock discovery: identifies policy shifts, festival & geopolitical drivers, then filters for Wilder <span className="text-sky-600 dark:text-sky-300 font-mono font-bold">+DI &gt; 30</span> breakout momentum.
          </p>
        </div>

        {/* Live Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fetchThemeScan(true)}
            disabled={loading}
            className="px-5 py-2.5 bg-gradient-to-r from-sky-500/15 to-sky-600/25 hover:from-sky-500/25 hover:to-sky-600/35 text-sky-700 dark:text-sky-200 border border-sky-500/30 rounded-xl text-xs md:text-sm font-bold tracking-wider flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-sky-600 dark:text-neonBlue' : 'text-sky-600 dark:text-sky-400'} />
            {loading ? 'ANALYZING MARKET...' : 'REFRESH LIVE SCAN'}
          </button>
        </div>
      </div>

      {/* ── Custom Theme Prompt / Context Bar ── */}
      <div className="glass-panel p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex flex-col md:flex-row items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-slate-700 dark:text-slate-400 tracking-wider uppercase whitespace-nowrap">
          <Search size={16} className="text-sky-600 dark:text-neonBlue" />
          CUSTOM CATALYST CONTEXT:
        </div>
        <div className="flex-1 w-full relative">
          <input
            type="text"
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchThemeScan(true); }}
            placeholder="e.g. War escalation, Dhanteras & Diwali gold jewellery rush, ECMS semiconductor capex, Data-center power..."
            className="w-full bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 focus:border-sky-500 dark:focus:border-neonBlue/60 rounded-xl px-4 py-2.5 text-sm md:text-base text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <label className="flex items-center gap-2 text-xs md:text-sm text-slate-700 dark:text-slate-400 cursor-pointer select-none font-medium">
            <input
              type="checkbox"
              checked={includeNear}
              onChange={(e) => setIncludeNear(e.target.checked)}
              className="rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-0"
            />
            Include Near-30
          </label>
          <button
            onClick={() => fetchThemeScan(true)}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs md:text-sm font-bold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            Scan Context
          </button>
        </div>
      </div>

      {/* ── Metric KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Themes */}
        <div className="glass-panel p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Active Themes</div>
            <div className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {data?.themes?.length ?? '—'}
            </div>
            <div className="text-xs text-sky-600 dark:text-sky-400 mt-1 flex items-center gap-1 font-semibold">
              <Calendar size={13} /> 6-Month Macro Window
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Compass size={24} />
          </div>
        </div>

        {/* Card 2: Fresh Crosses */}
        <div className="glass-panel p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">+DI Crossed 30</div>
            <div className="text-2xl md:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              {freshCrossCount}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1 font-medium">
              <Zap size={13} className="text-emerald-500" /> In Last 5 Sessions
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <TrendingUp size={24} />
          </div>
        </div>

        {/* Card 3: Top Technical Pick */}
        <div className="glass-panel p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Top Thematic Alpha</div>
            <div className="text-xl md:text-2xl font-black text-purple-700 dark:text-neonPurple mt-1 font-mono truncate max-w-[150px]">
              {topPick ? topPick.name : '—'}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-300 mt-1 flex items-center gap-1 font-medium">
              Score: <span className="font-bold font-mono">{topPick ? topPick.score : '—'}</span> (+DI: {topPick?.plus_di})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-300">
            <ShieldCheck size={24} />
          </div>
        </div>

        {/* Card 4: Web Grounding Status */}
        <div className="glass-panel p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Live Web Intel</div>
            <div className="text-2xl md:text-3xl font-black text-sky-700 dark:text-sky-300 mt-1 font-mono">
              {webSourceCount > 0 ? `${webSourceCount} Sources` : (data ? 'Active' : '—')}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1 font-medium">
              <Globe size={13} className="text-sky-500" /> Google News + DDG
            </div>
          </div>
          <button
            onClick={() => setShowWebSources(!showWebSources)}
            className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title="Inspect Grounding Sources"
          >
            {showWebSources ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
          </button>
        </div>
      </div>

      {/* ── Expandable Live Web Sources Drawer ── */}
      {showWebSources && (
        <div className="glass-panel p-5 border border-sky-500/30 bg-slate-950/70 shadow-2xl animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-sky-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Live Internet Intelligence Grounding ({data?.web_sources?.length || 0} Real-Time Items Parsed)
              </h4>
            </div>
            <button
              onClick={() => setShowWebSources(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            The AI engine extracted and cross-referenced the following live headlines from Google News India and DuckDuckGo before formulating macro themes:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
            {(data?.web_sources || []).map((src, i) => (
              <a
                key={i}
                href={src.link || '#'}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:border-sky-500/40 hover:bg-slate-900 transition-all flex flex-col justify-between group"
              >
                <div className="text-xs text-slate-300 group-hover:text-sky-300 line-clamp-2 font-medium">
                  {src.title}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2">
                  <span className="font-mono text-slate-400">{src.source}</span>
                  <span className="flex items-center gap-1 text-sky-400 group-hover:translate-x-0.5 transition-transform">
                    {src.date ? src.date.slice(0, 12) : 'Live'} <ExternalLink size={10} />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Thematic Cards Grid ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Compass size={18} className="text-sky-400" />
            Macro Themes & Beneficiary Breakouts
          </h3>
          <div className="text-xs text-slate-400 font-mono">
            {data?.themes?.length || 0} THEMES IDENTIFIED
          </div>
        </div>

        {error ? (
          <div className="glass-panel p-8 border border-rose-500/30 bg-rose-950/20 text-rose-400 flex flex-col items-center justify-center text-center">
            <AlertTriangle size={32} className="mb-2" />
            <div className="font-bold text-sm">Theme Scan Failed</div>
            <div className="text-xs text-slate-400 mt-1 max-w-md">{error}</div>
            <button
              onClick={() => fetchThemeScan(true)}
              className="mt-4 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 rounded-lg text-xs font-bold text-rose-200"
            >
              Try Again
            </button>
          </div>
        ) : loading ? (
          <div className="glass-panel p-16 border border-slate-800/80 bg-slate-950/40 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-neonBlue/20 border-t-neonBlue rounded-full animate-spin"></div>
            <p className="text-xs font-mono text-slate-300 uppercase tracking-widest animate-pulse">
              Scraping live market intelligence & calculating Wilder ADX / +DI metrics...
            </p>
            <p className="text-[11px] text-slate-500">
              Querying Google News RSS & DuckDuckGo for live geopolitics, gold, and policy data
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(data?.themes || []).map((th, idx) => (
              <div
                key={idx}
                className="glass-panel p-6 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all flex flex-col justify-between shadow-sm"
              >
                <div>
                  {/* Theme Header */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <h4 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-white tracking-wide leading-snug">
                      {th.theme}
                    </h4>
                    <span
                      className={`text-xs font-bold font-mono px-2.5 py-1 rounded-md border whitespace-nowrap ${th.confidence === 'High'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                          : th.confidence === 'Medium'
                            ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                    >
                      {th.confidence} Confidence
                    </span>
                  </div>

                  {/* Window */}
                  <div className="flex items-center gap-2 text-xs md:text-sm text-sky-600 dark:text-sky-300 font-mono mb-3.5 font-semibold">
                    <Calendar size={14} className="text-sky-600 dark:text-sky-400" />
                    <span>Horizon: {th.window}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600 dark:text-slate-400">{th.tickers_scanned} Tickers Evaluated</span>
                  </div>

                  {/* Rationale based on live web evidence */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/60 text-xs md:text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
                    <span className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Macro Rationale & Web Grounding:
                    </span>
                    {th.rationale}
                  </div>
                </div>

                {/* Stock Breakouts for this Theme */}
                <div>
                  <div className="text-xs md:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2.5 flex items-center justify-between">
                    <span>Technical Matches (+DI &gt; 30)</span>
                    <span className="font-mono text-sky-600 dark:text-neonBlue font-bold">{th.matches.length} Candidates</span>
                  </div>

                  {th.matches.length === 0 ? (
                    <div className="text-xs md:text-sm text-slate-500 py-3.5 text-center bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      No stocks in this theme currently meet +DI ≥ 30 momentum threshold.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {th.matches.map((stk) => (
                        <div
                          key={stk.symbol}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 hover:border-sky-500 dark:hover:border-neonBlue/40 transition-colors flex items-center justify-between shadow-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-sm md:text-base text-slate-900 dark:text-white font-mono">
                              {stk.name}
                            </span>
                            <span
                              className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-md uppercase font-mono ${stk.status === 'CROSSED_30'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                  : stk.status === 'ABOVE_30'
                                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                }`}
                            >
                              {stk.status.replace('_', ' ')}
                            </span>
                            {stk.crossed_days_ago !== null && (
                              <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline font-medium">
                                ({stk.crossed_days_ago === 0 ? 'Today' : `${stk.crossed_days_ago}d ago`})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3.5 text-xs md:text-sm font-mono">
                            <div className="text-right">
                              <div className="text-slate-900 dark:text-slate-200 font-bold">₹{stk.price.toLocaleString('en-IN')}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                ADX: <span className={stk.adx >= 25 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-300'}>{stk.adx}</span>
                              </div>
                            </div>
                            <div className="text-right pl-3 border-l border-slate-200 dark:border-slate-800">
                              <div className="text-sky-600 dark:text-sky-300 font-bold">+DI: {stk.plus_di}</div>
                              <div className="text-xs text-purple-600 dark:text-purple-300 font-semibold">Score: {stk.score}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Top Ranked Stocks Table ── */}
      <div className="glass-panel p-6 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 border-b border-slate-200 dark:border-slate-800/60 pb-4">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="text-emerald-500" size={22} />
              Thematic Momentum Leaderboard
            </h3>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Ranked cross-theme candidates passing technical breakout criteria
            </p>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs md:text-sm text-slate-600 dark:text-slate-500 flex items-center gap-1 mr-1 font-semibold">
              <Filter size={14} /> Status:
            </span>
            {(['ALL', 'CROSSED_30', 'ABOVE_30', 'NEAR_30'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${statusFilter === st
                    ? 'bg-sky-500/20 text-sky-700 dark:text-neonBlue border border-sky-500/40'
                    : 'bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
                  }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}

            {selectedTheme !== 'all' && (
              <button
                onClick={() => setSelectedTheme('all')}
                className="ml-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer"
              >
                Clear Theme Filter: {selectedTheme.slice(0, 16)}... ×
              </button>
            )}
          </div>
        </div>

        {filteredPicks.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No candidate stocks match the current filter criteria.
          </div>
        ) : (
          <div 
            className="overflow-x-auto w-full scrollbar-thin rounded-xl border border-slate-200 dark:border-slate-800"
            style={{ overscrollBehavior: 'contain', transform: 'translateZ(0)' }}
          >
            <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/80 text-xs md:text-sm text-slate-700 dark:text-slate-400 font-bold tracking-wider uppercase">
                  <th className="py-3.5 px-4">Rank</th>
                  <th className="py-3.5 px-4">Stock</th>
                  <th className="py-3.5 px-4">Breakout Status</th>
                  <th className="py-3.5 px-4">Theme(s)</th>
                  <th className="py-3.5 px-4 text-right">CMP (Rs.)</th>
                  <th className="py-3.5 px-4 text-right">+DI (14)</th>
                  <th className="py-3.5 px-4 text-right">-DI (14)</th>
                  <th className="py-3.5 px-4 text-right">ADX (14)</th>
                  <th className="py-3.5 px-4 text-right">&gt; 20 EMA</th>
                  <th className="py-3.5 px-4 text-right">From 52W High</th>
                  <th className="py-3.5 px-4 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredPicks.map((stock, idx) => (
                  <tr
                    key={stock.symbol}
                    className={`border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-sm md:text-base ${idx % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-900/30' : 'bg-transparent'
                      }`}
                  >
                    <td className="py-3.5 px-4 font-mono text-slate-500 font-semibold">#{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-white font-mono">{stock.name}</div>
                      <div className="text-xs text-slate-500 font-semibold">{stock.symbol}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-md font-mono ${stock.status === 'CROSSED_30'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : stock.status === 'ABOVE_30'
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          }`}
                      >
                        {stock.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-[280px] truncate text-xs md:text-sm text-slate-700 dark:text-slate-300 font-medium" title={(stock.themes || []).join(', ')}>
                      {(stock.themes || []).join(', ') || 'Macro beneficiary'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-200">
                      ₹{stock.price.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-sky-600 dark:text-sky-300">
                      {stock.plus_di.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                      {stock.minus_di.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      <span className={stock.adx >= 25 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                        {stock.adx.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      {stock.above_ema20 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">YES</span>
                      ) : (
                        <span className="text-slate-500 text-xs font-medium">NO</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold">
                      <span className={stock.pct_from_52w_high >= -10 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                        {stock.pct_from_52w_high > 0 ? `+${stock.pct_from_52w_high}%` : `${stock.pct_from_52w_high}%`}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-purple-700 dark:text-purple-300 text-base">
                      {stock.score.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Methodology Note ── */}
      <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800 text-xs text-slate-400 flex items-start gap-3">
        <CheckCircle2 size={16} className="text-sky-400 mt-0.5 shrink-0" />
        <div>
          <span className="font-bold text-slate-300">Feedstock & Thematic Discovery Methodology:</span>{' '}
          Stocks are surfaced by combining live internet intelligence (festivals, war tensions, budget policy, PLI/ECMS approvals) with Wilder's +DI / -DI (14-period). A +DI crossing above 30 signals strong directional expansion. Always verify quarterly earnings inflections (quarterly NP approaching annual NP) prior to trade execution.
        </div>
      </div>
    </div>
  );
}
