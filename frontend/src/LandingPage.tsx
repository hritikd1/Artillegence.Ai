import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Shield, Activity, Globe as GlobeIcon, Cpu, Zap, Mail, Github, Twitter, MessageSquare, Database, LineChart } from 'lucide-react';
import ParticleGlobe from './ParticleGlobe';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#03060A] text-white relative font-sans scroll-smooth">
      
      {/* Dynamic WebGL Background */}
      <div className="fixed inset-0 z-0 pointer-events-none mix-blend-screen opacity-100 lg:translate-x-[25%] transition-transform duration-1000">
         <ParticleGlobe />
      </div>

      {/* Grid overlay */}
      <div className="fixed inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.02] pointer-events-none z-0"></div>

      {/* Header */}
      <header className="relative z-50 w-full px-6 py-6 md:px-12 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-3">
          <div className="bg-neonBlue/10 rounded-xl border border-neonBlue/30 shadow-[0_0_15px_rgba(56,189,248,0.2)] overflow-hidden flex-shrink-0">
            <img src="/logo-icon.png" alt="Artillegence AI" className="w-10 h-10 min-w-[40px] object-cover" />
          </div>
          <h1 className="text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
            Artillegence<span className="font-light text-neonBlue"> AI</span>
          </h1>
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-semibold tracking-wide text-slate-300">
          <a href="#features" className="hover:text-neonBlue transition-colors">FEATURES</a>
          <a href="#about" className="hover:text-neonBlue transition-colors">ABOUT</a>
          <a href="#connect" className="hover:text-neonBlue transition-colors">CONNECT</a>
        </nav>
        <Link 
          to="/login"
          className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-semibold tracking-wide transition-all hover:scale-105 active:scale-95 text-white"
        >
          AGENT LOGIN
        </Link>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 container mx-auto px-6 py-32 lg:py-48 flex flex-col items-center lg:items-start text-center lg:text-left min-h-screen">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neonPurple/10 border border-neonPurple/30 text-neonPurple text-xs font-bold tracking-widest mb-8 animate-pulse shadow-[0_0_15px_rgba(139,92,246,0.3)]">
          <Activity size={14} /> SYSTEM ONLINE: CLAUDE 3.5 SONNET
        </div>
        
        <h2 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight max-w-3xl drop-shadow-2xl">
          Supercharge Your <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-neonBlue via-violet-400 to-neonPurple">
            Market Intelligence
          </span>
        </h2>
        
        <p className="max-w-xl text-slate-300 text-lg md:text-xl font-medium mb-12 leading-relaxed drop-shadow-md">
          The ultimate multi-agent AI system. Harness real-time Telegram scraping, visual chart analysis, 
          and geopolitical news tracking inside one fully autonomous master dashboard.
        </p>

        <div className="flex gap-4 flex-col sm:flex-row">
          <Link 
            to="/login"
            className="group relative inline-flex flex-col flex-shrink-0 items-center justify-center"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-neonBlue to-neonPurple rounded-full blur opacity-40 group-hover:opacity-70 transition duration-500"></div>
            <button className="relative px-8 py-4 bg-[#0a0f18] border border-white/10 rounded-full flex items-center gap-3 text-lg font-bold tracking-wider hover:bg-[#121926] transition-all">
              <Cpu size={22} className="text-neonBlue" />
              OPEN TERMINAL
              <ChevronRight size={20} className="group-hover:translate-x-1 duration-300 text-neonPurple" />
            </button>
          </Link>
        </div>
      </main>

      {/* Features Detail Section */}
      <section id="features" className="relative z-10 bg-black/60 border-t border-white/5 py-32 backdrop-blur-lg">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-sm font-bold text-neonBlue tracking-[0.3em] uppercase mb-4">Core Architecture</h2>
            <h3 className="text-4xl md:text-5xl font-black mb-6">Designed For Total Dominance</h3>
            <p className="text-slate-400 text-lg leading-relaxed">
              We leverage an ensemble of visual LLMs and programmatic web scrapers to synthesize the noise of the global market into actionable, high-probability intelligence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative">
            {/* Ambient background glow for the grid */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-neonBlue/10 blur-[120px] rounded-full pointer-events-none"></div>

            <FeatureCard 
              icon={<GlobeIcon size={32} className="text-blue-400" />}
              title="Global Anomaly Detection"
              desc="Our Python backend constantly scans dark-web and deep-telegram channels, piping geo-tagged war and supply-chain events directly onto your interactive 3D WebGL globe in milliseconds."
              color="border-blue-500/30 hover:border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
              bgGlow="bg-blue-500/10"
            />

            <FeatureCard 
              icon={<LineChart size={32} className="text-violet-400" />}
              title="Visual Chart Analysis"
              desc="Upload TradingView setups or let our backend automatically screenshot tickers. Claude 3.5 Sonnet parses candlesticks, support/resistance, and volume profiles autonomously."
              color="border-violet-500/30 hover:border-violet-500/60 shadow-[0_0_20px_rgba(139,92,246,0.1)]"
              bgGlow="bg-violet-500/10"
            />

            <FeatureCard 
              icon={<Database size={32} className="text-orange-400" />}
              title="Encrypted Vault Access"
              desc="We don't play with security. The Artillegence System is locked behind an impenetrable wall of Bcrypt hashing and JWT authorizations. Local SQLite guarantees your intel never leaks."
              color="border-orange-500/30 hover:border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.1)]"
              bgGlow="bg-orange-500/10"
            />
          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section id="about" className="relative z-10 py-32">
        <div className="container mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-sm font-bold text-neonPurple tracking-[0.3em] uppercase mb-4">About Artillegence</h2>
            <h3 className="text-4xl md:text-5xl font-black mb-6 leading-tight">We build asymmetric advantages.</h3>
            <p className="text-slate-400 text-lg leading-relaxed mb-6">
              In modern financial markets, execution speed is commoditized. The only remaining alpha is in <strong>information processing speed</strong>. 
            </p>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              Artillegence Intelligence was built to parse unstructured data—from obscure geopolitical telegram channels to dense financial reports—and synthesize it into a singular, actionable dashboard faster than a human analyst could read a headline.
            </p>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-white font-bold">
                <Shield className="text-neonBlue" size={20} /> 100% Autonomous
              </div>
              <div className="flex items-center gap-2 text-white font-bold">
                <Zap className="text-neonBlue" size={20} /> Real-Time Latency
              </div>
            </div>
          </div>
          <div className="relative">
            {/* Visual placeholder for about us / aesthetic graphic */}
            <div className="absolute inset-0 bg-gradient-to-tr from-neonBlue/20 to-neonPurple/20 blur-[80px] rounded-full"></div>
            <div className="relative glass-panel border border-white/10 p-8 rounded-2xl flex flex-col gap-4">
              <div className="h-4 w-1/3 bg-white/10 rounded"></div>
              <div className="h-4 w-full bg-white/5 rounded"></div>
              <div className="h-4 w-5/6 bg-white/5 rounded"></div>
              <div className="h-32 w-full mt-4 bg-gradient-to-t from-black to-transparent border border-white/5 rounded-xl flex items-end p-4">
                <div className="flex gap-2 w-full items-end h-full">
                   {[40, 60, 30, 80, 50, 90, 100].map((h, i) => (
                     <div key={i} className="flex-1 bg-neonBlue/60 rounded-t" style={{height: `${h}%`}}></div>
                   ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Connect / Footer */}
      <footer id="connect" className="relative z-10 bg-[#020407] border-t border-white/10 pt-20 pb-10">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <img src="/logo-shield.png" alt="Artillegence AI" className="w-8 h-8 min-w-[32px] flex-shrink-0 object-cover rounded" />
                <h1 className="text-xl font-black tracking-widest text-white">Artillegence AI</h1>
              </div>
              <p className="text-slate-400 leading-relaxed max-w-sm mb-6">
                Advanced market synthesis through multi-agent artificial intelligence. Maintain tactical superiority globally.
              </p>
              <div className="flex gap-4">
                <a href="#" className="p-2 border border-white/10 rounded-full hover:bg-white/5 hover:border-white/30 transition-colors">
                  <Twitter size={20} className="text-slate-300" />
                </a>
                <a href="#" className="p-2 border border-white/10 rounded-full hover:bg-white/5 hover:border-white/30 transition-colors">
                  <Github size={20} className="text-slate-300" />
                </a>
                <a href="#" className="p-2 border border-white/10 rounded-full hover:bg-white/5 hover:border-white/30 transition-colors">
                  <MessageSquare size={20} className="text-slate-300" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-white font-bold tracking-widest mb-6">PLATFORM</h4>
              <ul className="flex flex-col gap-3 text-slate-400">
                <li><a href="#" className="hover:text-neonBlue transition-colors text-sm">Dashboard Login</a></li>
                <li><a href="#" className="hover:text-neonBlue transition-colors text-sm">Mistral Integration</a></li>
                <li><a href="#" className="hover:text-neonBlue transition-colors text-sm">API Documentation</a></li>
                <li><a href="#" className="hover:text-neonBlue transition-colors text-sm">Agent Status</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold tracking-widest mb-6">CONTACT</h4>
              <ul className="flex flex-col gap-3 text-slate-400">
                <li className="flex items-center gap-2 text-sm"><Mail size={16}/> support@artillegence-intel.ai</li>
                <li className="flex items-center gap-2 text-sm"><GlobeIcon size={16}/> New York, NY</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/5 pt-8 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-500 text-sm">© {new Date().getFullYear()} Artillegence Intelligence Systems. All rights reserved.</p>
            <div className="flex gap-6 text-slate-500 text-sm">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Subcomponent for reusable feature cards with particle/glow effects
function FeatureCard({ icon, title, desc, color, bgGlow }: {icon: React.ReactNode, title: string, desc: string, color: string, bgGlow: string}) {
  return (
    <div className={`glass-panel p-8 rounded-2xl border transition-all duration-500 group hover:-translate-y-2 bg-gradient-to-br from-white/[0.03] to-transparent ${color} backdrop-blur-xl relative overflow-hidden`}>
      {/* Internal Particle/Glow Effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 ${bgGlow} filter blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-700`}></div>
      <div className={`absolute bottom-0 left-0 w-24 h-24 ${bgGlow} filter blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-100`}></div>
      
      <div className={`w-14 h-14 rounded-xl ${bgGlow} flex items-center justify-center border border-white/10 mb-6 group-hover:scale-110 transition-transform relative z-10`}>
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-3 text-white relative z-10">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed font-medium relative z-10">
        {desc}
      </p>
    </div>
  );
}
