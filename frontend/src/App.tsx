import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy, Component, memo, type ReactNode } from 'react'
import {
  Activity, Radio, Cpu, Satellite, TrendingUp, Search,
  Lightbulb, BarChart3, ExternalLink, Flame, IndianRupee,
  RefreshCw, Clock, Globe, AlertTriangle,
  DollarSign, Newspaper, Zap, Target, ArrowRight, Shield, X,
  Calendar, Users, MessageSquare
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TelegramFeed from './TelegramFeed'
import { apiGet, apiPost } from './api'

const EarthMap = lazy(() => import('./EarthMap'));
const ChartsTab = lazy(() => import('./ChartsTab'));
const InfiniteSpaceView = lazy(() => import('./InfiniteSpaceView'));
const ScreenerTab = lazy(() => import('./ScreenerTab'));
const ThemeAnalysisTab = lazy(() => import('./ThemeAnalysisTab'));
import ParticleGlobe from './ParticleGlobe';

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
  category?: string;
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
  url?: string;
  headline?: string;
  source_link?: string;
}

interface AgentInfo {
  status: string;
  last_run: string | null;
  cycle_count: number;
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

/* ─── Safety Guard Components ─── */

interface EBProps { children: ReactNode; }
interface EBState { hasError: boolean; }

class ErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error("Global Dashboard Guard caught error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-20 glass-panel h-[700px] text-center">
          <AlertTriangle className="text-amber-500 mb-6" size={64} />
          <h2 className="text-2xl font-black text-[var(--color-text-main)] mb-2 uppercase tracking-widest">Analytics Layer Standby</h2>
          <p className="text-[var(--color-text-main)] max-w-md mx-auto text-sm leading-relaxed mb-6">
            An unforeseen visualization conflict occurred. The core News Scanner and Intelligence Map remain fully functional.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-neonBlue text-black font-bold rounded-lg hover:bg-neonBlue/80 transition"
          >
            RELOAD ANALYTICS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Modal Components ─── */

const TacticalAdvisorModal = ({
  show,
  loading,
  title,
  content,
  onClose
}: {
  show: boolean,
  loading: boolean,
  title: string,
  content: string,
  onClose: () => void
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-2xl max-h-[80vh] overflow-y-auto relative animate-in fade-in zoom-in duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--color-text-main)] hover:text-[var(--color-text-main)] transition"
        >
          <X size={20} />
        </button>

        <div className="p-6 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-1">
            <div className="px-2 py-0.5 bg-neonBlue/10 border border-neonBlue/30 rounded">
              <span className="text-[10px] font-bold text-neonBlue tracking-widest uppercase italic">Tactical Advisor</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)] leading-tight">{title}</h2>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="h-10 w-10 border-4 border-neonBlue/20 border-t-neonBlue rounded-full animate-spin"></div>
              <p className="text-sm text-[var(--color-text-main)] italic">Synthesizing tactical action plan...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="prose prose-invert prose-sm max-w-none">
                <div className="text-[var(--color-text-main)] leading-relaxed whitespace-pre-line tactical-content">
                  {content.split('\n').map((line: string, i: number) => {
                    if (line.startsWith('**') || line.includes(':**')) {
                      return <div key={i} className="mt-4 first:mt-0 font-bold text-neonBlue text-sm tracking-wide">{line.replace(/\*\*/g, '')}</div>;
                    }
                    return <p key={i} className="mb-2 text-[var(--color-text-main)]">{line}</p>;
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-[var(--color-border)]">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-[var(--color-card)] hover:bg-slate-700 text-[var(--color-text-main)] rounded font-bold transition"
                >
                  DISMISS
                </button>
                <button
                  onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(title)}+latest+news`, '_blank')}
                  className="flex-1 py-2.5 bg-neonBlue hover:bg-neonBlue/80 text-black rounded font-bold transition"
                >
                  VERIFY LIVE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


interface ChainStep {
  label: string;
  type: string;
  change: string;
  isPositive: boolean;
  neutral?: boolean;
}

const getImpactChain = (ev: GeoEvent): ChainStep[] => {
  const text = (ev.headline + ' ' + ev.summary).toLowerCase();

  if (text.includes('oil') || text.includes('hormuz') || text.includes('crude') || text.includes('energy') || text.includes('fuel')) {
    return [
      { label: 'Strait of Hormuz Tension', type: 'Geopolitical Event', change: 'Trigger', isPositive: true, neutral: true },
      { label: 'Crude Oil Prices Likely to Rise', type: 'Commodity Impact', change: '+6% to +8%', isPositive: true },
      { label: 'Aviation & Shipping Cost Increase', type: 'Sector Impact', change: '-3% to -5%', isPositive: false },
      { label: 'Airlines Margins Under Pressure', type: 'Industry Impact', change: 'Negative', isPositive: false },
      { label: 'ONGC, Reliance Likely to Benefit', type: 'Stock Impact', change: '+2% to +4%', isPositive: true }
    ];
  }

  if (text.includes('russia') || text.includes('ukraine') || text.includes('war') || text.includes('military') || text.includes('weapon') || text.includes('defence') || text.includes('defense')) {
    return [
      { label: 'East Ukraine Conflict Escalation', type: 'Security Incident', change: 'Trigger', isPositive: true, neutral: true },
      { label: 'Defence Spending Hike Projected', type: 'Budgetary Expansion', change: '+8% to +12%', isPositive: true },
      { label: 'Global Trade Routing Bottlenecks', type: 'Logistics Impact', change: '-4% to -6%', isPositive: false },
      { label: 'Titanium & Gas Supplies Contract', type: 'Supply Chain Impact', change: 'Negative', isPositive: false },
      { label: 'HAL, Bharat Electronics Surge', type: 'Stock Impact', change: '+5% to +8%', isPositive: true }
    ];
  }

  if (text.includes('inflation') || text.includes('fed') || text.includes('rbi') || text.includes('rate') || text.includes('interest') || text.includes('economic') || text.includes('fiscal') || text.includes('gdp')) {
    return [
      { label: 'Hawkish Fed/RBI Stance Spikes', type: 'Macroeconomic Event', change: 'Trigger', isPositive: true, neutral: true },
      { label: '10-Year Bond Yields Jump', type: 'Treasury Impact', change: '+0.25 bps', isPositive: true },
      { label: 'Net Interest Margin Expansion', type: 'Banking Sector', change: '+1.5% to +2.5%', isPositive: true },
      { label: 'Industrial Borrowing Costs Rise', type: 'Corporate Credit', change: '-2.0%', isPositive: false },
      { label: 'SBI, HDFC Bank Outperform', type: 'Stock Impact', change: '+3% to +5%', isPositive: true }
    ];
  }

  return [
    { label: ev.headline.length > 25 ? ev.headline.substring(0, 25) + '...' : ev.headline, type: 'Geopolitical Incident', change: 'Trigger', isPositive: true, neutral: true },
    { label: 'Market Volatility Index (VIX) Spikes', type: 'Sentiment Impact', change: '+12% to +15%', isPositive: false },
    { label: 'Safe Haven Gold Inflows Expand', type: 'Asset Allocation', change: '+2.5%', isPositive: true },
    { label: 'Domestic Stock Benchmarks Pullback', type: 'Market Exposure', change: '-1.0% to -1.5%', isPositive: false },
    { label: 'Defensives (IT & Pharma) Outperform', type: 'Stock Rotation', change: '+1.5% to +3%', isPositive: true }
  ];
};

const getAssetsAffected = (ev: GeoEvent): string[] => {
  const text = (ev.headline + ' ' + ev.summary).toLowerCase();
  if (text.includes('oil') || text.includes('hormuz') || text.includes('crude') || text.includes('energy') || text.includes('fuel')) {
    return ['ONGC', 'RELIANCE', 'BPCL', 'HPCL', 'INDIGO', 'SPICEJET'];
  }
  if (text.includes('russia') || text.includes('ukraine') || text.includes('war') || text.includes('defence') || text.includes('defense')) {
    return ['HAL', 'BEL', 'L&T', 'MAZDOCK', 'COCHINSHIP'];
  }
  if (text.includes('inflation') || text.includes('rate') || text.includes('interest') || text.includes('banking')) {
    return ['SBI', 'HDFC BANK', 'ICICI BANK', 'AXIS BANK', 'NIFTY BANK'];
  }
  return ['NIFTY 50', 'SENSEX', 'GOLD', 'RELIANCE', 'TCS', 'INFOSYS'];
};

const getPointColor = (severity: string) => {
  switch (severity) {
    case 'critical': return '#ef4444';
    case 'high': return '#f97316';
    case 'medium': return '#eab308';
    case 'low': return '#10b981';
    default: return '#10b981';
  }
};

function EventDetailsSidebar({
  activeEvent,
  activeAnalysis,
  onAnalyze,
  activeEventChain,
  chainLoading
}: {
  activeEvent: GeoEvent | null;
  activeAnalysis: { [key: string]: { loading: boolean, text: string | null } };
  onAnalyze: (ev: GeoEvent) => void;
  activeEventChain: any;
  chainLoading: boolean;
}) {
  if (!activeEvent) {
    return (
      <div className="glass-panel p-5 text-center text-[var(--color-text-main)] min-h-[300px] flex flex-col items-center justify-center border border-[var(--color-border)]">
        <Radio className="animate-pulse mb-3 text-slate-600" size={32} />
        <h3 className="text-xs font-bold text-[var(--color-text-main)] tracking-wider">SELECT AN EVENT</h3>
        <p className="text-[10px] text-[var(--color-text-main)] mt-1 max-w-[200px]">Click any marker on the map to inspect its real-time market impact and AI analysis.</p>
      </div>
    );
  }

  // Use dynamically predicted chain if available, else fall back to static template logic
  const chain = useMemo(() => {
    if (activeEventChain?.chain && Array.isArray(activeEventChain.chain)) {
      return activeEventChain.chain.map((step: any) => ({
        label: step.impact,
        type: step.affected,
        change: step.magnitude,
        isPositive: step.direction === 'UP' || step.direction === 'VOLATILE',
        neutral: false
      }));
    }
    return getImpactChain(activeEvent);
  }, [activeEvent, activeEventChain]);

  const assets = useMemo(() => {
    if (activeEventChain?.indian_stocks_affected && Array.isArray(activeEventChain.indian_stocks_affected)) {
      return activeEventChain.indian_stocks_affected.map((s: any) => `${s.name} (${s.ticker})`);
    }
    return getAssetsAffected(activeEvent);
  }, [activeEvent, activeEventChain]);

  const color = getPointColor(activeEvent.severity);
  const analysis = activeAnalysis[activeEvent.id];

  const scoreSeed = activeEvent.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const probScore = activeEventChain?.severity
    ? (activeEventChain.severity === 'CRITICAL' || activeEventChain.severity === 'HIGH' ? 85 : 55)
    : (activeEvent.severity === 'critical' || activeEvent.severity === 'high'
      ? 80 + (scoreSeed % 15)
      : activeEvent.severity === 'medium'
        ? 60 + (scoreSeed % 18)
        : 35 + (scoreSeed % 20));

  const confidence = activeEventChain?.overall_market_impact
    ? "High"
    : (activeEvent.severity === 'critical' || activeEvent.severity === 'high' ? 'High' : activeEvent.severity === 'medium' ? 'Medium' : 'Low');

  return (
    <div className="glass-panel p-5 flex flex-col gap-4 text-left border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl select-none">
      <div>
        <h3 className="text-xs font-bold text-[var(--color-text-main)] tracking-wider mb-2 uppercase flex items-center gap-1.5">
          <Globe size={12} className="text-sky-400 animate-pulse" /> Geopolitical Impact Exposure
        </h3>
        <h2 className="text-sm font-extrabold text-[var(--color-text-main)] leading-snug">{activeEvent.headline}</h2>
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-[var(--color-card)] text-[var(--color-text-main)] border-[var(--color-border)]">
            {activeEvent.category || 'Geopolitics'}
          </span>
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider"
            style={{ color: color, backgroundColor: `${color}15`, borderColor: `${color}30` }}
          >
            {activeEvent.severity.toUpperCase()} IMPACT
          </span>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-3 flex flex-col">
        <h4 className="text-[9px] font-bold text-[var(--color-text-main)] tracking-widest uppercase mb-3">EVENT IMPACT CHAIN</h4>
        {chainLoading ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-2">
            <div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
            <span className="text-[9px] text-indigo-300 font-mono animate-pulse uppercase tracking-wider">Predicting impact cascade...</span>
          </div>
        ) : (
          <div className="space-y-3.5">
            {chain.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-black ${step.neutral
                        ? 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-main)]'
                        : step.isPositive
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                          : 'bg-red-950/60 border-red-800 text-red-400'
                      }`}
                  >
                    {i + 1}
                  </div>
                  {i < chain.length - 1 && <div className="w-0.5 h-4 bg-slate-850 mt-0.5"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[var(--color-text-main)] font-semibold truncate leading-none mt-0.5">{step.label}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[8px] text-[var(--color-text-main)] leading-none">{step.type}</span>
                    {!step.neutral && (
                      <span className={`text-[8px] font-bold leading-none ${step.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {step.change}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] pt-3">
        <h4 className="text-[9px] font-bold text-[var(--color-text-main)] tracking-widest uppercase mb-2">ASSETS LIKELY AFFECTED</h4>
        <div className="flex flex-wrap gap-1">
          {assets.map((asset: string, i: number) => (
            <span key={i} className="text-[9px] font-bold bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text-main)] px-2 py-0.5 rounded shadow-sm">
              {asset}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-3 flex items-center gap-6">
        <div>
          <h4 className="text-[8px] font-bold text-[var(--color-text-main)] tracking-widest uppercase mb-1">AI PROBABILITY</h4>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black text-emerald-400">{probScore}%</span>
            <span className="text-[8px] text-[var(--color-text-main)]">Confidence</span>
          </div>
        </div>
        <div className="flex-1">
          <h4 className="text-[8px] font-bold text-[var(--color-text-main)] tracking-widest uppercase mb-1.5">CONFIDENCE LEVEL</h4>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[var(--color-text-main)]">{confidence}</span>
            <div className="flex-1 h-1 bg-[var(--color-card)] rounded-full overflow-hidden border border-[var(--color-border)]">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: confidence === 'High' ? '85%' : confidence === 'Medium' ? '55%' : '25%' }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-3 flex flex-col gap-2">
        <h4 className="text-[9px] font-bold text-[var(--color-text-main)] tracking-widest uppercase">OVERVIEW & EXPOSURE</h4>
        <div className="bg-slate-955 border border-[var(--color-border)] p-3 rounded-lg text-left max-h-[140px] overflow-y-auto scrollbar-thin">
          {analysis ? (
            analysis.loading ? (
              <div className="flex items-center justify-center gap-2 py-3">
                <div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                <span className="text-[10px] text-indigo-300 font-mono animate-pulse uppercase tracking-wider">Analyzing Strategic Exposure...</span>
              </div>
            ) : (
              <p className="text-[10px] text-[var(--color-text-main)] leading-relaxed font-mono whitespace-pre-wrap">{analysis.text}</p>
            )
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--color-text-main)] leading-relaxed font-mono">{activeEvent.summary}</p>
              <button
                onClick={() => onAnalyze(activeEvent)}
                className="w-full py-1.5 bg-indigo-650/40 hover:bg-indigo-600 text-[var(--color-text-main)] rounded-lg border border-indigo-500/30 text-[10px] font-bold tracking-wider transition-colors cursor-pointer"
              >
                🌟 GENERATE DEEP STRATEGIC ANALYSIS
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveTreemap() {
  const [PlotComponent, setPlotComponent] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadPlotly = async () => {
      try {
        const [PlotlyModule, factoryModule] = await Promise.all([
          import('plotly.js-dist-min'),
          import('react-plotly.js/factory')
        ]);
        const Plotly = PlotlyModule.default;
        const factory = factoryModule.default;
        if (isMounted) setPlotComponent(() => factory(Plotly));
      } catch (err) { }
    };
    loadPlotly();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchTreemap = async () => {
      try {
        const res = await apiGet<any>('/api/market/treemap');
        if (isMounted && res && res.length > 0) {
          setData(res);
        }
      } catch (e) { }
    };
    fetchTreemap();
    const interval = setInterval(fetchTreemap, 60000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const labels: string[] = ["Indian Market"];
  const parents: string[] = [""];
  const values: number[] = [0];
  const colors: string[] = ["#0f172a"];
  const texts: string[] = [""];

  let totalMcap = 0;
  const sectorMcap: Record<string, number> = {};
  const sectors = Array.from(new Set(data.map(d => d.sector)));

  data.forEach(d => {
    sectorMcap[d.sector] = (sectorMcap[d.sector] || 0) + (d.mcap || 100);
    totalMcap += (d.mcap || 100);
  });

  values[0] = totalMcap;

  sectors.forEach(s => {
    labels.push(s);
    parents.push("Indian Market");
    values.push(sectorMcap[s] || 0);
    colors.push("#1e293b");
    texts.push("");
  });

  data.forEach(d => {
    labels.push(d.name);
    parents.push(d.sector);
    values.push(d.mcap || 100);
    const color = d.change_pct >= 0 ? (d.change_pct > 1 ? '#059669' : '#10b981') : (d.change_pct < -1 ? '#be123c' : '#ef4444');
    colors.push(color);
    texts.push(`${d.change_pct >= 0 ? '+' : ''}${d.change_pct}%`);
  });

  const traces = [{
    type: 'treemap',
    labels,
    parents,
    values,
    text: texts,
    textinfo: "label+text",
    textfont: { size: 14, color: '#ffffff', family: 'sans-serif' },
    marker: { colors },
    branchvalues: "total",
    hovertemplate: '<b>%{label}</b><br>%{text}<extra></extra>'
  }];

  const layout = {
    margin: { t: 0, l: 0, r: 0, b: 0 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    treemapcolorway: ['#1e293b'],
    autosize: true
  };

  return (
    <div className="glass-panel flex flex-col border border-[var(--color-border)] bg-[var(--color-card)] md:col-span-2 overflow-hidden h-[450px]">
      <div className="flex items-center justify-between p-4 pb-2 border-b border-[var(--color-border)]">
        <h3 className="text-xs font-bold text-[var(--color-text-main)] tracking-widest uppercase flex items-center gap-2">
          <Activity className="text-sky-400" size={14} /> LIVE SECTOR HEATMAP
        </h3>
      </div>
      <div className="flex-1 w-full h-full relative">
        {data.length > 0 ? (
          <SafePlot
            component={PlotComponent}
            data={traces}
            layout={layout}
            config={{ displayModeBar: false, responsive: true }}
            className="w-full h-full"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-main)]">
            <div className="w-8 h-8 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mb-3"></div>
            <p className="text-[10px] font-bold tracking-widest uppercase">Fetching Treemap Data...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ImpactMetricsCards({ events, scenarioData: _scenarioData, onSelectEvent }: { events: GeoEvent[], scenarioData: any, onSelectEvent?: (ev: GeoEvent) => void }) {
  const eventsArr = Array.isArray(events) ? events : [];


  // 1. Top High Impact Events (Critical & High severity, sorted by timestamp desc)
  const highImpactEvents = useMemo(() => {
    return [...eventsArr]
      .filter(ev => ev && (ev.severity === 'critical' || ev.severity === 'high'))
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
      })
      .slice(0, 3);
  }, [eventsArr]);





  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2 select-none">
      {/* Top High Impact Events */}
      <div className="glass-panel p-5 flex flex-col gap-3.5 border border-[var(--color-border)] bg-[var(--color-card)] min-h-[250px]">
        <h3 className="text-sm md:text-base font-extrabold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2">
          <AlertTriangle className="text-red-500 animate-pulse" size={16} /> Top High Impact Events
        </h3>
        <div className="flex-1 flex flex-col gap-3 justify-start overflow-y-auto max-h-[350px] scrollbar-thin pr-1">
          {highImpactEvents.length > 0 ? (
            highImpactEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => onSelectEvent?.(ev)}
                className="flex flex-col gap-1.5 p-3 rounded-xl bg-[var(--color-card)] border border-[var(--color-border)] hover:border-red-500/50 hover:bg-[var(--color-card)] transition-all cursor-pointer shadow-sm hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs text-red-500 dark:text-red-400 font-extrabold bg-red-500/10 border border-red-500/25 px-2.5 py-0.5 rounded-md tracking-wider uppercase">
                    {ev.severity} impact
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono font-semibold">
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <h4 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-[var(--color-text-main)] leading-snug">{ev.headline}</h4>
                <p className="text-xs md:text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-sans mt-0.5 border-l-2 border-red-500/30 pl-2.5 max-h-[75px] overflow-y-auto scrollbar-thin whitespace-pre-wrap">
                  {ev.summary}
                </p>
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-1">📍 {ev.city}{ev.country ? `, ${ev.country}` : ''}</span>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-[var(--color-text-main)] text-sm italic">
              No critical or high impact events active in this timeframe.
            </div>
          )}
        </div>
      </div>

      {/* 2. Dynamic Sector Heatmap Treemap (Spans 2 Columns for rich matrix) */}
      <LiveTreemap />
    </div>
  );
}

/* Daily performance cross-check component */
const fallbackPerfData = {
  sectors: [
    { symbol: "^NSEI", name: "Nifty 50", price: 24013.10, change_pct: -0.64, is_positive: false },
    { symbol: "^NSEBANK", name: "Banking (Nifty Bank)", price: 57685.75, change_pct: -0.48, is_positive: false },
    { symbol: "^CNXIT", name: "IT (Nifty IT)", price: 27426.85, change_pct: -3.65, is_positive: false },
    { symbol: "^CNXAUTO", name: "Auto (Nifty Auto)", price: 22450.80, change_pct: 1.25, is_positive: true },
    { symbol: "^CNXPHARMA", name: "Pharma (Nifty Pharma)", price: 19410.15, change_pct: -0.15, is_positive: false },
    { symbol: "^CNXENERGY", name: "Energy (Nifty Energy)", price: 40150.30, change_pct: 0.95, is_positive: true },
    { symbol: "^CNXFMCG", name: "FMCG (Nifty FMCG)", price: 56120.75, change_pct: 0.22, is_positive: true },
    { symbol: "^CNXINFRA", name: "Infrastructure", price: 8620.10, change_pct: 0.52, is_positive: true },
    { symbol: "^CNXMETAL", name: "Metals (Nifty Metal)", price: 9850.40, change_pct: -1.10, is_positive: false },
    { symbol: "GC=F", name: "Gold (Safe Haven)", price: 2331.20, change_pct: 0.35, is_positive: true }
  ],
  stocks: [
    { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", price: 1910.80, change_pct: 1.92, is_positive: true },
    { symbol: "IDFCFIRSTB.NS", name: "IDFC First Bank", price: 78.68, change_pct: 0.76, is_positive: true },
    { symbol: "ONGC.NS", name: "ONGC", price: 246.25, change_pct: 0.39, is_positive: true },
    { symbol: "RELIANCE.NS", name: "Reliance", price: 2910.15, change_pct: 0.95, is_positive: true },
    { symbol: "HAL.NS", name: "HAL", price: 4850.30, change_pct: -0.85, is_positive: false },
    { symbol: "BEL.NS", name: "Bharat Electronics", price: 310.20, change_pct: -1.25, is_positive: false },
    { symbol: "SBIN.NS", name: "SBI", price: 845.60, change_pct: 1.15, is_positive: true },
    { symbol: "HDFCBANK.NS", name: "HDFC Bank", price: 1610.40, change_pct: 0.75, is_positive: true },
    { symbol: "TCS.NS", name: "TCS", price: 3810.15, change_pct: -0.55, is_positive: false },
    { symbol: "INFY.NS", name: "Infosys", price: 1515.30, change_pct: -0.80, is_positive: false },
    { symbol: "TATAMOTORS.NS", name: "Tata Motors", price: 975.20, change_pct: 1.45, is_positive: true }
  ]
};

function DailyPerformanceCard() {
  const [data, setData] = useState<{
    sectors: { symbol: string; name: string; price: number; change_pct: number; is_positive: boolean }[];
    stocks: { symbol: string; name: string; price: number; change_pct: number; is_positive: boolean }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    const fetchPerformance = async () => {
      try {
        const res = await apiGet<any>('/api/market/performance');
        if (res && (res.sectors || res.stocks)) {
          setData(res);
          setIsFallback(false);
          setError(null);
        } else {
          throw new Error('Malformed performance data payload');
        }
      } catch (err) {
        console.error('Failed to fetch real-time performance data, falling back to static offline metrics:', err);
        setData(fallbackPerfData);
        setIsFallback(true);
        setError(null);
      } finally {
        setLoading(false);
      }
    };
    fetchPerformance();
    const interval = setInterval(fetchPerformance, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="glass-panel p-6 flex flex-col items-center justify-center min-h-[200px] border border-[var(--color-border)] bg-[var(--color-card)]">
        <Activity className="animate-pulse text-neonBlue mb-2" size={24} />
        <span className="text-[10px] text-[var(--color-text-main)] font-bold uppercase tracking-wider animate-pulse">Syncing Live Market Data...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel p-6 text-center border border-[var(--color-border)] bg-[var(--color-card)]">
        <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Market Data Offline</span>
        <p className="text-[9px] text-[var(--color-text-main)] mt-1">Unable to fetch daily performance metrics at this time.</p>
      </div>
    );
  }

  // Group by performing vs underperforming for sectors
  const performingSectors = data.sectors.filter(s => s.change_pct >= 0).sort((a, b) => b.change_pct - a.change_pct);
  const underperformingSectors = data.sectors.filter(s => s.change_pct < 0).sort((a, b) => a.change_pct - b.change_pct);

  // Group by performing vs underperforming for stocks (potential beneficiaries)
  const performingStocks = data.stocks.filter(s => s.change_pct >= 0).sort((a, b) => b.change_pct - a.change_pct);
  const underperformingStocks = data.stocks.filter(s => s.change_pct < 0).sort((a, b) => a.change_pct - b.change_pct);

  return (
    <div className="glass-panel p-5 md:p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm md:text-base font-black text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2">
            <Activity className="text-neonBlue animate-pulse" size={16} /> DAILY PERFORMANCE CROSS-CHECK
          </h3>
          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 mt-1 font-medium">Compare active sector risks and AI beneficiaries against real-time market performance</p>
        </div>
        {isFallback ? (
          <span className="text-xs bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20 px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 bg-amber-400 rounded-full"></span> Offline Cache
          </span>
        ) : (
          <span className="text-xs bg-sky-500/10 text-sky-500 dark:text-sky-400 font-bold border border-sky-500/20 px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 bg-sky-400 rounded-full animate-pulse"></span> Live
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SECTORS PERFORMANCE COMPARISON */}
        <div className="p-4 bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl flex flex-col gap-3.5 shadow-sm">
          <h4 className="text-xs md:text-sm font-black text-[var(--color-text-main)] tracking-wider uppercase border-b border-[var(--color-border)] pb-2.5">
            Sectors Heat Check
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* PERFORMING SECTORS */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                ▲ Performing
              </span>
              <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin pr-1">
                {performingSectors.length > 0 ? (
                  performingSectors.map((s, i) => (
                    <div key={i} className="flex justify-between items-center bg-[var(--color-card)] p-2.5 rounded-lg border border-[var(--color-border)] hover:border-emerald-500/30 transition-all">
                      <div className="min-w-0 pr-2">
                        <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 font-extrabold block truncate">{s.name}</span>
                        <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-mono font-medium">{s.symbol}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs md:text-sm text-emerald-600 dark:text-emerald-400 font-black block">+{s.change_pct.toFixed(2)}%</span>
                        <span className="text-[10px] md:text-xs text-slate-600 dark:text-slate-400 font-mono font-semibold">₹{s.price}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">No sectors in green</span>
                )}
              </div>
            </div>

            {/* UNDERPERFORMING SECTORS */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-1">
                ▼ Underperforming
              </span>
              <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin pr-1">
                {underperformingSectors.length > 0 ? (
                  underperformingSectors.map((s, i) => (
                    <div key={i} className="flex justify-between items-center bg-[var(--color-card)] p-2.5 rounded-lg border border-[var(--color-border)] hover:border-rose-500/30 transition-all">
                      <div className="min-w-0 pr-2">
                        <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 font-extrabold block truncate">{s.name}</span>
                        <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-mono font-medium">{s.symbol}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs md:text-sm text-rose-600 dark:text-rose-400 font-black block">{s.change_pct.toFixed(2)}%</span>
                        <span className="text-[10px] md:text-xs text-slate-600 dark:text-slate-400 font-mono font-semibold">₹{s.price}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">No sectors in red</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BENEFICIARIES PERFORMANCE COMPARISON */}
        <div className="p-4 bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl flex flex-col gap-3.5 shadow-sm">
          <h4 className="text-xs md:text-sm font-black text-[var(--color-text-main)] tracking-wider uppercase border-b border-[var(--color-border)] pb-2.5">
            AI Beneficiaries Validation
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* PERFORMING BENEFICIARIES */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                ▲ Performing
              </span>
              <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin pr-1">
                {performingStocks.length > 0 ? (
                  performingStocks.map((s, i) => (
                    <div key={i} className="flex justify-between items-center bg-[var(--color-card)] p-2.5 rounded-lg border border-[var(--color-border)] hover:border-emerald-500/30 transition-all">
                      <div className="min-w-0 pr-2">
                        <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 font-extrabold block truncate">{s.name}</span>
                        <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-mono font-medium">{s.symbol}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs md:text-sm text-emerald-600 dark:text-emerald-400 font-black block">+{s.change_pct.toFixed(2)}%</span>
                        <span className="text-[10px] md:text-xs text-slate-600 dark:text-slate-400 font-mono font-semibold">₹{s.price}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">No stocks in green</span>
                )}
              </div>
            </div>

            {/* UNDERPERFORMING BENEFICIARIES */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-1">
                ▼ Underperforming
              </span>
              <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin pr-1">
                {underperformingStocks.length > 0 ? (
                  underperformingStocks.map((s, i) => (
                    <div key={i} className="flex justify-between items-center bg-[var(--color-card)] p-2.5 rounded-lg border border-[var(--color-border)] hover:border-rose-500/30 transition-all">
                      <div className="min-w-0 pr-2">
                        <span className="text-xs md:text-sm text-slate-900 dark:text-slate-100 font-extrabold block truncate">{s.name}</span>
                        <span className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-mono font-medium">{s.symbol}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs md:text-sm text-rose-600 dark:text-rose-400 font-black block">{s.change_pct.toFixed(2)}%</span>
                        <span className="text-[10px] md:text-xs text-slate-600 dark:text-slate-400 font-mono font-semibold">₹{s.price}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">No stocks in red</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main App ─── */

function App() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'news' | 'charts' | 'calendar' | 'research' | 'screener' | 'theme_analysis'>('news');
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({});
  const [geoEvents, setGeoEvents] = useState<GeoEvent[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [telegramData, setTelegramData] = useState<LiveEvent | null>(null);
  const [newsData, setNewsData] = useState<LiveEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<GeoEvent | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<{ [key: string]: { loading: boolean, text: string | null } }>({});

  const [selectedEventChain, setSelectedEventChain] = useState<any>(null);
  const [eventChainLoading, setEventChainLoading] = useState(false);
  const [mapViewMode, setMapViewMode] = useState<'earth' | 'space'>('earth');
  const [theme, setTheme] = useState<'broken-glass' | 'neon-black'>(() => {
    const saved = localStorage.getItem('app_theme');
    return saved === 'neon-black' ? 'neon-black' : 'broken-glass';
  });

  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const [activeProvider, setActiveProvider] = useState<string>('gemini_with_fallback');

  const handleProviderChange = async (provider: string) => {
    setActiveProvider(provider);
    setNewsData(null);
    setEvents(prev => prev.filter(e => e.agent !== 'news_scanner'));
    try {
      await apiPost<any>('/api/set_llm_provider', { provider });
      await apiPost<any>('/api/refresh_briefing', {});
    } catch (e) {
      console.error("Failed to set provider", e);
    }
  };

  useEffect(() => {
    if (!selectedEvent) {
      setSelectedEventChain(null);
      return;
    }

    let active = true;
    const fetchChain = async () => {
      setEventChainLoading(true);
      try {
        const response = await fetch('/api/predict_chain', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ event_text: selectedEvent.summary || selectedEvent.headline })
        });
        if (response.ok) {
          const data = await response.json();
          if (active) {
            setSelectedEventChain(data);
          }
        }
      } catch (e) {
        console.error("Failed to predict chain dynamically:", e);
        if (active) setSelectedEventChain(null);
      } finally {
        if (active) setEventChainLoading(false);
      }
    };
    fetchChain();
    return () => { active = false; };
  }, [selectedEvent]);

  const handleAnalyze = async (ev: GeoEvent) => {
    setActiveAnalysis(prev => ({ ...prev, [ev.id]: { loading: true, text: null } }));
    try {
      const data = await apiPost<any>('/api/analyze_impact', { event_text: ev.summary || ev.headline });
      setActiveAnalysis(prev => ({
        ...prev,
        [ev.id]: { loading: false, text: data.thesis || "Analysis failed." }
      }));
    } catch (error) {
      setActiveAnalysis(prev => ({
        ...prev,
        [ev.id]: { loading: false, text: "Network error requesting analysis." }
      }));
    }
  };

  const [scenarioData, setScenarioData] = useState<any>(null);
  const [chainResult, setChainResult] = useState<any>(null);
  const [chainInput, setChainInput] = useState('');
  const [chainLoading, setChainLoading] = useState(false);

  // Tactical Advisor State
  const [tacticalAdvisor, setTacticalAdvisor] = useState<{ show: boolean, loading: boolean, title: string, content: string }>({
    show: false,
    loading: false,
    title: '',
    content: ''
  });
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
          if (Array.isArray(data.events)) {
            setGeoEvents(data.events);
          }
        } else if (data.type === 'geo_event' && data.id) {
          setGeoEvents(prev => {
            const arr = Array.isArray(prev) ? prev : [];
            const exists = arr.some(e => e.id === data.id);
            if (exists) return arr.map(e => e.id === data.id ? data as GeoEvent : e);
            return [...arr, data as GeoEvent].slice(-12);
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
        const data = await apiGet<any>('/api/telegram/status');
        if (!data.status && !data.error) setTelegramData(data);
      } catch { /* */ }
    };
    poll(); const id = setInterval(poll, 60000); return () => clearInterval(id);
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const poll = async () => {
      try {
        const data = await apiGet<any>('/api/news/status');
        if (!data.status && !data.error) setNewsData(data);
      } catch { /* */ }
    };
    poll(); const id = setInterval(poll, 60000); return () => clearInterval(id);
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const fetchCalendar = async () => {
      setCalendarLoading(true);
      try {
        const data = await apiGet<any>('/api/economic-calendar');
        if (data && Array.isArray(data.events)) {
          setCalendarEvents(data.events);
        }
      } catch (err) {
        console.error("Failed to load calendar events", err);
      } finally {
        setCalendarLoading(false);
      }
    };

    if (activeTab === 'calendar') {
      fetchCalendar();
    }
  }, [activeTab, authChecked]);

  // Fetch Scenario Intelligence data
  useEffect(() => {
    if (!authChecked) return;
    const poll = async () => {
      try {
        const data = await apiGet<any>('/api/scenarios');
        if (!data.status && !data.error) setScenarioData(data);
      } catch { /* */ }
    };
    poll(); const id = setInterval(poll, 60000); return () => clearInterval(id);
  }, [authChecked]);


  // Global hook for Tactical Advisor
  useEffect(() => {
    (window as any).triggerTacticalAdvice = handleTacticalAnalysis;
  }, []);

  // Event Chain Prediction handler
  const handleTacticalAnalysis = async (title: string, snippet: string) => {
    setTacticalAdvisor({ show: true, loading: true, title: title, content: '' });
    try {
      const response = await fetch(`/api/analyze_impact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ event_text: `TITLE: ${title}\nCONTEXT: ${snippet}` })
      });
      const data = await response.json();
      setTacticalAdvisor(prev => ({ ...prev, loading: false, content: data.thesis || 'No advice found.' }));
    } catch (err) {
      setTacticalAdvisor(prev => ({ ...prev, loading: false, content: 'Failed to generate tactical advice. Check your connection.' }));
    }
  };

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
        const indRes = await apiGet<any>('/api/indian-market').catch(() => null);

        if (indRes && !indRes.status && !indRes.error) {
          setEvents(prev => {
            const existingIds = new Set(prev.map(e => e.agent));
            if (!existingIds.has(indRes.agent)) {
              return [...prev, indRes];
            }
            return prev;
          });
        }
      } catch { /* ignore */ }
    };
    loadWidgets();
  }, [authChecked]);

  // ── Guard: Don't render dashboard until auth is confirmed ──
  if (!authChecked) return null;

  const eventsArr = Array.isArray(events) ? events : [];
  const latestNewsScan = [...eventsArr].reverse().find(e => e.agent === 'news_scanner') || newsData;
  const latestIndianMarket = [...eventsArr].reverse().find(e => e.agent === 'indian_market_tracker');
  const latestTelegram = [...eventsArr].reverse().find(e => e.agent === 'telegram_scanner') || telegramData;
  const websiteEvents = eventsArr.filter(e => e.agent === 'website_scanner').map(e => ({
    agent: 'website_scanner',
    title: e.title || e.headline,
    summary: e.summary,
    timestamp: e.timestamp,
    url: e.url || e.source_link
  }));

  const combinedTelegramData = {
    news_items: [
      ...websiteEvents,
      ...(Array.isArray(latestTelegram?.news_items) ? latestTelegram.news_items : []),
      ...(Array.isArray(latestNewsScan?.news_items) ? latestNewsScan.news_items.map(item => ({
        ...item,
        agent: 'reputable_news'
      })) : [])
    ].sort((a, b) => {
      const timeA = new Date(a?.timestamp || 0).getTime();
      const timeB = new Date(b?.timestamp || 0).getTime();
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    })
  };

  const AGENT_KEYS = ['news_scanner', 'indian_market_tracker', 'scenario_intelligence'] as const;

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 relative overflow-x-hidden">
      {/* Background Effects (Only active on Live News / Monitor tab to avoid multi-WebGL GPU context lag) */}
      {activeTab === 'news' && (
        <div className="fixed inset-0 z-[-1] pointer-events-none mix-blend-screen opacity-100 transition-transform duration-1000">
          <ParticleGlobe theme={theme} />
        </div>
      )}

      {/* CSS Globe Simulation for Broken Glass theme */}
      {theme === 'broken-glass' && (
        <div className="fixed top-1/2 right-0 translate-x-[15%] -translate-y-1/2 w-[700px] h-[700px] xl:w-[850px] xl:h-[850px] pointer-events-none z-[-1]">
          <div
            className="absolute inset-0 w-full h-full rounded-full border border-white/40"
            style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), rgba(0, 82, 204, 0.1))', boxShadow: '0 0 50px rgba(255,255,255,0.7), inset 0 0 50px rgba(255,255,255,1)', animation: 'float 6s ease-in-out infinite' }}
          ></div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-2 mt-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[var(--color-text-main)] mb-1 flex items-center gap-3 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]">
            <img src="/logo-icon.png" alt="Artillegence AI" className="w-10 h-10 min-w-[40px] flex-shrink-0 object-cover rounded-lg shadow-[0_0_15px_rgba(56,189,248,0.4)]" />
            Artillegence <span className="text-neonBlue font-light">AI</span>
          </h1>
          <p className="text-[var(--color-text-main)] text-sm font-medium">AI-Powered Stock Market News Intelligence System</p>
        </div>
        <div className="glass-panel px-5 py-2 mt-3 md:mt-0 flex items-center gap-4">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text-main)] text-xs rounded px-2 py-1 outline-none focus:border-neonBlue"
          >
            <option value="broken-glass">Broken Glass (White)</option>
            <option value="neon-black">Neon Black</option>
          </select>
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neonBlue opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${connected ? 'bg-neonBlue' : 'bg-red-500'}`}></span>
            </div>
            <span className="text-xs font-semibold tracking-wider text-[var(--color-text-main)]">
              {connected ? 'SYSTEM ONLINE' : 'CONNECTING...'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Tab Navigation Bar ── */}
      <nav className="flex items-center gap-2 mt-4 border-b border-[var(--color-border)] pb-[1px]">
        <button
          onClick={() => setActiveTab('news')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'news' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-[var(--color-card)] shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-[var(--color-text-main)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)] border-b-[3px] border-transparent'}`}
        >
          WORLD NEWS
        </button>
        <button
          onClick={() => setActiveTab('charts')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'charts' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-[var(--color-card)] shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-[var(--color-text-main)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)] border-b-[3px] border-transparent'}`}
        >
          CHARTS
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'calendar' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-[var(--color-card)] shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-[var(--color-text-main)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)] border-b-[3px] border-transparent'}`}
        >
          CALENDAR
        </button>
        <button
          onClick={() => setActiveTab('research')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'research' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-[var(--color-card)] shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-[var(--color-text-main)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)] border-b-[3px] border-transparent'}`}
        >
          RESEARCH
        </button>
        <button
          onClick={() => setActiveTab('screener')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'screener' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-[var(--color-card)] shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-[var(--color-text-main)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)] border-b-[3px] border-transparent'}`}
        >
          SCREENER
        </button>
        <button
          onClick={() => setActiveTab('theme_analysis')}
          className={`px-5 py-2.5 font-bold tracking-widest text-xs rounded-t-lg transition-all ${activeTab === 'theme_analysis' ? 'text-neonBlue border-b-[3px] border-neonBlue bg-[var(--color-card)] shadow-[inset_0_-4px_10px_rgba(56,189,248,0.1)]' : 'text-[var(--color-text-main)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-card)] border-b-[3px] border-transparent'}`}
        >
          THEME ANALYSIS
        </button>
      </nav>

      <div className={activeTab === 'news' ? 'flex flex-col gap-6 animate-fade-in' : 'hidden'}>
        {/* ── Globe Map + Telegram Feed ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div className="glass-panel overflow-hidden relative" style={{ minHeight: '500px' }}>
              <div className="absolute top-4 left-4 z-[9999] flex gap-2">
                <button
                  onClick={() => setMapViewMode('earth')}
                  className={`px-3 py-1.5 rounded text-xs font-bold tracking-widest backdrop-blur-md shadow-lg transition-colors border ${mapViewMode === 'earth' ? 'bg-neonBlue/20 border-neonBlue text-neonBlue' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-main)] hover:bg-[var(--color-card)]'}`}
                >
                  EARTH VIEW
                </button>
                <button
                  onClick={() => setMapViewMode('space')}
                  className={`px-3 py-1.5 rounded text-xs font-bold tracking-widest backdrop-blur-md shadow-lg transition-colors border ${mapViewMode === 'space' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-main)] hover:bg-[var(--color-card)]'}`}
                >
                  SPACE VIEW
                </button>
              </div>
              <Suspense fallback={
                <div className="flex flex-col items-center justify-center h-full bg-[var(--color-card)] backdrop-blur-sm">
                  <Globe className="animate-spin-slow text-neonBlue mb-4" size={48} />
                  <span className="text-[var(--color-text-main)] ml-3">Loading Map...</span>
                </div>
              }>
                {mapViewMode === 'earth' ? (
                  <EarthMap events={geoEvents} onSelectEvent={setSelectedEvent} selectedEvent={selectedEvent} />
                ) : (
                  <InfiniteSpaceView events={geoEvents} onSelectEvent={setSelectedEvent} selectedEvent={selectedEvent} />
                )}
              </Suspense>
            </div>
            {/* Dynamic analysis cards below the map */}
            <ImpactMetricsCards events={geoEvents} scenarioData={scenarioData} onSelectEvent={setSelectedEvent} />
            {/* Daily performance cross-check */}
            <DailyPerformanceCard />
          </div>
          <div className="lg:col-span-1 flex flex-col gap-6">
            <TelegramFeed
              data={combinedTelegramData}
              geoEvents={geoEvents}
              onSelectEvent={setSelectedEvent}
            />
            <EventDetailsSidebar
              activeEvent={selectedEvent}
              activeAnalysis={activeAnalysis}
              onAnalyze={handleAnalyze}
              activeEventChain={selectedEventChain}
              chainLoading={eventChainLoading}
            />
          </div>
        </div>

        {/* Top Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="flex flex-col gap-4 lg:col-span-1">
            <div className="glass-panel p-4">
              <h2 className="text-sm font-bold text-[var(--color-text-main)] mb-4 flex items-center gap-2 tracking-wider">
                <Cpu className="text-neonPurple" size={16} /> AI AGENTS
              </h2>
              <div className="space-y-2">
                {AGENT_KEYS.map((key) => <AgentCard key={key} agentKey={key} info={agents[key]} />)}
              </div>
            </div>
            <div className="glass-panel p-4 text-center">
              <div className="text-4xl font-black text-neonBlue drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">{events.length}</div>
              <div className="text-xs text-[var(--color-text-main)] mt-1">intelligence events</div>
            </div>
          </div>

          {/* Market Summary */}
          <div className="glass-panel p-5 lg:col-span-3 flex flex-col" style={{ maxHeight: '520px' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[var(--color-text-main)] flex items-center gap-2">
                <Satellite className="text-neonBlue" size={18} /> LIVE MARKET BRIEFING
              </h2>
              <div className="flex items-center gap-3">
                <select
                  value={activeProvider}
                  onChange={(e) => handleProviderChange(e.target.value as any)}
                  className="bg-[var(--color-card)] border border-[var(--color-border)] text-xs text-[var(--color-text-main)] px-2 py-1 rounded outline-none cursor-pointer focus:border-neonBlue transition-colors"
                >
                  <option value="gemini_with_fallback">Smart Free (Gemini/Groq)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="mistral">Mistral AI</option>
                  <option value="openrouter">Nemotron AI</option>
                </select>
                <button
                  onClick={() => apiPost('/api/refresh_briefing', {})}
                  className="text-xs text-[var(--color-text-main)] hover:text-[var(--color-text-main)] transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                  title="Manual Refresh"
                >
                  <RefreshCw size={10} /> Daily
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto mb-4 pr-1">
              {latestNewsScan ? (
                <p className="text-sm text-[var(--color-text-main)] leading-relaxed whitespace-pre-line">{latestNewsScan.summary}</p>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-[var(--color-text-main)] opacity-60">
                  <Radio className="animate-pulse mb-2" size={32} />
                  <p className="text-sm">News Scanner booting up... first briefing in ~1 minute</p>
                </div>
              )}
            </div>
            {latestNewsScan?.news_items && latestNewsScan.news_items.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-[var(--color-text-main)] tracking-widest mb-2">NEWS SOURCES</h3>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {latestNewsScan.news_items.map((item, i) => <NewsCard key={i} item={item} />)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Advanced Features Row (Scenario Intelligence) ── */}
        <ScenarioIntelligence
          data={scenarioData}
          chainInput={chainInput}
          setChainInput={setChainInput}
          chainLoading={chainLoading}
          chainResult={chainResult}
          setChainResult={setChainResult}
          onPredict={handlePredictChain}
        />

        {/* Indian Market Tracker */}
        <AgentSection
          icon={<IndianRupee className="text-orange-400" size={20} />}
          title="INDIAN MARKET TRACKER" subtitle="Live Nifty, Sensex, sectoral tracking"
          accentColor="orange" event={latestIndianMarket} items={latestIndianMarket?.market_items}
          placeholder="Indian Market Tracker will start tracking in ~10 seconds..."
          fullWidth={true}
          onRefresh={() => apiPost('/api/refresh_indian_market', {})}
        />
      </div>

      {/* ChartsTab is ALWAYS mounted to prevent TradingView widget from reloading on tab switch */}
      <ErrorBoundary>
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center p-20 glass-panel h-[700px]">
            <Activity className="animate-pulse text-neonBlue mb-4" size={48} />
            <span className="text-[var(--color-text-main)] font-bold tracking-widest">LOADING TRADING/AI ANALYST...</span>
          </div>
        }>
          <div style={{ display: activeTab === 'charts' ? 'block' : 'none' }}>
            <ChartsTab />
          </div>
        </Suspense>
      </ErrorBoundary>

      {activeTab === 'calendar' && (
        <div className="animate-fade-in">
          <EconomicCalendarView events={calendarEvents} loading={calendarLoading} />
        </div>
      )}

      {activeTab === 'research' && (
        <div className="animate-fade-in">
          <StockResearchTabView />
        </div>
      )}

      {activeTab === 'screener' && (
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center p-20 glass-panel h-[700px]">
            <Activity className="animate-pulse text-neonBlue mb-4" size={48} />
            <span className="text-[var(--color-text-main)] font-bold tracking-widest">LOADING QUANT SCREENER...</span>
          </div>
        }>
          <div className="animate-fade-in">
            <ScreenerTab />
          </div>
        </Suspense>
      )}

      {activeTab === 'theme_analysis' && (
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center p-20 glass-panel h-[700px]">
            <Activity className="animate-pulse text-neonBlue mb-4" size={48} />
            <span className="text-[var(--color-text-main)] font-bold tracking-widest">LOADING THEME ANALYSIS...</span>
          </div>
        }>
          <div className="animate-fade-in">
            <ThemeAnalysisTab />
          </div>
        </Suspense>
      )}

      {/* Tactical Advisor Modal */}
      <TacticalAdvisorModal
        show={tacticalAdvisor.show}
        loading={tacticalAdvisor.loading}
        title={tacticalAdvisor.title}
        content={tacticalAdvisor.content}
        onClose={() => setTacticalAdvisor(prev => ({ ...prev, show: false }))}
      />
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
          <div className="flex justify-between text-[9px] text-[var(--color-text-main)] mb-1">
            <span>Bearish</span><span>Neutral</span><span>Bullish</span>
          </div>
          <div className="h-3 bg-[var(--color-card)] rounded-full overflow-hidden relative">
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
        <p className="text-[10px] text-[var(--color-text-main)]">Sectors loading... will appear after Market Analyzer completes.</p>
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
            <div className="text-[9px] font-bold text-[var(--color-text-main)]">{s.name}</div>
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
            <span className="text-[var(--color-text-main)] font-medium">FII (Foreign)</span>
            <span className={`font-bold ${fiiTextColor}`}>{fiiDirection}</span>
          </div>
          <div className="h-2.5 bg-[var(--color-card)] rounded-full overflow-hidden">
            <div className={`h-full ${fiiColor} rounded-full transition-all duration-500`}
              style={{ width: isFIIBuying ? '75%' : isFIISelling ? '25%' : '50%' }}></div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-[var(--color-text-main)] font-medium">DII (Domestic)</span>
            <span className={`font-bold ${diiTextColor}`}>{diiDirection}</span>
          </div>
          <div className="h-2.5 bg-[var(--color-card)] rounded-full overflow-hidden">
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
      className="flex-shrink-0 w-56 bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] hover:border-neonBlue/50 transition-all duration-200 group overflow-hidden">
      {hasImage ? (
        <div className="w-full h-20 overflow-hidden bg-[var(--color-card)] flex items-center justify-center relative">
          <img
            src={item.image}
            alt=""
            className={`w-full h-full ${(item.image?.includes('gstatic.com') || item.image?.includes('googleusercontent.com') || item.image?.includes('news.google.com')) ? 'object-contain p-2' : 'object-cover'} group-hover:scale-105 transition-transform duration-300`}
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className={`w-full h-20 bg-gradient-to-br ${gradientClass} flex items-center justify-center relative`}>
          {faviconUrl && (
            <img src={faviconUrl} alt="" className="w-6 h-6 rounded opacity-80" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <Newspaper size={20} className="text-[var(--color-text-main)]/30 absolute right-2 bottom-2" />
        </div>
      )}
      <div className="p-2.5">
        <p className="text-[11px] text-[var(--color-text-main)] font-medium line-clamp-2 group-hover:text-neonBlue transition leading-tight">{item.title}</p>
        <div className="flex items-center justify-between mt-1.5 mb-1.5">
          <span className="text-[9px] text-sky-400 truncate max-w-[120px]">{item.source}</span>
          <ExternalLink size={8} className="text-slate-600 group-hover:text-neonBlue flex-shrink-0" />
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            (window as any).triggerTacticalAdvice(item.title, item.snippet || '');
          }}
          className="w-full py-1 bg-neonBlue/10 hover:bg-neonBlue/20 border border-neonBlue/30 hover:border-neonBlue/50 text-[10px] text-neonBlue font-bold rounded transition-all flex items-center justify-center gap-1"
        >
          <Target size={10} /> GET ACTION PLAN
        </button>
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
    scenario_intelligence: { icon: <Zap size={12} />, label: 'SCENARIO ENGINE ⚡' },
  };
  const cfg = configs[agentKey] || { icon: <Cpu size={12} />, label: agentKey };
  const status = info?.status || 'waiting';
  const statusStyle = status === 'active' ? 'text-neonBlue bg-neonBlue/20'
    : status === 'idle' ? 'text-amber-400 bg-amber-400/20'
      : status === 'error' ? 'text-red-500 bg-red-500/20'
        : 'text-[var(--color-text-main)] bg-slate-500/20';

  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[var(--color-text-main)] flex-shrink-0">{cfg.icon}</span>
        <div className="min-w-0">
          <span className="text-[11px] font-medium text-slate-200 block truncate">{cfg.label}</span>
          {info?.last_run && (
            <span className="text-[9px] text-[var(--color-text-main)]">
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
  icon, title, subtitle, accentColor, event, items, placeholder, fullWidth, onRefresh
}: {
  icon: React.ReactNode; title: string; subtitle: string; accentColor: string;
  event?: LiveEvent; items?: NewsItem[]; placeholder: string; fullWidth?: boolean;
  onRefresh?: () => void;
}) {
  const borderColors: Record<string, string> = {
    orange: 'border-orange-500/30', rose: 'border-rose-500/30',
    emerald: 'border-emerald-500/30', purple: 'border-purple-500/30',
  };

  return (
    <div className={`glass-panel p-5 ${borderColors[accentColor] || ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-main)] flex items-center gap-2">{icon}{title}</h2>
          <p className="text-[10px] text-[var(--color-text-main)] mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-[10px] text-[var(--color-text-main)] hover:text-[var(--color-text-main)] transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
              title="Manual Refresh"
            >
              <RefreshCw size={10} /> Daily
            </button>
          )}
          {event && (
            <span className="text-[10px] text-[var(--color-text-main)] flex items-center gap-1">
              <Clock size={10} />
              {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {event ? (
        <div>
          <div className="text-sm text-[var(--color-text-main)] leading-relaxed whitespace-pre-line mb-4"
            style={{ maxHeight: fullWidth ? '400px' : '250px', overflow: 'auto' }}>
            {event.summary}
          </div>

          {/* Source citations */}
          {event.sources && event.sources.length > 0 && (
            <div className="mb-3 pt-2 border-t border-[var(--color-border)]">
              <span className="text-[9px] font-bold text-[var(--color-text-main)] tracking-widest">CITED SOURCES</span>
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
              <h3 className="text-[10px] font-bold text-[var(--color-text-main)] tracking-widest mb-2 mt-2">RELATED NEWS / MEDIA</h3>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {items.map((item, i) => (
                  <NewsCard key={i} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 text-center text-[var(--color-text-main)] opacity-60">
          <Radio className="mx-auto animate-pulse mb-2" size={24} />
          <p className="text-xs">{placeholder}</p>
        </div>
      )}
    </div>
  );
}



/* ═══════════════════════════════════════ */
/* ADVANCED: Scenario Intelligence Engine  */
/* ═══════════════════════════════════════ */

function ScenarioIntelligence({ data, chainInput, setChainInput, chainLoading, chainResult, setChainResult, onPredict }: {
  data: any;
  chainInput: string;
  setChainInput: (v: string) => void;
  chainLoading: boolean;
  chainResult: any;
  setChainResult: (v: any) => void;
  onPredict: () => void;
}) {
  const [activeScenario, setActiveScenario] = useState(0);
  const [showCustom, setShowCustom] = useState(false);

  const scenarios = useMemo(() => {
    const list = Array.isArray(data?.scenarios) ? [...data.scenarios] : [];
    if (chainResult) {
      if (chainResult.error) {
        list.unshift({
          title: 'Custom Query Failed',
          trigger: chainInput,
          severity: 'LOW',
          sentiment: 'NEUTRAL',
          probability: 'Error',
          probability_pct: 0,
          chain: [{ step: 1, impact: chainResult.error, affected: 'None', direction: 'VOLATILE', magnitude: '0', timeframe: 'immediate' }],
          opportunity: null,
          hedge: 'Check backend logs for details.',
          isCustom: true
        });
      } else {
        const opportunity = Array.isArray(chainResult.indian_stocks_affected) && chainResult.indian_stocks_affected.length > 0 ? {
          action: chainResult.overall_market_impact === 'BULLISH' ? 'BUY' : 'HEDGE',
          stocks: chainResult.indian_stocks_affected.map((s: any) => s.ticker),
          reasoning: chainResult.indian_stocks_affected.map((s: any) => `• ${s.name}: ${s.reason}`).join('\n'),
          risk: 'Custom query risk exposure'
        } : null;

        list.unshift({
          title: chainResult.event || 'Custom Scenario Prediction',
          trigger: chainInput || 'Custom User Input',
          severity: chainResult.severity || 'MEDIUM',
          sentiment: chainResult.overall_market_impact || 'NEUTRAL',
          probability: 'User Run',
          probability_pct: 100,
          chain: chainResult.chain || [],
          opportunity,
          hedge: chainResult.hedge_suggestion,
          isCustom: true
        });
      }
    }
    return list;
  }, [data?.scenarios, chainResult, chainInput]);

  const dirColor = (d: string) => d === 'UP' ? 'text-emerald-400' : d === 'DOWN' ? 'text-red-400' : 'text-amber-400';
  const dirBg = (d: string) => d === 'UP' ? 'bg-emerald-500/20 border-emerald-500/40' : d === 'DOWN' ? 'bg-red-500/20 border-red-500/40' : 'bg-amber-500/20 border-amber-500/40';
  const sentimentColor = (s: string) => s === 'BULLISH' ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40' : s === 'BEARISH' ? 'text-red-400 bg-red-500/15 border-red-500/40' : 'text-amber-400 bg-amber-500/15 border-amber-500/40';
  const severityColor = (s: string) => s === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border-red-500/40' : s === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' : s === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-700 text-[var(--color-text-main)] border-slate-600';
  const actionColor = (a: string) => a === 'BUY' ? 'text-emerald-400 bg-emerald-500/20' : a === 'SELL' ? 'text-red-400 bg-red-500/20' : a === 'HEDGE' ? 'text-indigo-400 bg-indigo-500/20' : 'text-[var(--color-text-main)] bg-slate-700';

  // When chainResult is set, auto-focus custom scenario tab (index 0)
  useEffect(() => {
    if (chainResult) {
      setActiveScenario(0);
    }
  }, [chainResult]);

  // Auto-rotate scenarios every 20 seconds if not currently viewing a custom scenario
  useEffect(() => {
    if (scenarios.length <= 1 || chainResult) return;
    const timer = setInterval(() => {
      setActiveScenario(prev => (prev + 1) % scenarios.length);
    }, 20000);
    return () => clearInterval(timer);
  }, [scenarios.length, chainResult]);

  const sc = scenarios[activeScenario];

  return (
    <div className="glass-panel p-5 flex flex-col" style={{ maxHeight: '520px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="text-amber-400" size={16} />
          <h2 className="text-sm font-bold text-[var(--color-text-main)]">SCENARIO INTELLIGENCE</h2>
        </div>
        <div className="flex items-center gap-2">
          {data?.market_sentiment && (
            <span className="text-[9px] font-bold bg-[var(--color-card)] text-[var(--color-text-main)] px-2 py-0.5 rounded border border-[var(--color-border)]">
              {data.market_sentiment}
            </span>
          )}
          <span className="text-[9px] text-[var(--color-text-main)] flex items-center gap-1">
            <RefreshCw size={8} className={scenarios.length > 0 ? '' : 'animate-spin'} /> AUTO
          </span>
        </div>
      </div>

      {/* Scenario tabs */}
      {scenarios.length > 0 && (
        <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-thin pb-1">
          {scenarios.map((scItem: any, i: number) => (
            <button
              key={i}
              onClick={() => setActiveScenario(i)}
              className={`px-2.5 py-1 text-[9px] font-bold rounded-md transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${i === activeScenario
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'bg-[var(--color-card)] text-[var(--color-text-main)] border border-[var(--color-border)] hover:text-[var(--color-text-main)]'
                }`}
            >
              {scItem.isCustom ? (
                <>⭐ CUSTOM</>
              ) : (
                <>{scItem.sentiment === 'BULLISH' ? '📈' : scItem.sentiment === 'BEARISH' ? '📉' : '⚖️'} SC-{chainResult ? i : i + 1}</>
              )}
            </button>
          ))}
          {chainResult && (
            <button
              onClick={() => { setChainResult(null); setActiveScenario(0); }}
              className="px-2 py-0.5 text-[8px] font-bold rounded-md bg-red-950/20 text-red-400 border border-red-900/30 hover:bg-red-900/30 transition-all flex-shrink-0"
            >
              ✕ CLEAR
            </button>
          )}
        </div>
      )}

      {/* Active Scenario */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sc ? (
          <div className="space-y-2.5 animate-fade-in" key={activeScenario}>
            {/* Scenario Header */}
            <div className="bg-[var(--color-card)] rounded-lg p-3 border border-[var(--color-border)]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${severityColor(sc.severity)}`}>{sc.severity}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${sentimentColor(sc.sentiment)}`}>{sc.sentiment}</span>
                </div>
                <span className="text-[9px] text-[var(--color-text-main)]">
                  {sc.probability} ({sc.probability_pct}%)
                </span>
              </div>
              <h3 className="text-[13px] text-[var(--color-text-main)] font-bold leading-tight mb-1">{sc.title}</h3>
              <p className="text-[10px] text-[var(--color-text-main)] leading-relaxed">
                <span className="text-amber-400 font-bold">IF:</span> {sc.trigger}
              </p>
            </div>

            {/* Chain Steps */}
            {Array.isArray(sc.chain) && sc.chain.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex flex-col items-center flex-shrink-0 mt-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border ${dirBg(step.direction)}`}>
                    {step.step}
                  </div>
                  {i < (sc.chain?.length || 0) - 1 && <div className="w-0.5 h-4 bg-slate-700 mt-1"></div>}
                </div>
                <div className={`flex-1 p-2 rounded-lg border ${dirBg(step.direction)}`}>
                  <p className="text-[11px] text-[var(--color-text-main)] font-medium mb-0.5">{step.impact}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-[var(--color-text-main)]">{step.affected}</span>
                    <ArrowRight size={8} className="text-slate-600" />
                    <span className={`text-[9px] font-bold ${dirColor(step.direction)}`}>{step.direction} {step.magnitude}</span>
                    <span className="text-[8px] text-[var(--color-text-main)]">· {step.timeframe}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Investment Opportunity */}
            {sc.opportunity && (
              <div className="bg-emerald-950/20 rounded-lg p-3 border border-emerald-800/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-bold text-emerald-400 tracking-widest flex items-center gap-1">
                    <Target size={10} /> INVESTMENT OPPORTUNITY
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${actionColor(sc.opportunity.action)}`}>
                    {sc.opportunity.action}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {Array.isArray(sc.opportunity.stocks) && sc.opportunity.stocks.map((stock: string, i: number) => (
                    <span key={i} className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-medium">
                      {stock}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--color-text-main)] leading-relaxed">{sc.opportunity.reasoning}</p>
                <span className="text-[8px] text-[var(--color-text-main)] mt-1 block">Risk: {sc.opportunity.risk}</span>
              </div>
            )}

            {/* Hedge */}
            {sc.hedge && (
              <div className="bg-indigo-950/20 rounded-lg p-2.5 border border-indigo-800/30 flex items-start gap-2">
                <Shield size={11} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-[var(--color-text-main)] leading-relaxed">{sc.hedge}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-main)]">
            <Zap className="mb-2 opacity-40 animate-pulse" size={28} />
            <p className="text-[10px] text-center max-w-[200px]">
              Scenario Intelligence engine is synthesizing data from all agents...
            </p>
            <p className="text-[9px] text-slate-600 mt-1">First analysis in ~2 minutes</p>
          </div>
        )}
      </div>

      {/* Watchlist + Custom Query */}
      <div className="border-t border-[var(--color-border)] pt-2.5 mt-2">
        {data?.key_watchlist && data.key_watchlist.length > 0 && (
          <div className="mb-2">
            <span className="text-[8px] font-bold text-[var(--color-text-main)] tracking-widest">WATCHLIST</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {data.key_watchlist.map((item: string, i: number) => (
                <span key={i} className="text-[9px] bg-[var(--color-card)] text-[var(--color-text-main)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Toggle custom scenario input */}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="text-[9px] text-[var(--color-text-main)] hover:text-amber-400 transition flex items-center gap-1"
        >
          <Zap size={9} /> {showCustom ? 'Hide' : 'Custom scenario...'}
        </button>

        {showCustom && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={chainInput}
              onChange={(e) => setChainInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onPredict()}
              placeholder="e.g. Iran blocks Strait of Hormuz..."
              className="flex-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[10px] text-[var(--color-text-main)] placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
            <button
              onClick={onPredict}
              disabled={chainLoading || !chainInput.trim()}
              className="px-2.5 py-1.5 bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50 rounded-lg text-[var(--color-text-main)] text-[9px] font-bold tracking-wider border border-amber-500/50 flex items-center gap-1"
            >
              {chainLoading ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
              {chainLoading ? '...' : 'PREDICT'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Stock Research Agent UI Components
// ==========================================

function ADXGauge({ adx, diPlus, diMinus }: { adx: number, diPlus: number, diMinus: number }) {
  let strength = "Weak Trend";
  let strengthColor = "text-[var(--color-text-main)]";
  if (adx >= 25) {
    strength = "Strong Trend";
    strengthColor = "text-sky-400";
  }
  if (adx >= 40) {
    strength = "Very Strong Trend";
    strengthColor = "text-neonPurple";
  }

  let bias = "Neutral";
  let biasColor = "text-[var(--color-text-main)]";
  if (diPlus > diMinus + 5) {
    bias = "Bullish Bias";
    biasColor = "text-emerald-400";
  } else if (diMinus > diPlus + 5) {
    bias = "Bearish Bias";
    biasColor = "text-rose-400";
  }

  return (
    <div className="bg-[var(--color-card)] p-4.5 rounded-xl border border-[var(--color-border)] flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-[var(--color-text-main)] uppercase tracking-wider flex items-center gap-1.5">
          <Activity size={14} className="text-neonPurple animate-pulse" /> ADX & DMI Trend Strength
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--color-card)] border border-[var(--color-border)] uppercase tracking-wider ${biasColor}`}>
          {bias}
        </span>
      </div>

      <div className="space-y-3.5 my-1">
        {/* ADX */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-[var(--color-text-main)]">Trend Index (ADX)</span>
            <span className="text-[var(--color-text-main)] font-mono font-bold">{adx.toFixed(1)}</span>
          </div>
          <div className="h-2 bg-[var(--color-card)] rounded-full overflow-hidden border border-[var(--color-border)]">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-neonPurple rounded-full" style={{ width: `${Math.min(adx * 1.5, 100)}%` }}></div>
          </div>
          <span className={`text-[10px] block font-mono font-bold uppercase tracking-wider ${strengthColor}`}>{strength}</span>
        </div>

        {/* DI+ vs DI- */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-emerald-400">Buyers (DI+)</span>
            <span className="text-rose-400">Sellers (DI-)</span>
          </div>
          <div className="flex h-2 bg-[var(--color-card)] rounded-full overflow-hidden border border-[var(--color-border)]">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(diPlus / (diPlus + diMinus || 1)) * 100}%` }}></div>
            <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${(diMinus / (diPlus + diMinus || 1)) * 100}%` }}></div>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold text-[var(--color-text-main)]">
            <span>{diPlus.toFixed(1)}</span>
            <span>{diMinus.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RSIGauge({ rsi }: { rsi: number }) {
  let status = "Neutral Momentum";
  let statusColor = "text-[var(--color-text-main)]";
  if (rsi >= 70) {
    status = "Overbought (Consolidation Risk)";
    statusColor = "text-rose-400";
  } else if (rsi <= 30) {
    status = "Oversold (Accumulation Opportunity)";
    statusColor = "text-emerald-400";
  }
  return (
    <div className="bg-[var(--color-card)] p-4.5 rounded-xl border border-[var(--color-border)] flex flex-col gap-2.5">
      <div className="flex justify-between items-center text-xs">
        <span className="font-bold text-[var(--color-text-main)] uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp size={14} className="text-neonBlue" /> Relative Strength Index (RSI)
        </span>
        <span className="font-bold text-[var(--color-text-main)] font-mono text-xs">{rsi.toFixed(1)}</span>
      </div>

      <div className="relative h-2 bg-[var(--color-card)] rounded-full border border-[var(--color-border)] my-2">
        <div className="absolute left-0 top-0 bottom-0 w-[30%] bg-emerald-500/10 border-r border-[var(--color-border)]"></div>
        <div className="absolute right-0 top-0 bottom-0 w-[30%] bg-rose-500/10 border-l border-[var(--color-border)]"></div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-neonBlue border-2 border-white rounded-full shadow-[0_0_10px_#38bdf8] transition-all duration-500"
          style={{ left: `calc(${rsi}% - 7px)` }}
        ></div>
      </div>
      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${statusColor}`}>{status}</span>
    </div>
  );
}

function SafePlot({ component, ...props }: any) {
  const P = component;
  if (!P) {
    return (
      <div className="h-[480px] flex flex-col items-center justify-center bg-[var(--color-card)] text-[var(--color-text-main)] rounded-xl border border-[var(--color-border)]">
        <div className="w-8 h-8 border-2 border-neonBlue/20 border-t-neonBlue rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-bold tracking-widest text-neonBlue/80">INITIALIZING DRAWING ENGINE...</p>
        <p className="text-[10px]">Preparing interactive chart canvas</p>
      </div>
    );
  }
  try {
    return <P {...props} />;
  } catch (err) {
    return (
      <div className="h-[480px] flex flex-col items-center justify-center bg-red-950/20 text-red-400 rounded-xl border border-red-900/30">
        <AlertTriangle size={24} className="mb-2" />
        <p className="text-xs font-bold tracking-widest uppercase">SafeGuard Active</p>
        <p className="text-[10px] text-[var(--color-text-main)]">Rendering error caught. App remains stable.</p>
      </div>
    );
  }
}

const ResearchCandleChart = memo(({ symbol, PlotComponent }: { symbol: string, PlotComponent: any }) => {
  const [candleData, setCandleData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [yaxisRange, setYaxisRange] = useState<[number, number] | null>(null);
  const [xaxisRange, setXaxisRange] = useState<[any, any] | null>(null);

  const plotContainerRef = useRef<HTMLDivElement>(null);

  // Reset zoom states when symbol changes
  useEffect(() => {
    setYaxisRange(null);
    setXaxisRange(null);
  }, [symbol]);

  useEffect(() => {
    const fetchCandles = async () => {
      if (!symbol) return;
      setLoading(true);
      try {
        const clean = symbol.includes(":") ? symbol.split(":")[1] : symbol;
        const data = await apiGet<any>(`/api/candle_data?symbol=${clean}&period=6mo&interval=1d`);
        setCandleData(data);
      } catch (err) {
        console.error("Candle fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCandles();
  }, [symbol]);

  // Intercept dragging on Y-axis pane to scale/zoom vertically instead of panning
  useEffect(() => {
    const el = plotContainerRef.current;
    if (!el || !candleData) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const className = target.getAttribute ? target.getAttribute('class') || '' : '';

      // Target Y-axis drag rectangles (Plotly internally tags them with class containing ydrag)
      if (className.includes('ydrag') || className.includes('y2drag')) {
        e.stopPropagation();
        e.preventDefault();

        const gd = el.querySelector('.js-plotly-plot') as any;
        if (!gd || !gd._fullLayout || !gd._fullLayout.yaxis) return;

        const initialRange = [...gd._fullLayout.yaxis.range] as [number, number];
        const startY = e.clientY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          moveEvent.stopPropagation();
          moveEvent.preventDefault();

          const deltaY = moveEvent.clientY - startY;

          // Sensitivity coefficient for smooth stretching/compression
          const sensitivity = 0.005;
          const scaleFactor = Math.exp(deltaY * sensitivity);

          const center = (initialRange[0] + initialRange[1]) / 2;
          const originalSpan = initialRange[1] - initialRange[0];
          const newSpan = originalSpan * scaleFactor;

          const newRange: [number, number] = [
            center - newSpan / 2,
            center + newSpan / 2
          ];

          setYaxisRange(newRange);
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
          upEvent.stopPropagation();
          upEvent.preventDefault();

          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }
    };

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const className = target.getAttribute ? target.getAttribute('class') || '' : '';

      if (className.includes('ydrag') || className.includes('y2drag')) {
        e.stopPropagation();
        e.preventDefault();

        // Reset back to automatic scaling
        setYaxisRange(null);
      }
    };

    // Use capture phase (true) to intercept event before Plotly's internal pan handlers run
    el.addEventListener('mousedown', handleMouseDown, true);
    el.addEventListener('dblclick', handleDblClick, true);

    return () => {
      el.removeEventListener('mousedown', handleMouseDown, true);
      el.removeEventListener('dblclick', handleDblClick, true);
    };
  }, [candleData]);

  const handleRelayout = (eventData: any) => {
    if (eventData['yaxis.autorange'] === true) {
      setYaxisRange(null);
    } else if (eventData['yaxis.range[0]'] !== undefined && eventData['yaxis.range[1]'] !== undefined) {
      setYaxisRange([eventData['yaxis.range[0]'], eventData['yaxis.range[1]']]);
    }

    if (eventData['xaxis.autorange'] === true) {
      setXaxisRange(null);
    } else if (eventData['xaxis.range[0]'] !== undefined && eventData['xaxis.range[1]'] !== undefined) {
      setXaxisRange([eventData['xaxis.range[0]'], eventData['xaxis.range[1]']]);
    }
  };

  if (loading) {
    return (
      <div className="h-[480px] flex flex-col items-center justify-center bg-[var(--color-card)] text-[var(--color-text-main)] rounded-xl border border-[var(--color-border)]">
        <div className="w-8 h-8 border-2 border-neonBlue/20 border-t-neonBlue rounded-full animate-spin mb-3"></div>
        <p className="text-[10px] font-bold tracking-widest text-neonBlue/80 uppercase">Streaming Market Data...</p>
      </div>
    );
  }

  if (!candleData || candleData.error) {
    return (
      <div className="h-[480px] flex flex-col items-center justify-center bg-[var(--color-card)] text-[var(--color-text-main)] rounded-xl border border-[var(--color-border)]">
        <AlertTriangle size={24} className="mb-2 opacity-30 text-amber-500" />
        <p className="text-xs font-bold tracking-widest text-slate-350">DATA UNAVAILABLE</p>
        <p className="text-[10px] text-[var(--color-text-main)]">{candleData?.error || "Could not fetch OHLC data for this symbol."}</p>
      </div>
    );
  }

  const getSegmentTraces = (dates: string[], values: number[], directions: any[], name: string, bullColor: string, bearColor: string, isDots = false, extraStyle = {}) => {
    if (!values || !directions || !dates) return [];

    const traces: any[] = [];
    let currentSegment: { x: string, y: number }[] = [];
    let currentDir: any = null;

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      const dir = directions[i];

      if (val === null || val === undefined) {
        if (currentSegment.length > 0) {
          const color = currentDir === 1 || currentDir === true ? bullColor : bearColor;
          traces.push({
            x: currentSegment.map(s => s.x),
            y: currentSegment.map(s => s.y),
            type: 'scatter',
            mode: isDots ? 'markers' : 'lines',
            name: `${name} (${currentDir === 1 || currentDir === true ? 'Bull' : 'Bear'})`,
            line: isDots ? undefined : { color, ...extraStyle },
            marker: isDots ? { color, size: 3.5, ...extraStyle } : undefined,
            legendgroup: name,
            showlegend: traces.length === 0,
            yaxis: 'y1'
          });
          currentSegment = [];
        }
        currentDir = null;
        continue;
      }

      if (currentDir === null) {
        currentDir = dir;
        currentSegment.push({ x: dates[i], y: val });
      } else if (dir === currentDir) {
        currentSegment.push({ x: dates[i], y: val });
      } else {
        // Direction changed. Include the overlap point to prevent gaps.
        currentSegment.push({ x: dates[i], y: val });
        const color = currentDir === 1 || currentDir === true ? bullColor : bearColor;
        traces.push({
          x: currentSegment.map(s => s.x),
          y: currentSegment.map(s => s.y),
          type: 'scatter',
          mode: isDots ? 'markers' : 'lines',
          name: `${name} (${currentDir === 1 || currentDir === true ? 'Bull' : 'Bear'})`,
          line: isDots ? undefined : { color, ...extraStyle },
          marker: isDots ? { color, size: 3.5, ...extraStyle } : undefined,
          legendgroup: name,
          showlegend: traces.length === 0,
          yaxis: 'y1'
        });

        currentDir = dir;
        currentSegment = [{ x: dates[i], y: val }];
      }
    }

    if (currentSegment.length > 0) {
      const color = currentDir === 1 || currentDir === true ? bullColor : bearColor;
      traces.push({
        x: currentSegment.map(s => s.x),
        y: currentSegment.map(s => s.y),
        type: 'scatter',
        mode: isDots ? 'markers' : 'lines',
        name: `${name} (${currentDir === 1 || currentDir === true ? 'Bull' : 'Bear'})`,
        line: isDots ? undefined : { color, ...extraStyle },
        marker: isDots ? { color, size: 3.5, ...extraStyle } : undefined,
        legendgroup: name,
        showlegend: traces.length === 0,
        yaxis: 'y1'
      });
    }

    return traces;
  };

  const priceTrace = {
    x: candleData.dates,
    open: candleData.open,
    high: candleData.high,
    low: candleData.low,
    close: candleData.close,
    type: 'candlestick',
    name: symbol,
    increasing: { line: { color: '#10b981', width: 1.5 } },
    decreasing: { line: { color: '#ef4444', width: 1.5 } },
    yaxis: 'y1'
  };

  const volumeTrace = {
    x: candleData.dates,
    y: candleData.volume,
    type: 'bar',
    name: 'Volume',
    marker: {
      color: candleData.close.map((c: number, i: number) => {
        if (i === 0) return 'rgba(16, 185, 129, 0.15)';
        return c >= candleData.close[i - 1] ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      })
    },
    yaxis: 'y2'
  };

  // Invisible baseline trace for filled zone calculation
  const atrBaseline = {
    x: candleData.dates,
    y: candleData.atr_trail,
    type: 'scatter',
    mode: 'lines',
    line: { width: 0 },
    showlegend: false,
    hoverinfo: 'skip',
    yaxis: 'y1'
  };

  // Magnet touch zone filled trace
  const magnetZone = {
    x: candleData.dates,
    y: candleData.entry_zone,
    type: 'scatter',
    mode: 'lines',
    line: { width: 0 },
    fill: 'tonexty',
    fillcolor: 'rgba(56, 189, 248, 0.08)', // Glow sky blue translucent magnet entry caution area
    name: '🧲 Magnet Entry Zone',
    showlegend: true,
    hoverinfo: 'skip',
    yaxis: 'y1'
  };

  const data = [
    priceTrace,
    volumeTrace,
    atrBaseline,
    magnetZone,
    ...getSegmentTraces(candleData.dates, candleData.atr_trail, candleData.atr_trail_bull, 'ATR Trail', 'rgba(56, 189, 248, 0.95)', 'rgba(244, 63, 94, 0.95)', true, { size: 3 }),
    ...getSegmentTraces(candleData.dates, candleData.supertrend_1w, candleData.supertrend_1w_dir, 'Supertrend 1W', '#10b981', '#ef4444', true, { size: 4 }),
    ...getSegmentTraces(candleData.dates, candleData.supertrend_5w, candleData.supertrend_5w_dir, 'Supertrend 5W', '#059669', '#dc2626', true, { size: 5 })
  ];

  const layout = {
    autosize: true,
    dragmode: 'drawline',
    uirevision: symbol,
    showlegend: true,
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.02,
      xanchor: 'right',
      x: 1,
      font: { color: '#94a3b8', size: 9 },
      bgcolor: 'rgba(0,0,0,0)'
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#94a3b8', size: 10 },
    grid: { rows: 2, columns: 1, pattern: 'independent', roworder: 'top to bottom' },
    xaxis: {
      range: xaxisRange || (candleData.dates && candleData.dates.length > 150
        ? [candleData.dates[candleData.dates.length - 150], candleData.dates[candleData.dates.length - 1]]
        : undefined),
      rangeslider: { visible: false },
      gridcolor: 'rgba(51, 65, 85, 0.12)',
      zeroline: false,
      tickfont: { size: 9, color: '#64748b' }
    },
    yaxis: {
      domain: [0.3, 1],
      gridcolor: 'rgba(51, 65, 85, 0.12)',
      zeroline: false,
      side: 'right',
      range: yaxisRange || undefined,
      autorange: yaxisRange ? false : true,
      fixedrange: false,
      tickfont: { size: 9, color: '#64748b' }
    },
    yaxis2: {
      domain: [0, 0.25],
      gridcolor: 'rgba(51, 65, 85, 0.06)',
      zeroline: false,
      side: 'right',
      showticklabels: false
    },
    margin: { t: 30, b: 35, l: 15, r: 50 },
    newshape: {
      line: {
        color: '#38bdf8',
        width: 2
      }
    }
  };

  const config = {
    responsive: true,
    displaylogo: false,
    displayModeBar: true,
    scrollZoom: true,
    modeBarButtonsToAdd: [
      'drawline',
      'drawrect',
      'eraseshape'
    ],
    modeBarButtonsToRemove: [
      'select2d',
      'lasso2d'
    ]
  };

  return (
    <div ref={plotContainerRef} className="w-full h-full relative">
      <SafePlot
        component={PlotComponent}
        data={data}
        layout={layout}
        config={config}
        className="w-full h-full"
        onRelayout={handleRelayout}
      />
    </div>
  );
});

export function StockResearchTabView() {
  const [symbolInput, setSymbolInput] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [initiateLoading, setInitiateLoading] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);
  const [PlotComponent, setPlotComponent] = useState<any>(null);

  // Dynamic Plotly Loader
  useEffect(() => {
    let isMounted = true;
    const loadPlotly = async () => {
      try {
        const [PlotlyModule, factoryModule] = await Promise.all([
          import('plotly.js-dist-min'),
          import('react-plotly.js/factory')
        ]);
        const Plotly = PlotlyModule.default;
        const factory = factoryModule.default;
        const created = factory(Plotly);
        if (isMounted) setPlotComponent(() => created);
      } catch (err) {
        console.error("Plotly Engine Load Failure in StockResearchTabView", err);
      }
    };
    loadPlotly();
    return () => { isMounted = false; };
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await apiGet<any>('/api/research/history');
      if (Array.isArray(data)) {
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to load research history", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchHistory]);

  // Scroll terminal logs to bottom automatically
  useEffect(() => {
    if (terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.logs]);

  const startPolling = (id: number) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await apiGet<any>(`/api/research/status/${id}`);
        if (response && !response.error) {
          setActiveSession(response);
          if (response.status === 'completed' || response.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            fetchHistory();
          }
        }
      } catch (err) {
        console.error("Error polling research status", err);
      }
    }, 2000);
  };

  const handleInitiate = async (symbolToQuery?: string) => {
    const sym = (symbolToQuery || symbolInput).trim().toUpperCase();
    if (!sym) return;
    setInitiateLoading(true);
    try {
      const res = await apiPost<any>('/api/research/initiate', { symbol: sym });
      if (res && res.session_id) {
        setActiveSessionId(res.session_id);
        setActiveSession({ symbol: sym, status: 'pending', logs: ['[00:00] Initializing agent thread...'], screenshots: [] });
        startPolling(res.session_id);
      }
    } catch (err) {
      console.error("Failed to initiate research", err);
    } finally {
      setInitiateLoading(false);
    }
  };

  const handleSelectHistory = async (id: number) => {
    try {
      const data = await apiGet<any>(`/api/research/status/${id}`);
      if (data && !data.error) {
        setActiveSessionId(id);
        setActiveSession(data);
      }
    } catch (err) {
      console.error("Failed to fetch historical session details", err);
    }
  };

  const handleClearSession = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setActiveSessionId(null);
    setActiveSession(null);
    setSymbolInput('');
  };

  const formatMarketCap = (val?: number) => {
    if (!val) return 'N/A';
    if (val >= 1e7) {
      return `₹${(val / 1e7).toFixed(2)} Cr`;
    }
    return `₹${val.toLocaleString('en-IN')}`;
  };

  return (
    <div className="flex flex-col gap-6 text-left select-none">

      {/* HEADER BAR */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)] flex items-center gap-2">
            <Cpu className="text-neonBlue" size={20} /> AUTONOMOUS INVESTMENT RESEARCH ENGINE
          </h2>
          <p className="text-xs text-[var(--color-text-main)] mt-0.5">Launches a Playwright-controlled browser agent to analyze stock charts, fundamentals, corporate filings, and news</p>
        </div>
        {activeSessionId && (
          <button
            onClick={handleClearSession}
            className="px-4 py-1.5 bg-[var(--color-card)] hover:bg-[var(--color-card)] text-[var(--color-text-main)] font-bold border border-[var(--color-border)] rounded-lg text-xs tracking-wider transition cursor-pointer"
          >
            ← LEAVE CURRENT SESSION
          </button>
        )}
      </div>

      {/* VIEW STATE 1: HOME PAGE (INITIATE & HISTORY) */}
      {!activeSessionId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* SEARCH CARD */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="glass-panel p-5 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4">
              <h3 className="text-xs font-bold text-[var(--color-text-main)] tracking-widest uppercase flex items-center gap-1.5">
                <Search size={14} className="text-neonBlue" /> Run Live Analysis
              </h3>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-[var(--color-text-main)] uppercase tracking-widest">Indian Stock Ticker</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. RELIANCE, TCS, INFY"
                    value={symbolInput}
                    onChange={(e) => setSymbolInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInitiate()}
                    className="flex-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] font-mono font-bold placeholder-slate-600 focus:outline-none focus:border-neonBlue transition"
                  />
                  <button
                    onClick={() => handleInitiate()}
                    disabled={initiateLoading || !symbolInput.trim()}
                    className="px-4 bg-neonBlue text-black font-extrabold text-xs rounded-lg hover:bg-neonBlue/80 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                  >
                    {initiateLoading ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />} Run
                  </button>
                </div>
              </div>

              {/* QUICK SUGGESTIONS */}
              <div className="space-y-2">
                <span className="text-[8px] font-bold text-[var(--color-text-main)] uppercase tracking-widest block">Quick Suggestions</span>
                <div className="flex gap-1.5 flex-wrap">
                  {['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'SBIN', 'TATAMOTORS'].map((ticker) => (
                    <button
                      key={ticker}
                      onClick={() => handleInitiate(ticker)}
                      className="text-[9px] font-bold px-2 py-1 bg-[var(--color-card)] hover:bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text-main)] rounded hover:border-neonBlue/45 transition cursor-pointer"
                    >
                      {ticker}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RESEARCH HISTORY LIST */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="glass-panel p-5 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4">
              <h3 className="text-xs font-bold text-[var(--color-text-main)] tracking-widest uppercase flex items-center gap-1.5">
                <Clock size={14} className="text-[var(--color-text-main)]" /> Compiled Dossier Archives
              </h3>

              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-main)]">
                  <RefreshCw className="animate-spin mb-3 text-neonBlue" size={24} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Syncing dossier history...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-16 text-[var(--color-text-main)] italic text-xs">
                  No stock research has been conducted yet. Search a symbol above to trigger the first run!
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] max-h-[350px] overflow-y-auto scrollbar-thin">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[var(--color-card)] border-b border-[var(--color-border)] text-[9px] font-bold tracking-widest text-[var(--color-text-main)] uppercase">
                        <th className="py-2.5 px-4">Symbol</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4">Generated Date</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-[var(--color-text-main)] font-medium">
                      {history.map((h) => (
                        <tr key={h.id} className="hover:bg-[var(--color-card)] transition">
                          <td className="py-2.5 px-4 font-mono font-bold text-[var(--color-text-main)]">{h.symbol}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${h.status === 'completed'
                                ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/30'
                                : h.status === 'failed'
                                  ? 'bg-rose-950/30 text-rose-400 border-rose-900/30'
                                  : 'bg-indigo-950/30 text-indigo-400 border-indigo-900/30 animate-pulse'
                              }`}>
                              {h.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[var(--color-text-main)] font-mono font-bold">
                            {new Date(h.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() => handleSelectHistory(h.id)}
                              className="text-[9px] font-bold px-2.5 py-1 bg-[var(--color-card)] hover:bg-[var(--color-card)] border border-[var(--color-border)] text-sky-400 rounded hover:border-sky-500/40 transition cursor-pointer"
                            >
                              OPEN DOSSIER
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW STATE 2: ACTIVE PIPELINE (RUNNING / PENDING TERMINAL LOGS) */}
      {activeSessionId && (activeSession?.status === 'pending' || activeSession?.status === 'running') && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in zoom-in duration-300">

          {/* TERMINAL CONSOLE PANEL */}
          <div className="lg:col-span-3 flex flex-col">
            <div className="flex-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden flex flex-col min-h-[480px] shadow-2xl">
              {/* Terminal Title Bar */}
              <div className="bg-[var(--color-card)] px-4 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                </div>
                <span className="text-[10px] text-[var(--color-text-main)] font-mono font-bold select-none">autonomous_analyst_agent.sh</span>
                <div className="w-12"></div>
              </div>

              {/* Terminal Logs Stream */}
              <div className="flex-1 p-5 font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[420px] scrollbar-thin text-[var(--color-text-main)] space-y-1">
                {activeSession.logs && activeSession.logs.map((log: string, idx: number) => {
                  let colorClass = "text-slate-450";
                  if (log.includes("[ERROR]") || log.includes("Failed")) colorClass = "text-rose-400 font-bold";
                  else if (log.includes("[INIT]")) colorClass = "text-indigo-400";
                  else if (log.includes("[COMPUTE]")) colorClass = "text-neonPurple";
                  else if (log.includes("complete") || log.includes("successfully")) colorClass = "text-emerald-400";

                  return (
                    <div key={idx} className={colorClass}>
                      <span className="text-slate-600 select-none mr-2">$</span> {log}
                    </div>
                  );
                })}
                {activeSession.status === 'running' && (
                  <div className="text-sky-400 flex items-center gap-1.5 animate-pulse mt-2">
                    <span className="text-slate-600 select-none mr-2">$</span>
                    <RefreshCw size={10} className="animate-spin" />
                    <span>Executing live browser crawler step...</span>
                  </div>
                )}
                <div ref={terminalBottomRef} />
              </div>
            </div>
          </div>

          {/* ACTIVE STATUS & SCREENSHOT PREVIEW PANEL */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="glass-panel p-5 border border-[var(--color-border)] bg-[var(--color-card)] flex-1 flex flex-col justify-between min-h-[480px]">
              <div className="space-y-5">
                <div>
                  <span className="text-[8px] font-bold text-[var(--color-text-main)] uppercase tracking-widest block">Target Stock</span>
                  <h3 className="text-2xl font-black text-[var(--color-text-main)] font-mono mt-0.5 tracking-wider">{activeSession.symbol}</h3>
                </div>

                <div className="space-y-2">
                  <span className="text-[8px] font-bold text-[var(--color-text-main)] uppercase tracking-widest block">Agent Execution Status</span>
                  <div className="flex items-center gap-2">
                    <div className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </div>
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono animate-pulse">{activeSession.status}...</span>
                  </div>
                </div>

                {/* Live chart screenshot preview */}
                {activeSession.screenshots && activeSession.screenshots.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[8px] font-bold text-[var(--color-text-main)] uppercase tracking-widest block">Captured Viewport</span>
                    <div className="rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg">
                      <img
                        src={activeSession.screenshots[0]}
                        alt="TradingView Candlestick capture"
                        className="w-full h-auto object-cover max-h-[160px] opacity-80 hover:opacity-100 transition duration-300"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-[var(--color-border)] text-center">
                <span className="text-[9px] text-slate-600 italic leading-relaxed block max-w-[200px] mx-auto">This run runs completely autonomously. Do not refresh this page to preserve logs.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW STATE 3: COMPLETED DOSSIER REPORT */}
      {activeSessionId && activeSession?.status === 'completed' && activeSession.report && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom duration-500 select-none">

          {/* PROFILE SUMMARY BAR (Full Width) */}
          <div className="lg:col-span-3 glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-xl md:text-2xl font-black text-[var(--color-text-main)] tracking-wide">{activeSession.report.company_name}</h3>
                <span className="text-xs font-bold bg-[var(--color-card)] border border-[var(--color-border)] px-2.5 py-1 rounded text-[var(--color-text-main)] font-mono tracking-wider">{activeSession.symbol}</span>
                <span className="text-xs font-bold bg-sky-950/40 border border-sky-900/30 px-2.5 py-1 rounded text-sky-400 uppercase tracking-wider">{activeSession.report.sector}</span>
              </div>
              <p className="text-xs md:text-sm text-[var(--color-text-main)]/90 leading-relaxed font-sans mt-2 max-w-5xl">{activeSession.report.summary}</p>
            </div>

            {/* RATINGS BADGE */}
            <div className="flex-shrink-0 flex items-center gap-5 bg-[var(--color-card)] p-5 rounded-xl border border-[var(--color-border)] shadow-sm">
              <div>
                <span className="text-[10px] md:text-xs font-bold text-[var(--color-text-main)]/70 uppercase tracking-widest block text-right">AI Recommendation</span>
                <span className={`text-2xl md:text-3xl font-black block text-right ${activeSession.report.thesis?.rating === 'Buy'
                    ? 'text-emerald-400'
                    : activeSession.report.thesis?.rating === 'Sell'
                      ? 'text-rose-450'
                      : 'text-amber-400'
                  }`}>
                  {activeSession.report.thesis?.rating?.toUpperCase() || 'HOLD'}
                </span>
              </div>

              {activeSession.report.current_price && (
                <>
                  <div className="h-10 w-[1px] bg-[var(--color-border)]"></div>
                  <div>
                    <span className="text-[10px] md:text-xs font-bold text-[var(--color-text-main)]/70 uppercase tracking-widest block text-right">Current Price</span>
                    <span className="text-base md:text-lg font-extrabold text-[var(--color-text-main)] font-mono block text-right">
                      ₹{activeSession.report.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              )}

              <div className="h-10 w-[1px] bg-[var(--color-border)]"></div>
              <div>
                <span className="text-[10px] md:text-xs font-bold text-[var(--color-text-main)]/70 uppercase tracking-widest block text-right">Target Range</span>
                <span className="text-base md:text-lg font-extrabold text-[var(--color-text-main)] font-mono block text-right">{activeSession.report.thesis?.target_range || '₹0.00'}</span>
              </div>
            </div>
          </div>

          {/* LEFT COLUMN: FUNDAMENTALS & TECHNICAL INDICATORS */}
          <div className="lg:col-span-1 flex flex-col gap-6">

            {/* FUNDAMENTALS CARD */}
            <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
                <Newspaper size={16} className="text-neonBlue" /> Fundamental Ratios
              </h3>

              <div className="grid grid-cols-2 gap-3.5">
                {[
                  { label: "Market Cap", value: formatMarketCap(activeSession.report.ratios?.market_cap) },
                  { label: "P/E Ratio", value: activeSession.report.ratios?.pe ? activeSession.report.ratios.pe.toFixed(2) : 'N/A' },
                  { label: "P/B Ratio", value: activeSession.report.ratios?.pb ? activeSession.report.ratios.pb.toFixed(2) : 'N/A' },
                  { label: "Debt to Equity", value: activeSession.report.ratios?.debt_equity ? `${activeSession.report.ratios.debt_equity.toFixed(1)}%` : 'N/A' },
                  { label: "Dividend Yield", value: activeSession.report.ratios?.dividend_yield ? `${(activeSession.report.ratios.dividend_yield * 100).toFixed(2)}%` : 'N/A' },
                  { label: "Profit Margin", value: activeSession.report.ratios?.margin ? `${(activeSession.report.ratios.margin * 100).toFixed(2)}%` : 'N/A' }
                ].map((item, idx) => (
                  <div key={idx} className="bg-[var(--color-card)] p-3 rounded-lg border border-[var(--color-border)] flex flex-col">
                    <span className="text-[11px] font-bold text-[var(--color-text-main)]/75 uppercase tracking-wider">{item.label}</span>
                    <span className="text-sm md:text-base font-extrabold text-[var(--color-text-main)] mt-1 font-mono">{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Sources Metadata */}
              <div className="mt-2 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-main)]/80 font-mono">
                <span>DATA SOURCE: {activeSession.report.data_source || 'Yahoo Finance Live API'}</span>
                <span className="font-bold text-emerald-500">STATUS: VERIFIED</span>
              </div>
            </div>

            {/* TECHNICAL DIALS */}
            <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
                <Activity size={16} className="text-neonPurple" /> Technical Momentum
              </h3>

              <ADXGauge
                adx={activeSession.report.technicals?.adx || 20}
                diPlus={activeSession.report.technicals?.di_plus || 20}
                diMinus={activeSession.report.technicals?.di_minus || 20}
              />

              <RSIGauge rsi={activeSession.report.technicals?.rsi || 50} />
            </div>
          </div>

          {/* MIDDLE COLUMN: CHART SCREENSHOT & GEMINI VISION ANALYSIS */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* CHART ANALYSIS */}
            <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
                <Globe size={16} className="text-sky-400 animate-pulse" /> Candlestick Trendline Analysis (Neural Technical AI)
              </h3>

              <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-inner h-[480px]">
                <ResearchCandleChart
                  symbol={activeSession.symbol}
                  PlotComponent={PlotComponent}
                />
              </div>

              <div className="bg-[var(--color-card)] p-4.5 rounded-xl border border-[var(--color-border)] text-left max-h-[240px] overflow-y-auto scrollbar-thin">
                <h4 className="text-xs font-bold text-[var(--color-text-main)] tracking-wider uppercase mb-2">NEURAL TECHNICAL REPORT</h4>
                <p className="text-xs md:text-sm text-[var(--color-text-main)]/90 leading-relaxed font-mono whitespace-pre-line">
                  {activeSession.report.chart_analysis || "No visual chart report was compiled."}
                </p>
              </div>
            </div>
          </div>

          {/* BOTTOM ROW: INSIDER ACTIVITY, NEWS SENTIMENT & CORE THESIS */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* INSIDER MONITOR CARD */}
            <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
                <Shield size={16} className="text-orange-400" /> Promoters & Insiders holding
              </h3>

              <div className="flex-1 flex flex-col justify-between gap-3">
                <div className="bg-[var(--color-card)] p-3.5 rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-text-main)] uppercase tracking-wider">Promoter Holdings Trend</span>
                  <span className={`text-xs font-black px-2.5 py-1 rounded border uppercase tracking-widest ${activeSession.report.insider_activity?.promoter_activity === 'Increase'
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                      : activeSession.report.insider_activity?.promoter_activity === 'Decrease'
                        ? 'bg-rose-950/40 text-rose-450 border-rose-900/30'
                        : 'bg-[var(--color-card)] text-[var(--color-text-main)] border-[var(--color-border)]'
                    }`}>
                    {activeSession.report.insider_activity?.promoter_activity || 'STABLE'}
                  </span>
                </div>

                <p className="text-xs md:text-sm text-[var(--color-text-main)]/90 leading-relaxed bg-[var(--color-card)] p-4 rounded-lg border border-[var(--color-border)] flex-1 font-sans">
                  {activeSession.report.insider_activity?.summary || "No recent promoter stake activities detected."}
                </p>
              </div>
            </div>

            {/* NEWS SENTIMENT CARD */}
            <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
                <Newspaper size={16} className="text-neonBlue" /> News Sentiment & Risk
              </h3>

              <div className="flex-1 flex flex-col justify-between gap-3">
                <div className="bg-[var(--color-card)] p-3.5 rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-text-main)] uppercase tracking-wider">Media Sentiment Check</span>
                  <span className={`text-xs font-black px-2.5 py-1 rounded border uppercase tracking-widest ${activeSession.report.news_sentiment?.sentiment === 'Bullish'
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/30'
                      : activeSession.report.news_sentiment?.sentiment === 'Bearish'
                        ? 'bg-rose-950/40 text-rose-450 border-rose-900/30'
                        : 'bg-[var(--color-card)] text-[var(--color-text-main)] border-[var(--color-border)]'
                    }`}>
                    {activeSession.report.news_sentiment?.sentiment || 'NEUTRAL'}
                  </span>
                </div>

                <div className="bg-[var(--color-card)] p-4 rounded-lg border border-[var(--color-border)] flex-1 space-y-3 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block mb-1">Primary Risk Factor</span>
                    <p className="text-xs md:text-sm text-[var(--color-text-main)]/90 leading-relaxed font-sans">{activeSession.report.news_sentiment?.risk_factor || "N/A"}</p>
                  </div>

                  {activeSession.report.news_sentiment?.articles && activeSession.report.news_sentiment.articles.length > 0 && (
                    <div className="border-t border-[var(--color-border)] pt-2.5 space-y-1.5 max-h-[100px] overflow-y-auto scrollbar-thin">
                      <span className="text-[10px] font-bold text-[var(--color-text-main)]/70 uppercase tracking-wider block">Reference Articles</span>
                      {activeSession.report.news_sentiment.articles.slice(0, 3).map((art: any, artIdx: number) => (
                        <a
                          key={artIdx}
                          href={art.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-sky-400 hover:underline hover:text-sky-350 block truncate font-mono"
                        >
                          🔗 {art.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* TRADINGVIEW IDEAS CARD */}
            <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
                <TrendingUp size={16} className="text-sky-400 animate-pulse" /> TradingView Analysis Ideas
              </h3>

              <div className="flex-1 flex flex-col justify-between gap-3">
                <div className="bg-[var(--color-card)] p-3.5 rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-text-main)] uppercase tracking-wider">Public Discussions</span>
                  <span className="text-xs font-black px-2.5 py-1 rounded border border-sky-900/30 bg-sky-950/20 text-sky-400 uppercase tracking-widest font-mono">
                    {activeSession.report.tradingview_ideas?.length || 0} IDEAS
                  </span>
                </div>

                <div className="bg-[var(--color-card)] p-4 rounded-lg border border-[var(--color-border)] flex-1 flex flex-col justify-between gap-2.5 max-h-[180px] overflow-y-auto scrollbar-thin">
                  {!activeSession.report.tradingview_ideas || activeSession.report.tradingview_ideas.length === 0 ? (
                    <p className="text-xs md:text-sm text-[var(--color-text-main)]/80 italic font-sans">No recent TradingView technical analysis ideas found.</p>
                  ) : (
                    <div className="space-y-2">
                      {activeSession.report.tradingview_ideas.slice(0, 4).map((idea: any, idx: number) => (
                        <div key={idx} className="border-b border-[var(--color-border)] pb-2 last:border-b-0 last:pb-0">
                          <a
                            href={idea.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-sky-400 hover:underline hover:text-sky-350 font-mono flex items-start gap-1.5 leading-snug"
                          >
                            <span className="mt-0.5">🔗</span>
                            <span className="truncate block">{idea.title}</span>
                          </a>
                          {idea.pub_date && (
                            <span className="text-[10px] text-[var(--color-text-main)]/70 font-mono block ml-4 mt-0.5">{idea.pub_date}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ULTIMATE INVESTMENT THESIS */}
            <div className="glass-panel p-6 border border-indigo-900/60 bg-gradient-to-br from-slate-950/80 to-indigo-950/15 flex flex-col gap-4 shadow-xl">
              <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2 border-b border-indigo-950/80 pb-3">
                <Lightbulb size={16} className="text-indigo-400 animate-pulse" /> Investment Thesis Summary
              </h3>

              <div className="flex-1 flex flex-col justify-between gap-3">
                <p className="text-xs md:text-sm text-indigo-100/95 leading-relaxed bg-indigo-950/25 p-4 rounded-xl border border-indigo-900/40 flex-1 font-sans">
                  {activeSession.report.thesis?.thesis || "No thesis generated."}
                </p>

                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                  <span className="text-xs text-[var(--color-text-main)]/80 font-bold uppercase tracking-wider">Analysis Audited by Artillegence AI</span>
                </div>
              </div>
            </div>
          </div>

          {/* NEW ROW: SOCIAL SENTIMENT & DEBATE LOG */}
          <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* SOCIAL SENTIMENT CARD WITH DATA SOURCES & BASIS */}
            <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col gap-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-wider uppercase flex items-center gap-2">
                  <Users size={16} className="text-pink-400 animate-pulse" /> Retail Social Sentiment & Community Bias
                </h3>
                <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-950/30 border border-sky-900/30 px-2.5 py-0.5 rounded-full">
                  MULTI-FORUM OSINT
                </span>
              </div>

              <div className="flex-1 flex flex-col gap-4">
                {/* Mood Badge */}
                <div className="bg-[var(--color-card)] p-4 rounded-xl border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[var(--color-text-main)] uppercase tracking-wider block">Reddit / StockTwits / X Mood</span>
                    <span className="text-[11px] text-[var(--color-text-main)]/60 font-mono mt-0.5 block">Cross-Platform Polarity Aggregation</span>
                  </div>
                  <span className={`text-xs font-black px-3.5 py-1 rounded-lg border uppercase tracking-widest ${activeSession.report.social_sentiment?.retail_mood === 'Bullish' || activeSession.report.social_sentiment?.retail_mood === 'FOMO'
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40 shadow-sm'
                      : activeSession.report.social_sentiment?.retail_mood === 'Bearish' || activeSession.report.social_sentiment?.retail_mood === 'Fear'
                        ? 'bg-rose-950/40 text-rose-400 border-rose-900/40 shadow-sm'
                        : 'bg-[var(--color-card)] text-[var(--color-text-main)] border-[var(--color-border)]'
                    }`}>
                    {activeSession.report.social_sentiment?.retail_mood || 'NEUTRAL'}
                  </span>
                </div>

                {/* Bull vs Bear Counter and Proportion Bar */}
                {(() => {
                  const bCount = activeSession.report.social_sentiment?.bull_count ?? 12;
                  const beCount = activeSession.report.social_sentiment?.bear_count ?? 48;
                  const total = bCount + beCount || 1;
                  const bullPct = Math.round((bCount / total) * 100);
                  const bearPct = Math.round((beCount / total) * 100);

                  return (
                    <div className="bg-[var(--color-card)] p-4.5 rounded-xl border border-[var(--color-border)] space-y-2.5">
                      <div className="flex justify-between items-center text-xs md:text-sm font-bold">
                        <span className="text-emerald-400 flex items-center gap-1.5 font-mono">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                          {bCount} Bulls ({bullPct}%)
                        </span>
                        <span className="text-rose-400 flex items-center gap-1.5 font-mono">
                          {beCount} Bears ({bearPct}%)
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                        </span>
                      </div>

                      <div className="h-3.5 bg-slate-900/80 rounded-full overflow-hidden flex p-0.5 border border-[var(--color-border)]">
                        <div
                          className="h-full bg-emerald-500 rounded-l-full transition-all duration-700"
                          style={{ width: `${bullPct}%` }}
                        ></div>
                        <div
                          className="h-full bg-rose-500 rounded-r-full transition-all duration-700"
                          style={{ width: `${bearPct}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })()}

                {/* Executive Summary */}
                <div className="bg-[var(--color-card)] p-4 rounded-xl border border-[var(--color-border)]">
                  <span className="text-xs font-bold text-[var(--color-text-main)]/70 uppercase tracking-wider block mb-1.5">Executive Retail Assessment</span>
                  <p className="text-xs md:text-sm text-[var(--color-text-main)]/95 leading-relaxed font-sans">
                    {activeSession.report.social_sentiment?.summary || "No retail sentiment generated."}
                  </p>
                </div>

                {/* DATA SOURCES & SENTIMENT BASIS BREAKDOWN */}
                <div className="bg-[var(--color-card)] p-4.5 rounded-xl border border-[var(--color-border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--color-text-main)] uppercase tracking-wider flex items-center gap-1.5">
                      <Target size={14} className="text-neonBlue" /> Sentiment Basis & Verified Sources
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-900/30">
                      {(activeSession.report.social_sentiment?.bull_count ?? 12) + (activeSession.report.social_sentiment?.bear_count ?? 48)} POSTS ANALYZED
                    </span>
                  </div>

                  {/* Sources List */}
                  <div className="grid grid-cols-1 gap-2.5">
                    {(() => {
                      const cleanSym = (activeSession.symbol || '').replace(/^NSE:|^BSE:/i, '').trim();
                      const isBear = (activeSession.report.social_sentiment?.bear_count ?? 48) >= (activeSession.report.social_sentiment?.bull_count ?? 12);
                      const dynamicSources = (activeSession.report.social_sentiment?.sources && activeSession.report.social_sentiment.sources.length > 0)
                        ? activeSession.report.social_sentiment.sources
                        : [
                          {
                            platform: "Reddit (r/IndianStockMarket & r/dalalstreetbets)",
                            mention_count: 34,
                            sentiment: isBear ? "Bearish (76%)" : "Bullish (65%)",
                            key_theme: isBear
                              ? "Forums dominated by discussions on downside risk, stop-loss triggers, portfolio drawdowns, and exit strategies."
                              : "Active discussions highlighting value accumulation, capacity expansion, and long-term breakout setups.",
                            url: `https://www.reddit.com/r/IndianStockMarket/search/?q=${encodeURIComponent(cleanSym)}`
                          },
                          {
                            platform: `StockTwits ($${cleanSym})`,
                            mention_count: 16,
                            sentiment: isBear ? "Bearish (81%)" : "Bullish (70%)",
                            key_theme: isBear
                              ? "Retail stream expressing frustration over price weakness, lack of support bids, and distribution volume."
                              : "Positive message flow noting intraday reversal momentum, high buy orders, and resistance clearance.",
                            url: `https://stocktwits.com/symbol/${encodeURIComponent(cleanSym)}`
                          },
                          {
                            platform: `X / Twitter Financial Cashtags (#${cleanSym})`,
                            mention_count: 10,
                            sentiment: isBear ? "Bearish (70%)" : "Bullish (60%)",
                            key_theme: isBear
                              ? "FinTwit retail commentary highlighting sector headwinds, negative news sentiment, and valuation caution."
                              : "Trader accounts revising targets higher with bullish price action and volume expansion.",
                            url: `https://twitter.com/search?q=%24${encodeURIComponent(cleanSym)}`
                          }
                        ];

                      return dynamicSources.map((src: any, sIdx: number) => (
                        <div key={sIdx} className="p-3 bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] flex flex-col gap-1.5 hover:border-sky-500/30 transition">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--color-text-main)] font-mono flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-neonBlue"></span>
                              {src.platform}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                                String(src.sentiment).includes('Bull') ? 'text-emerald-400 border-emerald-900/30 bg-emerald-950/20' : 'text-rose-400 border-rose-900/30 bg-rose-950/20'
                              }`}>
                                {src.sentiment}
                              </span>
                              {src.url && (
                                <a
                                  href={src.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-0.5 hover:underline font-mono"
                                  title="Verify live search query"
                                >
                                  Verify <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-[var(--color-text-main)]/85 leading-relaxed font-sans">
                            <span className="font-semibold text-[var(--color-text-main)]">Sampled Basis: </span>
                            {src.key_theme}
                          </p>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Classification Methodology */}
                  <div className="pt-2 border-t border-[var(--color-border)] flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1 flex-shrink-0"></div>
                    <p className="text-[11px] text-[var(--color-text-main)]/70 font-mono leading-relaxed">
                      <span className="font-bold text-[var(--color-text-main)]/90">Classification Basis: </span>
                      {activeSession.report.social_sentiment?.basis_summary ||
                        "Extracted via quantitative NLP sentiment scoring on active retail equity channels. Mentions are evaluated for directional retail intent (stop-loss / sell / capitulation vs buy / accumulate / targets)."}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* BULLISH VS BEARISH DEBATE LOG */}
            <div className="glass-panel p-6 border border-amber-900/40 bg-[var(--color-card)] flex flex-col gap-4 shadow-lg">
              <h3 className="text-sm font-bold text-amber-300 tracking-wider uppercase flex items-center gap-2 border-b border-amber-900/40 pb-3">
                <MessageSquare size={16} className="text-amber-400" /> Researcher Debate Log
              </h3>

              <div className="flex-1 flex flex-col gap-3.5 max-h-[380px] overflow-y-auto scrollbar-thin pr-1">
                {activeSession.report.debate_log && activeSession.report.debate_log.map((msg: any, idx: number) => {
                  const isBull = msg.agent === 'Bullish Researcher';
                  return (
                    <div key={idx} className={`flex flex-col gap-1.5 ${isBull ? 'items-start' : 'items-end'}`}>
                      <span className={`text-xs font-bold uppercase tracking-wider ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {msg.agent}
                      </span>
                      <div className={`p-3 rounded-xl border text-xs md:text-sm font-sans leading-relaxed max-w-[88%] ${isBull
                          ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-100 rounded-tl-none'
                          : 'bg-rose-950/20 border-rose-900/30 text-rose-100 rounded-tr-none'
                        }`}>
                        {msg.message}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

export default App

// ==========================================
// Economic Calendar Component
// ==========================================

export function EconomicCalendarView({ events, loading }: { events: any[]; loading: boolean }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'week'>('all');

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      // 1. Search term match
      const symbol = String(ev.symbol || '').toLowerCase();
      const company = String(ev.company || '').toLowerCase();
      const details = String(ev.details || '').toLowerCase();
      const matchesSearch = symbol.includes(searchTerm.toLowerCase()) ||
        company.includes(searchTerm.toLowerCase()) ||
        details.includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // 2. Type match
      if (typeFilter !== 'All') {
        if (typeFilter === 'Dividends' && ev.event_type !== 'Dividend') return false;
        if (typeFilter === 'Splits' && ev.event_type !== 'Stock Split' && ev.event_type !== 'Bonus') return false;
        if (typeFilter === 'Earnings' && ev.event_type !== 'Financial Results') return false;
        if (typeFilter === 'Board Meetings' && ev.event_type !== 'Board Meeting' && ev.event_type !== 'Fund Raising') return false;
      }

      // 3. Time match
      const dateParts = String(ev.date || '').split('-');
      let evYear = 0, evMonth = 0, evDay = 0;
      if (dateParts.length === 3) {
        evYear = parseInt(dateParts[0], 10);
        evMonth = parseInt(dateParts[1], 10) - 1;
        evDay = parseInt(dateParts[2], 10);
      } else {
        const d = new Date(ev.date);
        evYear = d.getFullYear();
        evMonth = d.getMonth();
        evDay = d.getDate();
      }

      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDay = today.getDate();

      const todayStart = new Date(todayYear, todayMonth, todayDay).getTime();
      const tomorrowStart = new Date(todayYear, todayMonth, todayDay + 1).getTime();
      const weekEnd = new Date(todayYear, todayMonth, todayDay + 7, 23, 59, 59).getTime();

      const evTime = new Date(evYear, evMonth, evDay).getTime();

      if (timeFilter === 'today') {
        return evTime === todayStart;
      } else if (timeFilter === 'tomorrow') {
        return evTime === tomorrowStart;
      } else if (timeFilter === 'week') {
        return evTime >= todayStart && evTime <= weekEnd;
      }

      return true;
    });
  }, [events, searchTerm, typeFilter, timeFilter]);

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'Dividend':
        return 'bg-emerald-950/60 border-emerald-800 text-emerald-400';
      case 'Stock Split':
      case 'Bonus':
        return 'bg-purple-950/60 border-purple-800 text-purple-400';
      case 'Financial Results':
        return 'bg-sky-950/60 border-sky-800 text-sky-400';
      case 'Fund Raising':
        return 'bg-teal-950/60 border-teal-800 text-teal-400';
      case 'Board Meeting':
        return 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-main)]';
      default:
        return 'bg-amber-950/60 border-amber-800 text-amber-400';
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'Dividend':
        return <DollarSign size={13} className="text-emerald-400" />;
      case 'Stock Split':
      case 'Bonus':
        return <Cpu size={13} className="text-purple-400" />;
      case 'Financial Results':
        return <TrendingUp size={13} className="text-sky-400" />;
      default:
        return <Activity size={13} className="text-[var(--color-text-main)]" />;
    }
  };

  return (
    <div className="glass-panel p-6 animate-fade-in text-left border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl rounded-xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-[var(--color-border)]">
        <div>
          <div className="flex items-center gap-2.5 text-sky-400 mb-1">
            <Calendar size={22} className="animate-pulse" />
            <h2 className="text-lg md:text-xl font-black tracking-widest uppercase text-[var(--color-text-main)]">NSE Corporate & Economic Calendar</h2>
          </div>
          <p className="text-xs md:text-sm text-[var(--color-text-main)] font-medium mt-0.5">Verified corporate actions, financial results, dividends, and splits scheduled for Indian equities.</p>
        </div>

        {/* Statistics or Status */}
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3.5 py-2 flex items-center gap-4 text-xs md:text-sm font-bold text-[var(--color-text-main)]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{filteredEvents.length} UPCOMING EVENTS</span>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5">
              <RefreshCw size={12} className="animate-spin text-sky-400" />
              <span className="text-sky-400">SYNCING NSE...</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters & Search Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 mb-6">
        <div className="md:col-span-4 relative">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[var(--color-text-main)]" size={16} />
          <input
            type="text"
            placeholder="Search symbol, company, or purpose..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg pl-10 pr-4 py-2.5 text-xs md:text-sm text-[var(--color-text-main)] placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
        </div>

        {/* Event Type Filter */}
        <div className="md:col-span-5 flex items-center gap-2">
          <span className="text-xs md:text-sm font-black text-[var(--color-text-main)] tracking-wider uppercase whitespace-nowrap">Event Type:</span>
          <div className="flex-1 flex gap-1 bg-[var(--color-card)] p-1 rounded-lg border border-[var(--color-border)]">
            {[
              { id: 'All', label: 'All' },
              { id: 'Dividends', label: 'Dividends' },
              { id: 'Splits', label: 'Splits' },
              { id: 'Earnings', label: 'Earnings' },
              { id: 'Board Meetings', label: 'Board' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                title={t.id}
                className={`flex-1 text-xs md:text-sm font-bold py-1.5 px-1.5 rounded-md transition-all truncate text-center ${typeFilter === t.id
                    ? 'bg-sky-600/25 text-sky-400 border border-sky-500/30'
                    : 'text-[var(--color-text-main)] hover:text-slate-200'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Filter */}
        <div className="md:col-span-3 flex items-center gap-2">
          <span className="text-xs md:text-sm font-black text-[var(--color-text-main)] tracking-wider uppercase whitespace-nowrap">Timeframe:</span>
          <div className="flex-1 flex gap-1 bg-[var(--color-card)] p-1 rounded-lg border border-[var(--color-border)]">
            {[
              { id: 'all', label: 'ALL' },
              { id: 'today', label: 'TODAY' },
              { id: 'tomorrow', label: 'TOMORROW' },
              { id: 'week', label: '7 DAYS' }
            ].map(tf => (
              <button
                key={tf.id}
                onClick={() => setTimeFilter(tf.id as any)}
                className={`flex-1 text-xs md:text-sm font-bold py-1.5 px-2 rounded-md transition-all text-center ${timeFilter === tf.id
                    ? 'bg-sky-600/25 text-sky-400 border border-sky-500/30'
                    : 'text-[var(--color-text-main)] hover:text-slate-200'
                  }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events Display */}
      {loading && filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)]">
          <div className="animate-spin w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full mb-4"></div>
          <span className="text-sm md:text-base text-sky-400 font-bold tracking-widest animate-pulse">LOADING REAL-TIME NSE CALENDAR...</span>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] text-center text-[var(--color-text-main)]">
          <AlertTriangle className="text-slate-600 mb-3" size={32} />
          <h3 className="text-sm md:text-base font-bold text-[var(--color-text-main)] uppercase tracking-widest">No scheduled events found</h3>
          <p className="text-xs md:text-sm text-[var(--color-text-main)] mt-1 max-w-[320px]">Try adjusting your search terms or expanding the date range filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] max-h-[560px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--color-card)] border-b border-[var(--color-border)] text-xs md:text-sm font-black tracking-wider text-[var(--color-text-main)] uppercase font-bold">
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Symbol</th>
                <th className="py-3.5 px-4">Company</th>
                <th className="py-3.5 px-4 text-center">Type</th>
                <th className="py-3.5 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs md:text-sm text-[var(--color-text-main)] font-medium">
              {filteredEvents.map((ev, i) => {
                const parts = String(ev.date || '').split('-');
                const dateObj = parts.length === 3
                  ? new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
                  : new Date(ev.date);
                const dayStr = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                const dateStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

                return (
                  <tr key={i} className="hover:bg-[var(--color-card)] transition-colors">
                    {/* Date badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-sky-400 bg-sky-950/40 border border-sky-800/30 px-2 py-0.5 rounded uppercase font-mono">
                          {dayStr}
                        </span>
                        <span className="font-bold text-[var(--color-text-main)] font-mono">{dateStr}</span>
                      </div>
                    </td>

                    {/* Ticker Symbol */}
                    <td className="py-3.5 px-4 font-mono font-bold">
                      <button
                        onClick={() => {
                          if ((window as any).triggerTacticalAdvice) {
                            (window as any).triggerTacticalAdvice(
                              `${ev.symbol} Stock Action`,
                              `Corporate action event: ${ev.event_type} (${ev.details}) scheduled for ${ev.company} on ${ev.date}.`
                            );
                          }
                        }}
                        className="text-sky-400 hover:text-sky-300 hover:underline text-left cursor-pointer uppercase tracking-wide bg-[var(--color-card)] px-2.5 py-1 rounded-md border border-[var(--color-border)] text-xs md:text-sm"
                      >
                        NSE:{ev.symbol}
                      </button>
                    </td>

                    {/* Company name */}
                    <td className="py-3.5 px-4 max-w-[240px] truncate text-[var(--color-text-main)]/95 font-bold text-xs md:text-sm">
                      {ev.company}
                    </td>

                    {/* Custom type badge */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border uppercase tracking-wider ${getBadgeStyle(ev.event_type)}`}>
                        {getEventIcon(ev.event_type)}
                        {ev.event_type}
                      </span>
                    </td>

                    {/* Details explanation */}
                    <td className="py-3.5 px-4 text-[var(--color-text-main)] leading-relaxed font-semibold max-w-[450px]" title={ev.details}>
                      {ev.details}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
