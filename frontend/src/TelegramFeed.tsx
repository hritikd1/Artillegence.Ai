import { useState } from 'react';
import { Radio, ExternalLink, MessageCircle, MapPin } from 'lucide-react';

/* Helper to render images and videos from reputable sources */
export function renderNewsVideo(videoUrl: string | undefined) {
    if (!videoUrl) return null;
    
    const isYoutube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    const isIframe = isYoutube || videoUrl.includes('player.vimeo.com') || videoUrl.includes('cnbc.com/video/play') || videoUrl.includes('embed');
    
    if (isYoutube) {
        let ytId = '';
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = videoUrl.match(regExp);
        if (match && match[2].length === 11) {
            ytId = match[2];
        }
        if (ytId) {
            return (
                <div className="mt-2 aspect-video rounded overflow-hidden border border-slate-800/80">
                    <iframe
                        src={`https://www.youtube.com/embed/${ytId}`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                    ></iframe>
                </div>
            );
        }
    }
    
    if (isIframe) {
        return (
            <div className="mt-2 aspect-video rounded overflow-hidden border border-slate-800/80">
                <iframe
                    src={videoUrl}
                    title="News Video Player"
                    frameBorder="0"
                    allowFullScreen
                    className="w-full h-full"
                ></iframe>
            </div>
        );
    }
    
    return (
        <div className="mt-2 rounded overflow-hidden border border-slate-800/80 bg-slate-950/80">
            <video 
                src={videoUrl} 
                controls 
                preload="metadata"
                className="w-full max-h-48 object-contain"
                onError={(e) => {
                    (e.target as HTMLVideoElement).style.display = 'none';
                }}
            />
        </div>
    );
}

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

/* Telegram text news preview card with optional toggle embed and locate action */
export function TelegramPostCard({ 
    post, 
    matchingEvent, 
    onSelectEvent 
}: { 
    post: any; 
    matchingEvent?: any; 
    onSelectEvent?: (ev: any) => void 
}) {
    const [showEmbed, setShowEmbed] = useState(false);
    const slug = typeof post.source === 'string' ? post.source.replace('Telegram: ', '') : 'CIG_telegram';
    const timestamp = post.timestamp ? new Date(post.timestamp) : new Date();
    
    // Check if the title is generic or holds actual data
    const isGenericTitle = !post.title || post.title.startsWith("Intel Update from") || post.title === "Telegram Intel Update";
    const displayTitle = isGenericTitle ? null : post.title;
    
    return (
        <div className="p-3 bg-slate-900/50 hover:bg-slate-900/85 border border-slate-800 hover:border-slate-700/60 rounded-lg animate-fade-in transition-all flex flex-col gap-2 shadow-md">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                    <span className="text-[9.5px] font-extrabold text-sky-400 uppercase tracking-widest">{slug}</span>
                </div>
                <span className="text-[8px] text-slate-500 font-medium">
                    {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            
            {displayTitle && (
                <h4 className="text-[11px] font-bold text-slate-100 leading-snug tracking-wide">{displayTitle}</h4>
            )}
            
            <p className="text-[10px] text-slate-350 leading-relaxed font-sans whitespace-pre-wrap select-text break-words">
                {post.snippet || post.summary || 'No intelligence text preview available.'}
            </p>
            
            {post.image && (
                <div className="mt-1 rounded overflow-hidden max-h-40 bg-slate-950/80 flex items-center justify-center border border-slate-900/60">
                    <img 
                        src={post.image} 
                        alt="" 
                        className="max-h-40 object-contain w-full" 
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                    />
                </div>
            )}
            
            <div className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-slate-800/40">
                <button 
                    onClick={() => (window as any).triggerTacticalAdvice(post.title || `Intel from ${slug}`, post.snippet || post.summary || '')}
                    className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors uppercase tracking-tight"
                >
                    ✨ Analyze Impact
                </button>
                <div className="flex items-center gap-2.5">
                    {matchingEvent && onSelectEvent && (
                        <button 
                            onClick={() => onSelectEvent(matchingEvent)}
                            className="text-[9px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-0.5 transition-colors uppercase tracking-tight"
                        >
                            <MapPin size={9} /> Locate
                        </button>
                    )}
                    <button 
                        onClick={() => setShowEmbed(!showEmbed)}
                        className="text-[9px] font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors"
                    >
                        {showEmbed ? 'Hide Embed' : 'Show Embed'}
                    </button>
                    {post.url && (
                        <a 
                            href={post.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[9px] font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors flex items-center gap-0.5"
                        >
                            Open Link <ExternalLink size={8} />
                        </a>
                    )}
                </div>
            </div>
            
            {showEmbed && (
                <div className="mt-2 pt-2 border-t border-slate-800/50">
                    <TelegramEmbed channelSlug={slug} postId={post.telegram_post_id} compact={true} />
                </div>
            )}
        </div>
    );
}

/* Telegram Feed Section */
export default function TelegramFeed({ 
    data, 
    geoEvents = [], 
    onSelectEvent 
}: { 
    data?: any; 
    geoEvents?: any[]; 
    onSelectEvent?: (ev: any) => void 
}) {
    const newsItems = data?.news_items || [];
    // Show telegram posts, website scanner updates, and reputable news updates
    const validPosts = newsItems
        .filter((item: any) => item.telegram_post_id || item.agent === 'website_scanner' || item.agent === 'reputable_news')
        .slice(0, 30);

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
                        // Find matching map event
                        const matchingEvent = geoEvents.find((ev: any) => 
                            (post.telegram_post_id && ev.telegram_post_id === post.telegram_post_id) || 
                            (post.url && ev.url === post.url) || 
                            (post.title && ev.headline === post.title)
                        );

                        if (post.agent === 'website_scanner') {
                            return (
                                <div key={`ws-${i}`} className="p-3 bg-indigo-900/10 border border-indigo-500/20 rounded-lg animate-fade-in flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Web Monitoring Update</span>
                                        <span className="text-[8px] text-slate-500">{new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <h4 className="text-[11px] font-bold text-white leading-snug">{post.title}</h4>
                                    <p className="text-[10px] text-slate-400 leading-relaxed font-sans">{post.summary}</p>
                                    
                                    <div className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-slate-800/40">
                                        <button 
                                            onClick={() => (window as any).triggerTacticalAdvice(post.title, post.summary)}
                                            className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors uppercase tracking-tighter"
                                        >
                                            ✨ Analyze Impact
                                        </button>
                                        <div className="flex items-center gap-2">
                                            {matchingEvent && onSelectEvent && (
                                                <button 
                                                    onClick={() => onSelectEvent(matchingEvent)}
                                                    className="text-[9px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-0.5 transition-colors uppercase tracking-tight"
                                                >
                                                    <MapPin size={9} /> Locate
                                                </button>
                                            )}
                                            {post.url && (
                                                <a 
                                                    href={post.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-[9px] font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors flex items-center gap-0.5"
                                                >
                                                    Open Link <ExternalLink size={8} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        if (post.agent === 'reputable_news') {
                            return (
                                <div key={`rn-${i}`} className="p-3 bg-emerald-950/10 border border-emerald-500/25 rounded-lg animate-fade-in flex flex-col gap-2 shadow-md">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                            <span className="text-[9.5px] font-extrabold text-emerald-400 uppercase tracking-widest">{post.source || 'Reputable News'}</span>
                                        </div>
                                        <span className="text-[8px] text-slate-500 font-medium">
                                            {post.timestamp ? new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                    </div>
                                    <h4 className="text-[11px] font-bold text-slate-100 leading-snug tracking-wide">{post.title}</h4>
                                    {post.snippet && (
                                        <p className="text-[10px] text-slate-300 leading-relaxed font-sans select-text break-words line-clamp-3">
                                            {post.snippet}
                                        </p>
                                    )}
                                    {post.video ? (
                                        renderNewsVideo(post.video)
                                    ) : post.image ? (
                                        <div className="mt-1 rounded overflow-hidden max-h-40 bg-slate-950/80 flex items-center justify-center border border-slate-900/60">
                                            <img 
                                                src={post.image} 
                                                alt="" 
                                                className="max-h-40 object-cover w-full" 
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                                            />
                                        </div>
                                    ) : null}
                                    <div className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-slate-800/40">
                                        <button 
                                            onClick={() => (window as any).triggerTacticalAdvice(post.title, post.snippet || post.summary || '')}
                                            className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors uppercase tracking-tight"
                                        >
                                            ✨ Analyze Impact
                                        </button>
                                        <div className="flex items-center gap-2.5">
                                            {matchingEvent && onSelectEvent && (
                                                <button 
                                                    onClick={() => onSelectEvent(matchingEvent)}
                                                    className="text-[9px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-0.5 transition-colors uppercase tracking-tight"
                                                >
                                                    <MapPin size={9} /> Locate
                                                </button>
                                            )}
                                            {post.url && (
                                                <a 
                                                    href={post.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-[9px] font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors flex items-center gap-0.5"
                                                >
                                                    Open Link <ExternalLink size={8} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        
                        return (
                            <TelegramPostCard 
                                key={i} 
                                post={post} 
                                matchingEvent={matchingEvent} 
                                onSelectEvent={onSelectEvent} 
                            />
                        );
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
