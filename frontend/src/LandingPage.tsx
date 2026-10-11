import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  ChevronRight, Activity, Cpu, Github, 
  Twitter, MessageSquare, Database, Sparkles, Eye, Layers, 
  TrendingUp, CheckCircle2, Terminal, ChevronDown, ChevronUp, ArrowUpRight,
  Calendar
} from 'lucide-react';
import ParticleGlobe from './ParticleGlobe';
import NetworkAbstract from './NetworkAbstract';

export default function LandingPage() {
  const [theme, setTheme] = useState<'broken-glass' | 'neon-black'>(() => {
    const saved = localStorage.getItem('app_theme');
    return saved === 'neon-black' ? 'neon-black' : 'broken-glass';
  });

  const [activePreviewTab, setActivePreviewTab] = useState<'telegram' | 'nse' | 'opportunities'>('telegram');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isHeroVisible, setIsHeroVisible] = useState(true);
  const heroRef = useRef<HTMLElement>(null);

  const [previewData, setPreviewData] = useState<{
    telegram?: Array<{ source: string; headline: string; snippet: string; sentiment: string; badge: string; timestamp: string }>;
    nse?: Array<{ symbol: string; company: string; event_type: string; date: string; details?: string }>;
    opportunities?: Array<{ symbol: string; name: string; action: string; horizon: string; risk: string; thesis: string; gain: string }>;
  } | null>(null);

  useEffect(() => {
    if (!heroRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeroVisible(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch('/api/public/preview-feed')
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'success') {
          setPreviewData(data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const faqs = [
    {
      q: "Which financial markets and asset classes does Artillegence monitor?",
      a: "Artillegence is specifically architected for Indian equities (NSE/BSE) alongside key global macroeconomic drivers (US Fed, crude benchmarks, geopolitical supply chains). It continuously tracks 500+ Indian tickers, corporate filings, and global news feeds."
    },
    {
      q: "How does the Telegram & OSINT agent filter noise and fake rumors?",
      a: "Our background Python scrapers ingest live raw posts and pass them through high-speed LLM verification pipelines. The system scores channel source credibility, checks for promotional pump-and-dump signatures, and correlates claims against NSE regulatory filings before surfacing alerts."
    },
    {
      q: "What powers the autonomous market opportunity & alpha engine?",
      a: "We utilize high-throughput neural LLMs and quantitative pattern classifiers to continuously evaluate multi-source macro signals, corporate earnings momentum, price trends, and order flow sentiment across 500+ Indian tickers without manual intervention."
    },
    {
      q: "How fresh is the Corporate Actions and Economic Calendar data?",
      a: "The Economic Calendar agent executes an autonomous polling cycle directly against official NSE regulatory feeds every 120 minutes, tracking upcoming quarterly financial results, dividend record dates, stock splits, and board resolutions across the next 30 days."
    },
    {
      q: "Is an institutional API key or custom deployment available?",
      a: "Yes. Artillegence provides a secure REST API backed by JWT authentication, allowing seamless integration with institutional algorithmic trading desks, proprietary Discord/Telegram alert bots, and customized portfolio webhooks."
    }
  ];

  return (
    <div className={`min-h-screen ${theme === 'broken-glass' ? 'bg-gradient-to-br from-[#dce6f2] via-[#d2def0] to-[#c2d2e7]' : 'bg-[var(--color-background)]'} text-[var(--color-text-main)] relative font-sans scroll-smooth`}>

      {/* Background Globe/Orb Area - unmounted when scrolled past hero for 100% lag-free scrolling */}
      {isHeroVisible && (
        <div className="fixed inset-0 z-0 pointer-events-none flex items-center justify-center lg:justify-end lg:pr-[15%]">
          <div className="relative w-[400px] h-[400px] lg:w-[600px] lg:h-[600px] xl:w-[700px] xl:h-[700px]">
            {theme === 'broken-glass' && (
              <div
                className="absolute inset-0 w-full h-full rounded-full border-[1.5px] border-white shadow-[0_0_40px_rgba(255,255,255,0.8)]"
                style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.85), rgba(0, 82, 204, 0.05))', boxShadow: '0 0 50px rgba(255,255,255,0.8), inset 0 0 50px rgba(255,255,255,0.9)', animation: 'float 6s ease-in-out infinite' }}
              ></div>
            )}
            <div className={`absolute inset-0 ${theme === 'broken-glass' ? 'mix-blend-normal' : 'mix-blend-screen'}`} style={{ transform: 'scale(1.2)' }}>
              <ParticleGlobe theme={theme} />
            </div>
          </div>
        </div>
      )}

      {/* Abstract Network Left Side */}
      {theme === 'broken-glass' && isHeroVisible && (
        <div className="fixed inset-0 z-0 pointer-events-none lg:-translate-x-[30%]">
          <NetworkAbstract />
        </div>
      )}

      {/* Grid overlay */}
      <div className="fixed inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.02] pointer-events-none z-0"></div>

      {/* Header */}
      <header className="relative z-50 w-full px-6 py-4 md:px-12 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] backdrop-blur-md sticky top-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden flex-shrink-0 flex items-center justify-center w-10 h-10">
            <span className="text-neonBlue font-black text-xl">$</span>
          </div>
          <div>
            <h1 className="text-xl font-orbitron font-black tracking-widest text-[var(--color-text-main)] flex items-center gap-1.5">
              Artillegence<span className="font-light text-neonBlue">AI</span>
              <span className="text-[9px] uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono font-bold tracking-widest hidden sm:inline-block">LIVE V3.8</span>
            </h1>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-8 text-xs font-bold tracking-widest text-[var(--color-text-main)] uppercase opacity-80">
          <a href="#features" className="hover:text-neonBlue hover:opacity-100 transition-all">Features</a>
          <a href="#showcase" className="hover:text-neonBlue hover:opacity-100 transition-all">Live Intel</a>
          <a href="#pipeline" className="hover:text-neonBlue hover:opacity-100 transition-all">Architecture</a>
          <a href="#faq" className="hover:text-neonBlue hover:opacity-100 transition-all">FAQ</a>
          <a href="#connect" className="hover:text-neonBlue hover:opacity-100 transition-all">Contact</a>
        </nav>

        <div className="flex items-center gap-3">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text-main)] text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-neonBlue cursor-pointer font-medium"
          >
            <option value="broken-glass">Broken Glass (White)</option>
            <option value="neon-black">Neon Black</option>
          </select>

          <Link
            to="/login"
            className="px-5 py-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-full text-xs font-bold tracking-wider hover:opacity-95 shadow-md hover:shadow-sky-500/25 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 font-orbitron"
          >
            <Terminal size={13} />
            <span>AGENT LOGIN</span>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main ref={heroRef} className="relative z-10 container mx-auto px-6 pt-20 pb-28 lg:pt-28 lg:pb-36 flex flex-col items-center lg:items-start text-center lg:text-left min-h-[85vh]">
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[var(--color-card)] border border-[var(--color-border)] text-neonBlue text-xs font-orbitron font-bold tracking-widest mb-8 shadow-sm">
          <Activity size={14} className="text-emerald-500 animate-pulse" /> 
          <span>SYSTEM ONLINE: 12 MULTI-AGENT ENSEMBLE</span>
        </div>

        <h2
          className="text-4xl md:text-6xl lg:text-7xl font-orbitron font-black tracking-tight mb-6 leading-tight max-w-3xl drop-shadow-sm"
          style={{ background: 'linear-gradient(45deg, var(--color-text-main), var(--color-neon-blue))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          Supercharge Your <br/>
          Market Intelligence
        </h2>

        <p className="max-w-xl text-[var(--color-text-main)] opacity-75 text-base md:text-lg font-medium mb-10 leading-relaxed">
          The ultimate autonomous multi-agent intelligence operating system. Harness live Telegram OSINT scraping, real-time opportunity discovery, NSE corporate actions, and macro thematic modeling inside one unified master terminal.
        </p>

        {/* Action CTAs */}
        <div className="flex gap-4 flex-col sm:flex-row items-center mb-16">
          <Link
            to="/login"
            className="group relative inline-flex flex-col flex-shrink-0 items-center justify-center w-full sm:w-auto"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-neonBlue to-sky-400 rounded-full blur opacity-40 group-hover:opacity-75 transition duration-500"></div>
            <button
              className="glass-panel relative px-8 py-4 flex items-center justify-center gap-3 text-base md:text-lg font-orbitron font-bold tracking-wider hover:bg-[var(--color-card)] hover:shadow-xl transition-all w-full sm:w-auto border border-[var(--color-border)]"
            >
              <Cpu size={20} className="text-neonBlue" />
              <span>OPEN TERMINAL</span>
              <ChevronRight size={18} className="group-hover:translate-x-1 duration-300 text-neonBlue" />
            </button>
          </Link>

          <a
            href="#showcase"
            className="px-6 py-4 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-background)] text-xs md:text-sm font-bold tracking-wider text-[var(--color-text-main)] transition-all flex items-center gap-2"
          >
            <Eye size={16} className="text-neonBlue" />
            <span>EXPLORE LIVE FEEDS</span>
          </a>
        </div>

        {/* Live Metrics Ticker Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-3xl pt-6 border-t border-[var(--color-border)]/60">
          <div className="flex flex-col items-center lg:items-start p-3 rounded-xl bg-[var(--color-card)]/50 border border-[var(--color-border)]/50 backdrop-blur-sm">
            <span className="text-2xl font-black font-orbitron text-neonBlue">12</span>
            <span className="text-[11px] font-bold tracking-wider text-[var(--color-text-main)] opacity-70 uppercase mt-0.5">Autonomous Agents</span>
          </div>
          <div className="flex flex-col items-center lg:items-start p-3 rounded-xl bg-[var(--color-card)]/50 border border-[var(--color-border)]/50 backdrop-blur-sm">
            <span className="text-2xl font-black font-orbitron text-emerald-500">293+</span>
            <span className="text-[11px] font-bold tracking-wider text-[var(--color-text-main)] opacity-70 uppercase mt-0.5">NSE Filings Cached</span>
          </div>
          <div className="flex flex-col items-center lg:items-start p-3 rounded-xl bg-[var(--color-card)]/50 border border-[var(--color-border)]/50 backdrop-blur-sm">
            <span className="text-2xl font-black font-orbitron text-sky-500">&lt;1.2s</span>
            <span className="text-[11px] font-bold tracking-wider text-[var(--color-text-main)] opacity-70 uppercase mt-0.5">Ingestion Latency</span>
          </div>
          <div className="flex flex-col items-center lg:items-start p-3 rounded-xl bg-[var(--color-card)]/50 border border-[var(--color-border)]/50 backdrop-blur-sm">
            <span className="text-2xl font-black font-orbitron text-purple-500">99.9%</span>
            <span className="text-[11px] font-bold tracking-wider text-[var(--color-text-main)] opacity-70 uppercase mt-0.5">Engine Uptime</span>
          </div>
        </div>
      </main>

      {/* Interactive Intelligence Showcase / Terminal Preview */}
      <section id="showcase" className="relative z-10 py-24 border-t border-[var(--color-border)] bg-[var(--color-card)]/40 backdrop-blur-md">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neonBlue/10 border border-neonBlue/20 text-neonBlue text-[11px] font-bold tracking-widest uppercase mb-3">
              <Sparkles size={12} /> Live Multi-Source Feed
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Real-Time Autonomous Feed In Action</h2>
            <p className="text-[var(--color-text-main)] opacity-70 text-sm md:text-base leading-relaxed">
              Experience the stream of verified market intel flowing through Artillegence before accessing the live terminal.
            </p>
          </div>

          {/* Interactive Preview Card Container */}
          <div className="max-w-4xl mx-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl overflow-hidden">
            {/* Terminal Window Header Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b border-[var(--color-border)] bg-[var(--color-card)] gap-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
                <span className="text-xs font-mono font-bold text-[var(--color-text-main)] opacity-60 ml-2">artillegence_terminal_preview.sh</span>
              </div>

              {/* Feed Switcher Buttons */}
              <div className="flex gap-1 bg-[var(--color-background)] p-1 rounded-lg border border-[var(--color-border)]">
                <button
                  onClick={() => setActivePreviewTab('telegram')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold tracking-wider transition-all flex items-center gap-1.5 ${activePreviewTab === 'telegram' ? 'bg-sky-500 text-white shadow-sm' : 'text-[var(--color-text-main)] opacity-70 hover:opacity-100'}`}
                >
                  <MessageSquare size={13} /> Telegram OSINT
                </button>
                <button
                  onClick={() => setActivePreviewTab('nse')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold tracking-wider transition-all flex items-center gap-1.5 ${activePreviewTab === 'nse' ? 'bg-sky-500 text-white shadow-sm' : 'text-[var(--color-text-main)] opacity-70 hover:opacity-100'}`}
                >
                  <Calendar size={13} /> NSE Actions (293)
                </button>
                <button
                  onClick={() => setActivePreviewTab('opportunities')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold tracking-wider transition-all flex items-center gap-1.5 ${activePreviewTab === 'opportunities' ? 'bg-sky-500 text-white shadow-sm' : 'text-[var(--color-text-main)] opacity-70 hover:opacity-100'}`}
                >
                  <TrendingUp size={13} /> Alpha Signals
                </button>
              </div>
            </div>

            {/* Tab Preview Content */}
            <div className="p-6 md:p-8 min-h-[360px] flex flex-col justify-center">
              {activePreviewTab === 'telegram' && (
                <div className="space-y-3.5 animate-fade-in">
                  {(previewData?.telegram && previewData.telegram.length > 0
                    ? previewData.telegram.slice(0, 3)
                    : [
                        {
                          source: 'WFWITNESS',
                          badge: 'CONFIDENCE: 94%',
                          timestamp: '12m ago',
                          headline: 'Council for a Secure America report details emerging diplomatic and trade alignment shifts across Middle East corridors.',
                          sentiment: 'STRATEGIC ALLIANCE'
                        },
                        {
                          source: 'WFWITNESS',
                          badge: 'SEV: HIGH',
                          timestamp: '18m ago',
                          headline: 'Kremlin and European diplomatic statements signal heightened scrutiny on strategic infrastructure corridors and commodities.',
                          sentiment: 'GEOPOLITICAL ALERT'
                        },
                        {
                          source: 'QUDSNEN',
                          badge: 'VERIFIED OSINT',
                          timestamp: '24m ago',
                          headline: 'Regional maritime and airspace security advisories updated along vital international shipping routes.',
                          sentiment: 'VOLATILITY ALERT'
                        }
                      ]
                  ).map((item, i) => (
                    <div key={i} className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${i === 0 ? 'bg-emerald-500 animate-ping' : i === 1 ? 'bg-amber-500' : 'bg-sky-500'}`}></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase text-neonBlue">{item.source || 'OSINT_FEED'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-bold font-mono">{item.badge}</span>
                            <span className="text-[10px] text-[var(--color-text-main)] opacity-50 font-mono">{item.timestamp || 'Just now'}</span>
                          </div>
                          <p className="text-sm font-semibold text-[var(--color-text-main)] mt-1">{item.headline}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded bg-[var(--color-card)] border border-[var(--color-border)] whitespace-nowrap ${
                        item.sentiment.includes('BULLISH') || item.sentiment.includes('ALLIANCE') ? 'text-sky-600 dark:text-sky-400' :
                        item.sentiment.includes('ALERT') ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'
                      }`}>
                        {item.sentiment}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {activePreviewTab === 'nse' && (
                <div className="space-y-3 animate-fade-in">
                  {(previewData?.nse && previewData.nse.length > 0
                    ? previewData.nse.slice(0, 4)
                    : [
                        { symbol: 'HCLTECH', company: 'HCL Technologies Limited', event_type: 'FINANCIAL RESULTS', date: '12-Oct-2026' },
                        { symbol: 'ADROITIND', company: 'Adroit Industries (India) Limited', event_type: 'FINANCIAL RESULTS', date: '12-Oct-2026' },
                        { symbol: 'OLAELEC', company: 'Ola Electric Mobility Limited', event_type: 'RIGHTS ISSUE (2:25)', date: '13-Oct-2026' },
                        { symbol: 'TCS', company: 'Tata Consultancy Services Ltd', event_type: 'DIVIDEND (₹12.00)', date: '14-Oct-2026' }
                      ]
                  ).map((ev, i) => (
                    <div key={i} className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">NSE:{ev.symbol}</span>
                        <span className="font-bold text-[var(--color-text-main)]">{ev.company}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono">
                        <span className={`px-2 py-0.5 rounded font-bold border ${
                          ev.event_type.includes('DIVIDEND') ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                          ev.event_type.includes('RIGHTS') ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                          'bg-sky-500/10 text-sky-600 border-sky-500/20'
                        }`}>
                          {ev.event_type}
                        </span>
                        <span className="text-[var(--color-text-main)] opacity-60">{ev.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activePreviewTab === 'opportunities' && (
                <div className="space-y-3 animate-fade-in">
                  {(previewData?.opportunities && previewData.opportunities.length > 0
                    ? previewData.opportunities.slice(0, 3)
                    : [
                        {
                          symbol: 'NSE:IDEA',
                          name: 'Vodafone Idea (Vi)',
                          action: 'ACCUMULATE',
                          gain: '+4.1%',
                          horizon: 'Short Term',
                          thesis: 'Relative strength leader gaining +4% in flat market structure; telecom sector momentum accelerating.'
                        },
                        {
                          symbol: 'NSE:BHARTIARTL',
                          name: 'Bharti Airtel',
                          action: 'ACCUMULATE',
                          gain: '+1.8%',
                          horizon: 'Medium Term',
                          thesis: 'Consistent institutional accumulation and sustained outperformance in large-cap telecom space.'
                        },
                        {
                          symbol: 'NSE:INDIGO',
                          name: 'InterGlobe Aviation (IndiGo)',
                          action: 'BUY',
                          gain: '+2.2%',
                          horizon: 'Short/Medium',
                          thesis: 'Tops 23,100 Nifty resistance breach; exhibiting +2% relative strength expansion on institutional volume.'
                        }
                      ]
                  ).map((opp, i) => (
                    <div key={i} className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0 animate-pulse"></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-xs">{opp.symbol}</span>
                            <span className="text-xs font-bold text-[var(--color-text-main)]">{opp.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-bold font-mono">{opp.gain}</span>
                            <span className="text-[10px] text-[var(--color-text-main)] opacity-50 font-mono">{opp.horizon}</span>
                          </div>
                          <p className="text-xs font-medium text-[var(--color-text-main)] opacity-80 mt-1">{opp.thesis}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold px-3 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {opp.action}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Core Architecture / 6 Features Grid */}
      <section id="features" className="relative z-10 py-32 border-t border-[var(--color-border)]">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-xs font-bold text-neonBlue tracking-[0.3em] uppercase mb-4">Core Multi-Agent Architecture</h2>
            <h3 className="text-4xl md:text-5xl font-black mb-6">Built For Asymmetric Market Edge</h3>
            <p className="text-[var(--color-text-main)] opacity-70 text-base md:text-lg leading-relaxed">
              We leverage an ensemble of high-speed neural LLMs, deep OSINT crawlers, and regulatory scrapers to turn market noise into high-probability execution intelligence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
            <FeatureCard
              icon={<MessageSquare size={26} className="text-sky-500" />}
              title="Telegram & Dark OSINT"
              desc="Constantly scans 40+ private financial channels and deep OSINT sources, extracting early whispers and sentiment shifts before retail awareness."
              color="border-sky-500/30 hover:border-sky-500/60 shadow-[0_4px_20px_rgba(14,165,233,0.08)]"
              bgGlow="bg-sky-500/10"
              tag="AGENT 01"
            />

            <FeatureCard
              icon={<TrendingUp size={26} className="text-violet-500" />}
              title="Opportunity & Alpha Radar"
              desc="Autonomous opportunity engine identifies asymmetric risk/reward setups, relative strength leaders, and breakout catalysts across NSE equities in real-time."
              color="border-violet-500/30 hover:border-violet-500/60 shadow-[0_4px_20px_rgba(139,92,246,0.08)]"
              bgGlow="bg-violet-500/10"
              tag="AGENT 02"
            />

            <FeatureCard
              icon={<Calendar size={26} className="text-emerald-500" />}
              title="NSE Corporate Calendar"
              desc="Direct official NSE scraper monitors 290+ upcoming earnings declarations, dividend record dates, stock splits, and board resolutions across 30 days."
              color="border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_4px_20px_rgba(16,185,129,0.08)]"
              bgGlow="bg-emerald-500/10"
              tag="AGENT 03"
            />

            <FeatureCard
              icon={<Layers size={26} className="text-amber-500" />}
              title="Macro Scenario Intelligence"
              desc="Autonomously simulates global supply shock scenarios (Fed rate pauses, Gulf shipping bottlenecks, crude swings) and outputs Bull/Bear equity playbooks."
              color="border-amber-500/30 hover:border-amber-500/60 shadow-[0_4px_20px_rgba(245,158,11,0.08)]"
              bgGlow="bg-amber-500/10"
              tag="AGENT 04"
            />

            <FeatureCard
              icon={<TrendingUp size={26} className="text-rose-500" />}
              title="Google Trends Early Radar"
              desc="Tracks surging retail and institutional search queries in India and globally, identifying viral ticker momentum cycles in real-time."
              color="border-rose-500/30 hover:border-rose-500/60 shadow-[0_4px_20px_rgba(244,63,94,0.08)]"
              bgGlow="bg-rose-500/10"
              tag="AGENT 05"
            />

            <FeatureCard
              icon={<Database size={26} className="text-blue-500" />}
              title="Thematic 6-Month Radar"
              desc="Autonomous sector engine analyzes structural catalysts over 6-month horizons, ranking defensive and momentum sectors with timeline triggers."
              color="border-blue-500/30 hover:border-blue-500/60 shadow-[0_4px_20px_rgba(59,130,246,0.08)]"
              bgGlow="bg-blue-500/10"
              tag="AGENT 06"
            />
          </div>
        </div>
      </section>

      {/* How It Works / 3-Stage Pipeline */}
      <section id="pipeline" className="relative z-10 py-28 border-t border-[var(--color-border)] bg-[var(--color-card)]/30 backdrop-blur-md">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold text-neonBlue tracking-[0.3em] uppercase mb-3">Processing Pipeline</h2>
            <h3 className="text-3xl md:text-4xl font-black mb-4">From Raw Chaos to Tactical Execution</h3>
            <p className="text-[var(--color-text-main)] opacity-70 text-sm md:text-base">Three autonomous stages convert unstructured noise into definitive trade signals in under 1.2 seconds.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative max-w-5xl mx-auto">
            <div className="p-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col justify-between shadow-lg relative group hover:-translate-y-1 transition-all">
              <div>
                <span className="text-3xl font-black font-orbitron text-sky-500 mb-4 block">01</span>
                <h4 className="text-xl font-bold mb-3 text-[var(--color-text-main)]">Distributed Ingestion</h4>
                <p className="text-sm text-[var(--color-text-main)] opacity-70 leading-relaxed">
                  Scrapers listen continuously across Telegram channels, official NSE filing APIs, RSS global feeds, and Google Trends without human supervision.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[var(--color-border)] flex items-center gap-2 text-xs font-bold text-sky-500">
                <CheckCircle2 size={14} /> Low-Latency Async Streams
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col justify-between shadow-lg relative group hover:-translate-y-1 transition-all">
              <div>
                <span className="text-3xl font-black font-orbitron text-purple-500 mb-4 block">02</span>
                <h4 className="text-xl font-bold mb-3 text-[var(--color-text-main)]">Neural Synthesis</h4>
                <p className="text-sm text-[var(--color-text-main)] opacity-70 leading-relaxed">
                  Multi-agent neural LLMs cross-correlate news against price action, score source reliability, and detect institutional flow anomalies.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[var(--color-border)] flex items-center gap-2 text-xs font-bold text-purple-500">
                <CheckCircle2 size={14} /> High-Speed Neural Reasoners
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col justify-between shadow-lg relative group hover:-translate-y-1 transition-all">
              <div>
                <span className="text-3xl font-black font-orbitron text-emerald-500 mb-4 block">03</span>
                <h4 className="text-xl font-bold mb-3 text-[var(--color-text-main)]">Tactical Playbooks</h4>
                <p className="text-sm text-[var(--color-text-main)] opacity-70 leading-relaxed">
                  Signals are synthesized into actionable tactical trade plans with entry points, stop-losses, and verified corporate action timelines.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[var(--color-border)] flex items-center gap-2 text-xs font-bold text-emerald-500">
                <CheckCircle2 size={14} /> Ready For Immediate Execution
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive FAQ Section */}
      <section id="faq" className="relative z-10 py-32 border-t border-[var(--color-border)]">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-xs font-bold text-neonBlue tracking-[0.3em] uppercase mb-3">Frequently Asked Questions</h2>
            <h3 className="text-3xl md:text-4xl font-black">Everything You Need To Know</h3>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div 
                key={idx}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm overflow-hidden transition-all"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-5 text-left flex justify-between items-center gap-4 hover:bg-[var(--color-background)] transition-colors"
                >
                  <span className="text-base font-bold text-[var(--color-text-main)]">{faq.q}</span>
                  {openFaq === idx ? (
                    <ChevronUp size={18} className="text-neonBlue flex-shrink-0" />
                  ) : (
                    <ChevronDown size={18} className="text-[var(--color-text-main)] opacity-60 flex-shrink-0" />
                  )}
                </button>
                {openFaq === idx && (
                  <div className="p-5 pt-0 text-sm leading-relaxed text-[var(--color-text-main)] opacity-75 border-t border-[var(--color-border)]/40">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Launch CTA Banner */}
      <section className="relative z-10 py-20 border-t border-[var(--color-border)] bg-gradient-to-r from-sky-600/10 via-blue-600/10 to-purple-600/10 backdrop-blur-md">
        <div className="container mx-auto px-6 text-center max-w-3xl">
          <h3 className="text-3xl md:text-5xl font-black tracking-tight mb-6 text-[var(--color-text-main)]">
            Ready to Outpace the Market?
          </h3>
          <p className="text-[var(--color-text-main)] opacity-75 text-base md:text-lg mb-8 leading-relaxed">
            Gain unmatched market advantage. Join elite traders and quantitative desks utilizing Artillegence AI for real-time asymmetric intelligence.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/login"
              className="px-8 py-4 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-full text-base font-bold font-orbitron tracking-wider shadow-xl hover:shadow-sky-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <Cpu size={18} />
              <span>LAUNCH LIVE TERMINAL</span>
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Connect / Footer */}
      <footer id="connect" className="relative z-10 bg-[var(--color-card)] border-t border-[var(--color-border)] pt-16 pb-12">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm flex items-center justify-center w-8 h-8">
                  <span className="text-neonBlue font-black text-lg">$</span>
                </div>
                <h1 className="text-xl font-black tracking-widest text-[var(--color-text-main)] font-orbitron">Artillegence AI</h1>
              </div>
              <p className="text-[var(--color-text-main)] opacity-70 leading-relaxed max-w-sm mb-6 text-sm">
                Advanced autonomous market synthesis through multi-agent artificial intelligence. Maintain tactical superiority across global financial frontiers.
              </p>
              <div className="flex gap-3">
                <a href="#" className="p-2.5 border border-[var(--color-border)] rounded-full hover:bg-[var(--color-background)] transition-colors">
                  <Twitter size={18} className="text-[var(--color-text-main)] opacity-70" />
                </a>
                <a href="#" className="p-2.5 border border-[var(--color-border)] rounded-full hover:bg-[var(--color-background)] transition-colors">
                  <Github size={18} className="text-[var(--color-text-main)] opacity-70" />
                </a>
                <a href="#" className="p-2.5 border border-[var(--color-border)] rounded-full hover:bg-[var(--color-background)] transition-colors">
                  <MessageSquare size={18} className="text-[var(--color-text-main)] opacity-70" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-[var(--color-text-main)] font-bold text-xs tracking-widest mb-5 uppercase">CAPABILITIES</h4>
              <ul className="flex flex-col gap-2.5 text-[var(--color-text-main)] opacity-70 text-xs font-semibold">
                <li><a href="#showcase" className="hover:text-neonBlue transition-colors">Telegram Scraper</a></li>
                <li><a href="#showcase" className="hover:text-neonBlue transition-colors">NSE Corporate Radar</a></li>
                <li><a href="#showcase" className="hover:text-neonBlue transition-colors">Alpha & Opportunity Radar</a></li>
                <li><a href="#showcase" className="hover:text-neonBlue transition-colors">Macro Scenarios</a></li>
                <li><a href="#showcase" className="hover:text-neonBlue transition-colors">Google Trends Intel</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[var(--color-text-main)] font-bold text-xs tracking-widest mb-5 uppercase">TERMINAL ACCESS</h4>
              <ul className="flex flex-col gap-2.5 text-[var(--color-text-main)] opacity-70 text-xs font-semibold">
                <li><Link to="/login" className="hover:text-neonBlue transition-colors">Agent Login</Link></li>
                <li><a href="mailto:support@artillegence-intel.ai" className="hover:text-neonBlue transition-colors">Institutional Inquiries</a></li>
                <li className="flex items-center gap-1.5 text-emerald-600 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Systems 100% Operational</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-8 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
            <p className="text-[var(--color-text-main)] opacity-60">© {new Date().getFullYear()} Artillegence AI Intelligence Systems. All rights reserved.</p>
            <div className="flex gap-6 text-[var(--color-text-main)] opacity-60 font-medium">
              <a href="#" className="hover:opacity-100 transition-opacity">Privacy Policy</a>
              <a href="#" className="hover:opacity-100 transition-opacity">Terms of Service</a>
              <a href="#" className="hover:opacity-100 transition-opacity">Security Whitepaper</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Subcomponent for reusable feature cards with particle/glow effects
function FeatureCard({ icon, title, desc, color, bgGlow, tag }: { icon: React.ReactNode, title: string, desc: string, color: string, bgGlow: string, tag?: string }) {
  return (
    <div className={`glass-panel p-7 rounded-2xl border border-[var(--color-border)] transition-all duration-500 group hover:-translate-y-2 bg-[var(--color-card)] ${color} backdrop-blur-xl relative overflow-hidden flex flex-col justify-between`}>
      {/* Internal Particle/Glow Effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 ${bgGlow} filter blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}></div>
      <div className={`absolute bottom-0 left-0 w-24 h-24 ${bgGlow} filter blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-100 pointer-events-none`}></div>

      <div>
        <div className="flex justify-between items-start mb-5">
          <div className={`w-12 h-12 rounded-xl ${bgGlow} flex items-center justify-center border border-[var(--color-border)] group-hover:scale-110 transition-transform relative z-10 shadow-sm`}>
            {icon}
          </div>
          {tag && (
            <span className="text-[10px] font-mono font-bold tracking-widest text-neonBlue px-2 py-0.5 rounded bg-[var(--color-background)] border border-[var(--color-border)]">
              {tag}
            </span>
          )}
        </div>
        <h3 className="text-xl font-bold mb-2.5 text-[var(--color-text-main)] relative z-10">{title}</h3>
        <p className="text-xs md:text-sm text-[var(--color-text-main)] opacity-70 leading-relaxed font-medium relative z-10">
          {desc}
        </p>
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--color-border)]/50 flex items-center justify-between text-xs font-bold text-neonBlue opacity-0 group-hover:opacity-100 transition-opacity">
        <span>Autonomous Stream</span>
        <ArrowUpRight size={14} />
      </div>
    </div>
  );
}
