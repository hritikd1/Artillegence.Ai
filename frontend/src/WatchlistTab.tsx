/**
 * WatchlistTab.tsx — Personal Portfolio Watchlist
 * Users add stocks and see live prices, P&L, and quick access to AI analysis.
 */
import { useState, useEffect, useCallback } from 'react'
import { Star, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw, Search, Zap, X } from 'lucide-react'
import { apiGet, apiPost } from './api'

interface WatchlistStock {
  symbol: string
  name: string
  price: number
  change_pct: number
  is_positive: boolean
  added_at?: string
}

const STORAGE_KEY = 'artillegence_watchlist'

function getWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN']
  } catch {
    return ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN']
  }
}

function saveWatchlist(symbols: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols))
}

const POPULAR_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'SBIN', 'TATAMOTORS',
  'BHARTIARTL', 'ITC', 'LT', 'HAL', 'BEL', 'ONGC',
  'BAJFINANCE', 'WIPRO', 'MARUTI', 'ADANIENT', 'TATASTEEL', 'ICICIBANK'
]

export default function WatchlistTab() {
  const [symbols, setSymbols] = useState<string[]>(getWatchlist)
  const [stockData, setStockData] = useState<Record<string, WatchlistStock>>({})
  const [loading, setLoading] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<{ symbol: string; thesis: string; bias: string } | null>(null)

  const fetchPrices = useCallback(async () => {
    if (symbols.length === 0) return
    setLoading(true)
    try {
      const data = await apiGet<any>('/api/market/performance')
      if (data && !data.error) {
        const merged: Record<string, WatchlistStock> = {}
        const allItems = [...(data.sectors || []), ...(data.stocks || [])]
        for (const item of allItems) {
          // Match by symbol suffix (e.g. RELIANCE.NS matches RELIANCE)
          const rawSym = item.symbol.replace('.NS', '').replace('.BO', '').replace('^', '')
          merged[rawSym] = {
            symbol: rawSym,
            name: item.name,
            price: item.price,
            change_pct: item.change_pct,
            is_positive: item.is_positive,
          }
        }
        setStockData(merged)
      }
    } catch (err) {
      console.error('Watchlist fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [symbols])

  useEffect(() => {
    fetchPrices()
    const interval = setInterval(fetchPrices, 60000) // refresh every minute
    return () => clearInterval(interval)
  }, [fetchPrices])

  const handleAdd = (sym: string) => {
    const cleaned = sym.trim().toUpperCase()
    if (!cleaned || symbols.includes(cleaned)) return
    const updated = [...symbols, cleaned]
    setSymbols(updated)
    saveWatchlist(updated)
    setAddInput('')
    setShowAddModal(false)
  }

  const handleRemove = (sym: string) => {
    const updated = symbols.filter(s => s !== sym)
    setSymbols(updated)
    saveWatchlist(updated)
  }

  const handleAnalyze = async (sym: string) => {
    setAnalysisLoading(sym)
    setAnalysisResult(null)
    try {
      const res = await apiPost<any>('/api/stock_analysis', { symbol: `NSE:${sym}` })
      if (res && !res.error) {
        setAnalysisResult({ symbol: sym, thesis: res.thesis, bias: res.bias })
      }
    } catch (err) {
      console.error('Analysis error:', err)
    } finally {
      setAnalysisLoading(null)
    }
  }

  const gainers = symbols.filter(s => stockData[s]?.is_positive).length
  const losers = symbols.filter(s => stockData[s] && !stockData[s].is_positive).length

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Star className="text-amber-500 dark:text-amber-400" size={26} /> MY WATCHLIST
          </h2>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-500 mt-1">Track your favorite stocks with live prices and AI analysis</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Stats pills */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-500 tracking-wider uppercase">Tracking</span>
            <span className="text-base font-black text-slate-900 dark:text-white">{symbols.length}</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs">
            <TrendingUp size={14} className="text-emerald-500" />
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{gainers}</span>
            <span className="text-slate-400 mx-0.5">/</span>
            <TrendingDown size={14} className="text-rose-500" />
            <span className="text-base font-black text-rose-600 dark:text-rose-400">{losers}</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs md:text-sm rounded-xl transition cursor-pointer uppercase tracking-wider shadow-sm"
          >
            <Plus size={16} /> Add Stock
          </button>
          <button
            onClick={fetchPrices}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition cursor-pointer"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-sky-500' : ''} />
          </button>
        </div>
      </div>

      {/* Watchlist Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {symbols.map(sym => {
          const data = stockData[sym]
          const isAnalyzing = analysisLoading === sym

          return (
            <div
              key={sym}
              className="glass-panel p-5 flex flex-col gap-3.5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 hover:border-sky-500/40 dark:hover:border-neonBlue/30 transition-all rounded-xl shadow-sm hover:shadow-md group"
            >
              {/* Top row: symbol + actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${data?.is_positive ? 'bg-emerald-500' : data ? 'bg-rose-500' : 'bg-slate-400'}`} />
                  <span className="text-base md:text-lg font-black text-slate-900 dark:text-white tracking-wider">{sym}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => handleAnalyze(sym)}
                    disabled={isAnalyzing}
                    className="p-1.5 text-slate-500 hover:text-sky-600 dark:hover:text-neonBlue transition cursor-pointer"
                    title="AI Analysis"
                  >
                    {isAnalyzing ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                  </button>
                  <button
                    onClick={() => handleRemove(sym)}
                    className="p-1.5 text-slate-500 hover:text-rose-500 transition cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Price */}
              {data ? (
                <div>
                  <div className="text-xl md:text-2xl font-black text-slate-900 dark:text-white font-mono">₹{data.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  <div className={`text-xs md:text-sm font-bold flex items-center gap-1 mt-0.5 ${data.is_positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {data.is_positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {data.is_positive ? '+' : ''}{data.change_pct.toFixed(2)}%
                  </div>
                </div>
              ) : (
                <div className="animate-pulse">
                  <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded w-28 mb-1.5" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-20" />
                </div>
              )}

              {/* Name */}
              <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 font-semibold truncate">
                {data?.name || 'Loading...'}
              </div>

              {/* Quick action */}
              <button
                onClick={() => handleAnalyze(sym)}
                className="w-full text-center text-xs font-bold text-slate-700 dark:text-slate-400 hover:text-sky-600 dark:hover:text-neonBlue bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-slate-800/60 hover:border-sky-500/30 rounded-lg py-2 transition cursor-pointer uppercase tracking-wider"
              >
                {isAnalyzing ? 'Analyzing...' : '⚡ AI ANALYSIS'}
              </button>
            </div>
          )
        })}

        {/* Add card */}
        <button
          onClick={() => setShowAddModal(true)}
          className="glass-panel p-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-800/60 hover:border-neonBlue/40 bg-slate-950/20 min-h-[160px] transition cursor-pointer group"
        >
          <Plus size={24} className="text-slate-700 group-hover:text-neonBlue transition" />
          <span className="text-[10px] font-bold text-slate-600 group-hover:text-slate-400 tracking-widest uppercase transition">
            Add Stock
          </span>
        </button>
      </div>

      {/* Analysis Result Modal */}
      {analysisResult && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl max-h-[80vh] overflow-y-auto relative">
            <button
              onClick={() => setAnalysisResult(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-black px-3 py-1 rounded-full border uppercase tracking-widest ${
                  analysisResult.bias === 'LONG' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                  : analysisResult.bias === 'SHORT' ? 'bg-rose-950/40 text-rose-400 border-rose-800'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}>
                  {analysisResult.bias}
                </span>
                <h2 className="text-xl font-bold text-white">NSE:{analysisResult.symbol}</h2>
              </div>
            </div>

            <div className="p-6">
              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {analysisResult.thesis.split('\n').map((line: string, i: number) => {
                  if (line.startsWith('**') || line.includes(':**')) {
                    return <div key={i} className="mt-4 first:mt-0 font-bold text-neonBlue text-sm tracking-wide">{line.replace(/\*\*/g, '')}</div>
                  }
                  return <p key={i} className="mb-2 text-slate-300">{line}</p>
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="p-6 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus size={18} className="text-neonBlue" /> Add Stock to Watchlist
              </h2>
            </div>

            <div className="p-6 space-y-4">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Enter NSE symbol (e.g. RELIANCE)"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd(addInput)}
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white font-mono font-bold placeholder-slate-600 focus:outline-none focus:border-neonBlue transition"
                  autoFocus
                />
              </div>

              {addInput && (
                <button
                  onClick={() => handleAdd(addInput)}
                  className="w-full py-2.5 bg-neonBlue hover:bg-neonBlue/80 text-black font-bold text-xs rounded-lg transition cursor-pointer uppercase tracking-wider"
                >
                  Add {addInput}
                </button>
              )}

              {/* Popular suggestions */}
              <div>
                <span className="text-[9px] font-bold text-slate-500 tracking-widest uppercase">Popular Stocks</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {POPULAR_STOCKS.filter(s => !symbols.includes(s)).slice(0, 12).map(s => (
                    <button
                      key={s}
                      onClick={() => handleAdd(s)}
                      className="text-[10px] font-bold px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded hover:border-neonBlue/40 transition cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
