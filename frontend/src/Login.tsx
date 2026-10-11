import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ChevronRight, Fingerprint, Activity, ShieldCheck } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [theme, setTheme] = useState<'broken-glass' | 'neon-black'>(() => {
    return localStorage.getItem('app_theme') === 'neon-black' ? 'neon-black' : 'broken-glass';
  });

  useEffect(() => {
    const currentTheme = localStorage.getItem('app_theme') === 'neon-black' ? 'neon-black' : 'broken-glass';
    setTheme(currentTheme);
    document.body.className = `theme-${currentTheme}`;
  }, []);

  const isLight = theme === 'broken-glass';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim() || !password.trim()) {
      setError('Please enter valid credentials.');
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.access_token);
        navigate('/dashboard');
      } else {
        setError(data.detail || 'Authentication failed. Unauthorized.');
      }
    } catch (err) {
      setError('System unreachable. Terminal locked.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-main)] flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neonBlue/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neonPurple/10 rounded-full blur-[100px] pointer-events-none"></div>
      
      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none"></div>

      <div className="w-full max-w-md z-10 glass-panel p-8 md:p-10 border border-[var(--color-border)] shadow-2xl relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neonBlue via-violet-500 to-neonBlue opacity-80"></div>
        
        {/* Header */}
        <div className="text-center mb-10">
          <div className={`inline-flex items-center justify-center rounded-2xl border mb-6 overflow-hidden ${isLight ? 'bg-white shadow-[0_8px_16px_rgba(0,0,0,0.1)] border-slate-200' : 'bg-[var(--color-background)] shadow-[0_0_20px_rgba(56,189,248,0.15)] border-[var(--color-border)]'}`}>
            <img src="/logo-full.png" alt="Artillegence AI" className="w-24 h-24 object-cover" />
          </div>
          <h1 className={`text-3xl font-black tracking-tight flex items-center justify-center gap-2 ${isLight ? 'text-slate-800 drop-shadow-sm' : 'text-[var(--color-text-main)] drop-shadow-md'}`}>
            Artillegence <span className={isLight ? 'text-blue-600 font-light' : 'text-neonBlue font-light'}>System</span>
          </h1>
          <p className={`${isLight ? 'text-slate-500' : 'text-[var(--color-text-main)] opacity-70'} text-xs tracking-widest font-bold mt-2 uppercase`}>
            {isLoginMode ? 'Restricted Terminal Access' : 'Create Agent Identity'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-3 rounded flex items-center gap-2 animate-fade-in">
            <ShieldCheck size={16} className="text-red-500" /> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={18} className={`${isLight ? 'text-slate-400 group-focus-within:text-blue-600' : 'text-[var(--color-text-main)] opacity-50 group-focus-within:text-neonBlue'} transition-colors`} />
              </div>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-lg py-3 pl-10 pr-4 text-sm focus:outline-none transition-all font-mono ${isLight ? 'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-inner' : 'bg-[var(--color-background)] opacity-80 border border-[var(--color-border)] text-[var(--color-text-main)] placeholder:text-[var(--color-text-main)] placeholder:opacity-50 focus:border-neonBlue focus:ring-1 focus:ring-neonBlue/50'}`}
                placeholder="Agent ID or Email"
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className={`${isLight ? 'text-slate-400 group-focus-within:text-blue-600' : 'text-[var(--color-text-main)] opacity-50 group-focus-within:text-neonBlue'} transition-colors`} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full rounded-lg py-3 pl-10 pr-4 text-sm focus:outline-none transition-all font-mono tracking-widest ${isLight ? 'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-inner' : 'bg-[var(--color-background)] opacity-80 border border-[var(--color-border)] text-[var(--color-text-main)] placeholder:text-[var(--color-text-main)] placeholder:opacity-50 focus:border-neonBlue focus:ring-1 focus:ring-neonBlue/50'}`}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className={`w-4 h-4 rounded ${isLight ? 'bg-white border-slate-300 text-blue-600 focus:ring-blue-600' : 'bg-[var(--color-background)] border-[var(--color-border)] text-neonBlue focus:ring-neonBlue focus:ring-offset-[var(--color-background)]'}`} />
              <span className={`text-xs font-medium tracking-wide ${isLight ? 'text-slate-600' : 'text-[var(--color-text-main)] opacity-70'}`}>Remember terminal</span>
            </label>
            <a href="#" className={`text-xs font-medium transition-colors ${isLight ? 'text-blue-600 hover:text-blue-800' : 'text-neonBlue hover:text-sky-300'}`}>Emergency Reset?</a>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full relative overflow-hidden group font-bold tracking-widest py-3.5 rounded-lg transition-all flex items-center justify-center gap-2 ${isLight ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30' : 'bg-neonBlue/10 hover:bg-neonBlue/20 border border-neonBlue/50 text-neonBlue'}`}
          >
            {isLoading ? (
              <>
                <Activity size={18} className="animate-spin" />
                <span>{isLoginMode ? 'AUTHENTICATING...' : 'REGISTERING...'}</span>
              </>
            ) : (
              <>
                <Fingerprint size={18} />
                <span>{isLoginMode ? 'INITIALIZE UPLINK' : 'CREATE IDENTITY'}</span>
                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
            
            {/* Button Hover Glow */}
            <div className={`absolute inset-0 w-full h-full bg-gradient-to-r from-transparent ${isLight ? 'via-white' : 'via-[var(--color-text-main)]'} opacity-20 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-700 ease-in-out`}></div>
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            type="button" 
            onClick={() => setIsLoginMode(!isLoginMode)}
            className="text-xs text-[var(--color-text-main)] opacity-70 hover:opacity-100 transition-colors"
          >
            {isLoginMode ? "No agent identity? Register here." : "Already have an uplink? Login here."}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--color-border)] text-center">
          <p className="text-[10px] text-[var(--color-text-main)] opacity-50 tracking-wider">
            SECURE AI-POWERED PLATFORM V2.0 <br/> UNATHORIZED ACCESS IS PROHIBITED
          </p>
        </div>
      </div>
    </div>
  );
}
