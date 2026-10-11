import { useState, useEffect } from 'react';
import { Target, Search, BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import { apiGet } from './api';

interface ScreenedStock {
  symbol: string;
  name: string;
  price: number;
  pe: number;
  market_cap: number;
  div_yield: number;
  np_qtr: number;
  qtr_profit_var: number;
  sales_qtr: number;
  qtr_sales_var: number;
  roce: number;
  metric: string;
  value: any;
}

export default function ScreenerTab() {
  const [strategy, setStrategy] = useState<string>('adx_rm');
  const [results, setResults] = useState<ScreenedStock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const strategies = [
    { id: 'canslim', name: 'CANSLIM', desc: 'Earnings growth & price momentum' },
    { id: 'benjamin_graham', name: 'Benjamin Graham', desc: 'Undervalued fundamentals' },
    { id: 'magic_formula', name: 'Magic Formula', desc: 'High ROIC & Earnings Yield' },
    { id: 'piotroski', name: 'Piotroski F-Score', desc: 'Financial health scoring (0-9)' },
    { id: 'adx_rm', name: 'ADX RM', desc: '+DI ≥ 30 on 1D timeframe' }
  ];

  useEffect(() => {
    fetchScreener(strategy);
  }, [strategy]);

  const fetchScreener = async (strat: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ status: string; data: ScreenedStock[]; error?: string }>(`/api/screener?strategy=${strat}`);
      if (res && res.status === 'success') {
        setResults(res.data || []);
      } else {
        throw new Error(res?.error || 'Failed to fetch screener data');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching screener data');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="glass-panel p-6 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/60 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-wide uppercase flex items-center gap-3">
            <Target className="text-sky-600 dark:text-neonBlue" size={30} />
            Quant Screener <span className="text-xs md:text-sm px-2.5 py-1 bg-sky-500/10 text-sky-600 dark:text-neonBlue border border-sky-500/20 rounded-md font-bold">ALPHA</span>
          </h2>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">Algorithmic stock discovery using technical & fundamental logic</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Strategy Selector (Sidebar) */}
        <div className="lg:col-span-1 glass-panel p-5 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-sm">
          <h3 className="text-xs md:text-sm font-bold text-slate-700 dark:text-slate-500 tracking-widest uppercase mb-4 flex items-center gap-2">
            <Search size={16} /> ALGORITHMS
          </h3>
          <div className="flex flex-col gap-2.5">
            {strategies.map(s => (
              <button
                key={s.id}
                onClick={() => setStrategy(s.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  strategy === s.id
                    ? 'bg-sky-500/10 border-sky-500 text-sky-700 dark:text-white shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                <div className="font-extrabold text-sm md:text-base">{s.name}</div>
                <div className={`text-xs mt-1 ${strategy === s.id ? 'text-sky-600 dark:text-sky-300 font-semibold' : 'text-slate-500'}`}>
                  {s.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Results Area */}
        <div className="lg:col-span-3 glass-panel p-6 border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 min-h-[500px] flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-800/50 pb-4">
            <div>
              <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="text-sky-500" size={22} />
                {strategies.find(s => s.id === strategy)?.name} Results
              </h3>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">Screened from Nifty 500 Universe</p>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-sky-600 dark:text-neonBlue text-xs md:text-sm font-bold tracking-wider">
                <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                SCANNING...
              </div>
            )}
          </div>

          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-rose-500">
              <AlertTriangle size={36} className="mb-3" />
              <p className="font-bold text-base tracking-wide">Error Running Screener</p>
              <p className="text-xs md:text-sm mt-1 text-slate-500">{error}</p>
            </div>
          ) : loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin"></div>
              <p className="text-xs md:text-sm font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest animate-pulse">Running quantitative analysis...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6">
              <TrendingUp size={48} className="mb-4 text-slate-400" />
              <p className="text-base font-bold tracking-wide uppercase">No Matches Found</p>
              <p className="text-xs md:text-sm mt-1">No stocks in the tracked universe currently meet the {strategies.find(s => s.id === strategy)?.name} criteria.</p>
            </div>
          ) : (
            <div 
              className="overflow-x-auto w-full scrollbar-thin rounded-xl border border-slate-200 dark:border-slate-800"
              style={{ overscrollBehavior: 'contain', transform: 'translateZ(0)' }}
            >
              <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/80 text-xs md:text-sm text-slate-700 dark:text-slate-400 font-bold tracking-wider uppercase">
                    <th className="py-3.5 px-4">S.No.</th>
                    <th className="py-3.5 px-4">Name</th>
                    <th className="py-3.5 px-4 text-right">CMP Rs.</th>
                    <th className="py-3.5 px-4 text-right">P/E</th>
                    <th className="py-3.5 px-4 text-right">Mar Cap Rs.Cr.</th>
                    <th className="py-3.5 px-4 text-right">Div Yld %</th>
                    <th className="py-3.5 px-4 text-right">NP Qtr Rs.Cr.</th>
                    <th className="py-3.5 px-4 text-right">Qtr Profit Var %</th>
                    <th className="py-3.5 px-4 text-right">Sales Qtr Rs.Cr.</th>
                    <th className="py-3.5 px-4 text-right">Qtr Sales Var %</th>
                    <th className="py-3.5 px-4 text-right">ROCE %</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((stock, idx) => (
                    <tr 
                      key={stock.symbol} 
                      className={`border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-sm md:text-base ${idx % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-900/40' : 'bg-transparent'}`}
                    >
                      <td className="py-3.5 px-4 text-slate-500 font-medium">{idx + 1}</td>
                      <td className="py-3.5 px-4 text-sky-600 dark:text-sky-400 hover:underline cursor-pointer font-bold">
                        {stock.name}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-200">
                        {typeof stock.price === 'number' ? stock.price.toFixed(2) : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {typeof stock.pe === 'number' ? stock.pe.toFixed(2) : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {typeof stock.market_cap === 'number' ? stock.market_cap.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {typeof stock.div_yield === 'number' ? stock.div_yield.toFixed(2) : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {typeof stock.np_qtr === 'number' ? stock.np_qtr.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        <span className={(stock.qtr_profit_var || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {typeof stock.qtr_profit_var === 'number' ? stock.qtr_profit_var.toFixed(2) : 'N/A'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {typeof stock.sales_qtr === 'number' ? stock.sales_qtr.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        <span className={(stock.qtr_sales_var || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {typeof stock.qtr_sales_var === 'number' ? stock.qtr_sales_var.toFixed(2) : 'N/A'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {typeof stock.roce === 'number' ? stock.roce.toFixed(2) : 'N/A'}
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
  );
}
