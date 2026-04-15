import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ChevronRight, Fingerprint, Activity, ShieldCheck } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
      const response = await fetch(`http://localhost:8000${endpoint}`, {
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
    <div className="min-h-screen bg-[#060B12] flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neonBlue/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neonPurple/10 rounded-full blur-[100px] pointer-events-none"></div>
      
      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none"></div>

      <div className="w-full max-w-md z-10 glass-panel p-8 md:p-10 border border-slate-700/50 shadow-2xl relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neonBlue via-violet-500 to-neonBlue opacity-80"></div>
        
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center bg-slate-900/80 rounded-2xl border border-slate-800 shadow-[0_0_20px_rgba(56,189,248,0.15)] mb-6 overflow-hidden">
            <img src="/logo-full.png" alt="Artillegence AI" className="w-24 h-24 object-cover" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2 drop-shadow-md">
            Artillegence <span className="text-neonBlue font-light">System</span>
          </h1>
          <p className="text-slate-500 text-xs tracking-widest font-bold mt-2 uppercase">
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
                <User size={18} className="text-slate-500 group-focus-within:text-neonBlue transition-colors" />
              </div>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-neonBlue focus:ring-1 focus:ring-neonBlue/50 transition-all font-mono"
                placeholder="Agent ID or Email"
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-slate-500 group-focus-within:text-neonBlue transition-colors" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-neonBlue focus:ring-1 focus:ring-neonBlue/50 transition-all font-mono tracking-widest"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-neonBlue focus:ring-neonBlue focus:ring-offset-slate-900" />
              <span className="text-xs text-slate-400 font-medium tracking-wide">Remember terminal</span>
            </label>
            <a href="#" className="text-xs text-neonBlue hover:text-sky-300 font-medium transition-colors">Emergency Reset?</a>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full relative overflow-hidden group bg-neonBlue/10 hover:bg-neonBlue/20 border border-neonBlue/50 text-neonBlue font-bold tracking-widest py-3.5 rounded-lg transition-all flex items-center justify-center gap-2"
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
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-700 ease-in-out"></div>
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            type="button" 
            onClick={() => setIsLoginMode(!isLoginMode)}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            {isLoginMode ? "No agent identity? Register here." : "Already have an uplink? Login here."}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 tracking-wider">
            SECURE AI-POWERED PLATFORM V2.0 <br/> UNATHORIZED ACCESS IS PROHIBITED
          </p>
        </div>
      </div>
    </div>
  );
}
