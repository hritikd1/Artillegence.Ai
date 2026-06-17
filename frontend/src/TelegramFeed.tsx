import { useState } from 'react';
import { Radio, ExternalLink, MessageCircle } from 'lucide-react';

/* Single Telegram embed widget */
export function TelegramEmbed({ channelSlug, postId, compact }: { channelSlug: string; postId: string; compact?: boolean }) {
    const [loaded, setLoaded] = useState(false);
    const iframeH = compact ? '200px' : '350px';

    return (
        <div className="rounded-lg overflow-hidden bg-slate-900/40 relative" style={{ minHeight: compact ? '120px' : '180px' }}>
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 z-10 bg-slate-900/80">
                    <Radio className="animate-pulse mr-2" size={14} />
                    <span className="text-xs">Loading intel...</span>
                </div>
            )}
            {/* Telegram native embed using iframe */}
            <div className="w-full relative" style={{ height: iframeH, overflowY: 'auto', overflowX: 'hidden' }}>
                <iframe
                    src={`https://t.me/${channelSlug}/${postId}?embed=1&dark=1`}
                    width="100%"
                    height="100%"
                    style={{ border: 'none', minHeight: iframeH }}
                    onLoad={() => setLoaded(true)}
                    title={`Telegram Post ${postId}`}
                ></iframe>
            </div>
        </div>
    );
}

function TelegramPostCard({ post }: { post: any }) {
    const [showEmbed, setShowEmbed] = useState(false);
    const slug = typeof post.source === 'string' ? post.source.replace('Telegram: ', '') : 'CIG_telegram';
    
    return (
        <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-lg animate-fade-in space-y-2 text-left">
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-sky-400 bg-sky-950/40 border border-sky-800/30 px-1.5 py-0.5 rounded uppercase font-mono">
                    @{slug}
                </span>
                <span className="text-[8px] text-slate-500">{new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            
            {post.title && (
                <h4 className="text-[11px] font-bold text-white leading-tight">{post.title}</h4>
            )}
            
            {post.snippet && (
                <p className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap">{post.snippet}</p>
            )}

            <div className="flex items-center justify-between pt-1">
                <button 
                    onClick={() => (window as any).triggerTacticalAdvice(post.title || `Telegram update from @${slug}`, post.snippet || '')}
                    className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-0.5 transition-colors uppercase tracking-tight"
                >
                    ✨ Analyze Impact
                </button>

                <div className="flex items-center gap-2">
                    {post.telegram_post_id && (
                        <button
                            onClick={() => setShowEmbed(!showEmbed)}
                            className="text-[9px] font-bold text-slate-400 hover:text-slate-200 transition-colors uppercase tracking-tight"
                        >
                            {showEmbed ? 'Hide Native' : 'Show Native'}
                        </button>
                    )}
                    <a 
                        href={post.url || `https://t.me/${slug}/${post.telegram_post_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] font-bold text-slate-400 hover:text-slate-200 flex items-center gap-0.5 transition-colors uppercase tracking-tight"
                    >
                        <ExternalLink size={10} /> Open
                    </a>
                </div>
            </div>

            {showEmbed && post.telegram_post_id && (
                <div className="mt-2 pt-2 border-t border-slate-800/60">
                    <TelegramEmbed channelSlug={slug} postId={post.telegram_post_id} compact={true} />
                    <p className="text-[8px] text-slate-500 mt-1 italic text-center">
                        Note: Embed requires direct connection to t.me
                    </p>
                </div>
            )}
        </div>
    );
}

/* Telegram Feed Section */
export default function TelegramFeed({ data }: { data?: any }) {
    const newsItems = data?.news_items || [];
    // Show both telegram posts and generic updates (like from website scanner)
    const validPosts = newsItems
        .filter((item: any) => item.telegram_post_id || item.agent === 'website_scanner')
        .slice(0, 20);

    const [adding, setAdding] = useState(false);

    const handleAddSource = async (url: string) => {
        if (!url) return;
        setAdding(true);
        try {
            const resp = await fetch(`/api/add_intel_source`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ url })
            });
            const data = await resp.json();
            if (data.status === 'success') {
                alert(data.message);
            } else {
                alert(data.error || 'Failed to add source');
            }
        } catch (err) {
            alert('Error connecting to intelligence API');
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="glass-panel p-4 h-full flex flex-col" style={{ maxHeight: '600px' }}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-sky-500/10 rounded border border-sky-500/20">
                        <MessageCircle size={14} className="text-sky-400" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-white tracking-widest uppercase">Global Intel Feed</h3>
                        <p className="text-[8px] text-slate-500 font-medium">Real-time dispatches & web monitoring</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                    <span className="text-[10px] font-bold text-slate-400">LIVE</span>
                </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-3 mb-4">
                <div className="text-[9px] text-slate-400 tracking-widest font-bold mb-2 uppercase flex items-center gap-2">
                    <ExternalLink size={10} className="text-neonBlue" /> Add New Source to Monitor
                </div>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Telegram link or Website URL..."
                        className="flex-1 bg-slate-950 border border-slate-700/50 rounded px-3 py-1.5 text-[10px] text-white focus:outline-none focus:border-neonBlue transition-colors"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleAddSource(e.currentTarget.value);
                                e.currentTarget.value = '';
                            }
                        }}
                    />
                    <button 
                        className="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/40 border border-sky-500/30 text-sky-400 text-[10px] font-bold rounded transition-all disabled:opacity-50"
                        onClick={(e) => {
                            const input = (e.currentTarget.previousSibling as HTMLInputElement);
                            handleAddSource(input.value);
                            input.value = '';
                        }}
                        disabled={adding}
                    >
                        {adding ? '...' : 'ADD'}
                    </button>
                </div>
                <p className="text-[8px] text-slate-500 mt-2 italic">Scrapes latest news periodically for map plotting & feed</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin pr-1">
                {validPosts.length > 0 ? (
                    validPosts.map((post: any, i: number) => {
                        if (post.agent === 'website_scanner') {
                            return (
                                <div key={`ws-${i}`} className="p-3 bg-indigo-900/10 border border-indigo-500/20 rounded-lg animate-fade-in text-left">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Web Monitoring Update</span>
                                        <span className="text-[8px] text-slate-500">{new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <h4 className="text-[11px] font-bold text-white mb-1">{post.title}</h4>
                                    <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{post.summary}</p>
                                    <button 
                                        onClick={() => (window as any).triggerTacticalAdvice(post.title, post.summary)}
                                        className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors uppercase tracking-tighter"
                                    >
                                        ✨ Analyze Impact on Indian Market
                                    </button>
                                </div>
                            );
                        }
                        
                        return <TelegramPostCard key={i} post={post} />;
                    })
                ) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-40">
                        <Radio size={32} className="text-slate-600 mb-2 animate-pulse" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Scanning frequency...</p>
                    </div>
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/50 flex items-center justify-between">
                <span className="text-[9px] text-slate-500">
                    {validPosts.length > 0 ? `${validPosts.length} live posts inside target box` : 'Connecting...'}
                </span>
                <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${validPosts.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></div>
                    <span className={`text-[9px] font-bold ${validPosts.length > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {validPosts.length > 0 ? 'LIVE' : 'SYNCING'}
                    </span>
                </div>
            </div>
        </div>
    );
}
