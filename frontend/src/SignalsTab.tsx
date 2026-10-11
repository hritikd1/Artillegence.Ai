/**
 * SignalsTab.tsx — AI Signal Accuracy Tracker & History
 * Shows past AI predictions with outcomes, building user trust.
 */
import { useState, useEffect } from 'react'
import { Target, TrendingUp, TrendingDown, CheckCircle2, XCircle, Clock, RefreshCw, BarChart3, Shield } from 'lucide-react'
import { apiGet } from './api'

interface Signal {
  id: string
  agent: string
  signal_type: string
  target: string
  direction: string
  confidence: string
  reasoning: string
  timestamp: string
  outcome?: string
  actual_move?: string
  correct?: number | null
}

interface SignalScorecard {
  total_signals: number
  verified_signals: number
  correct_signals: number
  accuracy_pct: number
  pending_verification: number
  by_agent: Record<string, { total: number; correct: number; accuracy_pct: number }>
  recent_signals: Signal[]
  last_updated: string
}

const AGENT_LABELS: Record<string, string> = {
  news_scanner: 'News Scanner',
  market_analyzer: 'Market Analyzer',
  opportunity_finder: 'Opportunity Finder',
  trending_tracker: 'Trending Tracker',
  indian_market_tracker: 'Indian Market',
  telegram_scanner: 'Telegram Intel',
  scenario_intelligence: 'Scenario AI',
  continuous_news_agent: 'Live Briefing',
}

export default function SignalsTab() {
  const [scorecard, setScorecard] = useState<SignalScorecard | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSignals = async () => {
    setLoading(true)
    try {
      const data = await apiGet<SignalScorecard>('/api/signals')
      if (data && !('error' in data)) {
        setScorecard(data)
      }
    } catch (err) {
      console.error('Failed to load signals:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !scorecard) {
    return (
      <div className="flex flex-col items-center justify-center p-20 glass-panel h-[600px] animate-fade-in">
        <RefreshCw className="animate-spin text-neonBlue mb-4" size={32} />
        <span className="text-xs font-bold text-[var(--color-text-main)] tracking-widest uppercase">Loading Signal Intelligence...</span>
      </div>
    )
  }

  const sc = scorecard || {
    total_signals: 0,
    verified_signals: 0,
    correct_signals: 0,
    accuracy_pct: 0,
    pending_verification: 0,
    by_agent: {},
    recent_signals: [],
    last_updated: new Date().toISOString(),
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-main)] flex items-center gap-2">
            <Target className="text-indigo-400" size={20} /> AI SIGNAL TRACKER
          </h2>
          <p className="text-xs text-[var(--color-text-main)] mt-0.5">Track record of all AI-generated trading signals and their accuracy</p>
        </div>
        <button
          onClick={fetchSignals}
          className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-card)] hover:bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-main)] text-xs font-bold transition cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Scorecard Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total Signals"
          value={sc.total_signals}
          icon={<BarChart3 size={16} className="text-sky-400" />}
          color="sky"
        />
        <StatCard
          label="Verified"
          value={sc.verified_signals}
          icon={<CheckCircle2 size={16} className="text-emerald-400" />}
          color="emerald"
        />
        <StatCard
          label="Correct"
          value={sc.correct_signals}
          icon={<Shield size={16} className="text-indigo-400" />}
          color="indigo"
        />
        <StatCard
          label="Accuracy"
          value={`${sc.accuracy_pct}%`}
          icon={<Target size={16} className="text-amber-400" />}
          color="amber"
          highlight
        />
        <StatCard
          label="Pending"
          value={sc.pending_verification}
          icon={<Clock size={16} className="text-[var(--color-text-main)]" />}
          color="slate"
        />
      </div>

      {/* Accuracy by Agent */}
      {Object.keys(sc.by_agent).length > 0 && (
        <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)]">
          <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-widest uppercase mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-indigo-400" /> Accuracy by Agent
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(sc.by_agent).map(([agent, stats]) => (
              <div key={agent} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <div className="text-xs md:text-sm font-bold text-[var(--color-text-main)] tracking-wide truncate">
                    {AGENT_LABELS[agent] || agent}
                  </div>
                  <div className="text-xs text-[var(--color-text-main)] opacity-80 mt-0.5 font-medium">
                    {stats.correct}/{stats.total} correct
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-20 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        stats.accuracy_pct >= 70 ? 'bg-emerald-500' :
                        stats.accuracy_pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(stats.accuracy_pct, 100)}%` }}
                    />
                  </div>
                  <span className={`text-sm font-black ${
                    stats.accuracy_pct >= 70 ? 'text-emerald-500' :
                    stats.accuracy_pct >= 50 ? 'text-amber-500' : 'text-rose-500'
                  }`}>
                    {stats.accuracy_pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Signals Table */}
      <div className="glass-panel p-6 border border-[var(--color-border)] bg-[var(--color-card)]">
        <h3 className="text-sm font-bold text-[var(--color-text-main)] tracking-widest uppercase mb-4 flex items-center gap-2">
          <Clock size={16} className="text-sky-400" /> Recent Signals
        </h3>

        {sc.recent_signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-main)]">
            <Target className="text-slate-400 mb-3" size={36} />
            <h3 className="text-sm md:text-base font-bold text-[var(--color-text-main)] uppercase tracking-widest">No signals recorded yet</h3>
            <p className="text-xs md:text-sm text-[var(--color-text-main)] opacity-75 mt-1 max-w-md text-center">
              AI agents will start generating signals as they analyze market data. Check back in a few minutes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] max-h-[460px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-[var(--color-card)] border-b border-[var(--color-border)] text-xs font-bold tracking-wider text-[var(--color-text-main)] uppercase">
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Agent</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4 text-center">Direction</th>
                  <th className="py-3 px-4 text-center">Confidence</th>
                  <th className="py-3 px-4 text-center">Result</th>
                  <th className="py-3 px-4">Reasoning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[var(--color-text-main)] font-medium">
                {sc.recent_signals.map((sig) => {
                  const dt = new Date(sig.timestamp)
                  const timeStr = dt.toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })

                  return (
                    <tr key={sig.id} className="hover:bg-slate-50/80 dark:hover:bg-[var(--color-card)] transition">
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs font-semibold text-[var(--color-text-main)]">{timeStr}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-md border bg-slate-100 dark:bg-[var(--color-card)] text-[var(--color-text-main)] border-[var(--color-border)] uppercase tracking-wider">
                          {AGENT_LABELS[sig.agent] || sig.agent}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-sm md:text-base text-[var(--color-text-main)]">{sig.target}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider ${
                          sig.direction === 'LONG' || sig.direction === 'BULLISH'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : sig.direction === 'SHORT' || sig.direction === 'BEARISH'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                              : 'bg-slate-100 dark:bg-[var(--color-card)] text-[var(--color-text-main)] border-[var(--color-border)]'
                        }`}>
                          {sig.direction === 'LONG' || sig.direction === 'BULLISH' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {sig.direction}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-xs font-bold uppercase ${
                          sig.confidence === 'High' ? 'text-emerald-500 dark:text-emerald-400' :
                          sig.confidence === 'Medium' ? 'text-amber-500 dark:text-amber-400' : 'text-[var(--color-text-main)]'
                        }`}>
                          {sig.confidence}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {sig.correct === 1 ? (
                          <CheckCircle2 size={18} className="text-emerald-500 dark:text-emerald-400 mx-auto" />
                        ) : sig.correct === 0 ? (
                          <XCircle size={18} className="text-rose-500 dark:text-rose-400 mx-auto" />
                        ) : (
                          <Clock size={16} className="text-slate-400 mx-auto animate-pulse" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-[var(--color-text-main)] max-w-xs truncate text-xs md:text-sm" title={sig.reasoning}>
                        {sig.reasoning || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color: _color,
  highlight,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  highlight?: boolean
}) {
  return (
    <div className={`glass-panel p-5 border border-[var(--color-border)] bg-[var(--color-card)] rounded-xl shadow-sm ${highlight ? 'border-amber-500/30' : ''}`}>
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <span className="text-xs font-bold text-[var(--color-text-main)] tracking-wider uppercase">{label}</span>
      </div>
      <div className={`text-2xl md:text-3xl font-black ${highlight ? 'text-amber-500 dark:text-amber-400' : 'text-[var(--color-text-main)]'}`}>
        {value}
      </div>
    </div>
  )
}
