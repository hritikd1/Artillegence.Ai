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
                <div className="mt-2 aspect-video rounded overflow-hidden border border-[var(--color-border)]">
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
            <div className="mt-2 aspect-video rounded overflow-hidden border border-[var(--color-border)]">
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
        <div className="mt-2 rounded overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)]">
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
        <div className="rounded-lg overflow-hidden bg-[var(--color-card)] relative" style={{ minHeight: compact ? '120px' : '180px' }}>
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center text-[var(--color-text-main)] z-10 bg-[var(--color-card)]">
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
        <div className="feed-item-card p-4 bg-white dark:bg-[var(--color-card)] border border-slate-200 dark:border-[var(--color-border)] rounded-xl transition-shadow duration-150 flex flex-col gap-3 shadow-sm hover:shadow-md">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse"></span>
                    <span className="text-xs md:text-sm font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider">{slug}</span>
                </div>
                <span className="text-xs md:text-sm text-slate-500 dark:text-[var(--color-text-main)] opacity-85 font-mono font-semibold">
                    {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            
            {displayTitle && (
                <h4 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-[var(--color-text-main)] leading-snug tracking-tight">
                    {displayTitle}
                </h4>
            )}
            
            <p className="text-sm md:text-base text-slate-800 dark:text-slate-100 font-medium leading-relaxed font-sans whitespace-pre-wrap select-text break-words">
                {post.snippet || post.summary || 'No intelligence text preview available.'}
            </p>
            
            {post.image && (
                <div className="mt-1 rounded-lg overflow-hidden max-h-56 bg-slate-100 dark:bg-[var(--color-card)] flex items-center justify-center border border-slate-200 dark:border-[var(--color-border)]">
                    <img 
                        src={post.image} 
                        alt="" 
                        loading="lazy"
                        className="max-h-56 object-contain w-full" 
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                    />
                </div>
            )}
            
            <div className="flex items-center justify-between gap-2 mt-1 pt-2.5 border-t border-slate-100 dark:border-[var(--color-border)]">
                <button 
                    onClick={() => (window as any).triggerTacticalAdvice(post.title || `Intel from ${slug}`, post.snippet || post.summary || '')}
                    className="text-xs md:text-sm font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 flex items-center gap-1 transition-colors uppercase tracking-tight cursor-pointer"
                >
                    ✨ Analyze Impact
                </button>
                <div className="flex items-center gap-3">
                    {matchingEvent && onSelectEvent && (
                        <button 
                            onClick={() => onSelectEvent(matchingEvent)}
                            className="text-xs md:text-sm font-bold text-amber-600 dark:text-amber-500 hover:text-amber-700 flex items-center gap-1 transition-colors uppercase tracking-tight cursor-pointer"
                        >
                            <MapPin size={13} /> Locate
                        </button>
                    )}
                    <button 
                        onClick={() => setShowEmbed(!showEmbed)}
                        className="text-xs md:text-sm font-bold text-slate-600 dark:text-[var(--color-text-main)] hover:text-slate-900 uppercase transition-colors cursor-pointer"
                    >
                        {showEmbed ? 'Hide Embed' : 'Show Embed'}
                    </button>
                    {post.url && (
                        <a 
                            href={post.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs md:text-sm font-bold text-slate-600 dark:text-[var(--color-text-main)] hover:text-slate-900 uppercase transition-colors flex items-center gap-1"
                        >
                            Open Link <ExternalLink size={12} />
                        </a>
                    )}
                </div>
            </div>
            
            {showEmbed && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[var(--color-border)]">
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
        <div className="glass-panel p-5 h-full flex flex-col bg-white dark:bg-[var(--color-card)]" style={{ maxHeight: '680px' }}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-sky-500/10 rounded-lg border border-sky-500/20">
                        <MessageCircle size={18} className="text-sky-500" />
                    </div>
                    <div>
                        <h3 className="text-base md:text-lg font-black text-slate-900 dark:text-[var(--color-text-main)] tracking-wider uppercase">Global Intel Feed</h3>
                        <p className="text-xs md:text-sm text-slate-500 dark:text-[var(--color-text-main)] opacity-85 font-medium">Real-time dispatches & web monitoring</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse"></span>
                    <span className="text-xs md:text-sm font-bold text-sky-600 dark:text-[var(--color-text-main)]">LIVE</span>
                </div>
            </div>

            <div className="bg-white dark:bg-[var(--color-card)] border border-slate-200 dark:border-[var(--color-border)] rounded-xl p-4 mb-4 shadow-sm">
                <div className="text-xs md:text-sm text-slate-800 dark:text-[var(--color-text-main)] tracking-wider font-bold mb-2.5 uppercase flex items-center gap-2">
                    <ExternalLink size={14} className="text-sky-600 dark:text-neonBlue" /> Add New Source to Monitor
                </div>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Telegram link or Website URL..."
                        className="flex-1 bg-slate-50 dark:bg-[var(--color-card)] border border-slate-200 dark:border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm md:text-base text-slate-900 dark:text-[var(--color-text-main)] focus:outline-none focus:border-sky-500 dark:focus:border-neonBlue transition-colors"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleAddSource(e.currentTarget.value);
                                e.currentTarget.value = '';
                            }
                        }}
                    />
                    <button 
                        className="px-5 py-2.5 bg-sky-600/15 hover:bg-sky-600/25 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-xs md:text-sm font-bold rounded-lg transition-all disabled:opacity-50 cursor-pointer"
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
                <p className="text-xs md:text-sm text-slate-500 dark:text-[var(--color-text-main)] opacity-75 mt-2 italic">Scrapes latest news periodically for map plotting & feed</p>
            </div>

            <div 
                className="flex-1 overflow-y-auto space-y-3.5 scrollbar-thin pr-1.5"
                style={{ 
                    overscrollBehavior: 'contain', 
                    WebkitOverflowScrolling: 'touch',
                    willChange: 'scroll-position',
                    transform: 'translateZ(0)'
                }}
            >
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
                                <div key={`ws-${i}`} className="feed-item-card p-4 bg-white dark:bg-[var(--color-card)] border border-indigo-200 dark:border-indigo-500/25 rounded-xl flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs md:text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Web Monitoring Update</span>
                                        <span className="text-xs md:text-sm text-slate-500 dark:text-[var(--color-text-main)] opacity-85 font-mono font-semibold">{new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <h4 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-[var(--color-text-main)] leading-snug">{post.title}</h4>
                                    <p className="text-sm md:text-base text-slate-800 dark:text-slate-100 font-medium leading-relaxed font-sans">{post.summary}</p>
                                    
                                    <div className="flex items-center justify-between gap-2 mt-1 pt-2.5 border-t border-slate-100 dark:border-[var(--color-border)]">
                                        <button 
                                            onClick={() => (window as any).triggerTacticalAdvice(post.title, post.summary)}
                                            className="text-xs md:text-sm font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 flex items-center gap-1 transition-colors uppercase tracking-tight cursor-pointer"
                                        >
                                            ✨ Analyze Impact
                                        </button>
                                        <div className="flex items-center gap-2">
                                            {matchingEvent && onSelectEvent && (
                                                <button 
                                                    onClick={() => onSelectEvent(matchingEvent)}
                                                    className="text-xs md:text-sm font-bold text-amber-600 dark:text-amber-500 hover:text-amber-700 flex items-center gap-1 transition-colors uppercase tracking-tight cursor-pointer"
                                                >
                                                    <MapPin size={13} /> Locate
                                                </button>
                                            )}
                                            {post.url && (
                                                <a 
                                                    href={post.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-xs md:text-sm font-bold text-slate-600 dark:text-[var(--color-text-main)] hover:text-slate-900 uppercase transition-colors flex items-center gap-1"
                                                >
                                                    Open Link <ExternalLink size={12} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        if (post.agent === 'reputable_news') {
                            return (
                                <div key={`rn-${i}`} className="feed-item-card p-4 bg-white dark:bg-[var(--color-card)] border border-emerald-200 dark:border-emerald-500/25 rounded-xl flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                            <span className="text-xs md:text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{post.source || 'Reputable News'}</span>
                                        </div>
                                        <span className="text-xs md:text-sm text-slate-500 dark:text-[var(--color-text-main)] opacity-85 font-mono font-semibold">
                                            {post.timestamp ? new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                    </div>
                                    <h4 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-[var(--color-text-main)] leading-snug tracking-tight">{post.title}</h4>
                                    {post.snippet && (
                                        <p className="text-sm md:text-base text-slate-800 dark:text-slate-100 font-medium leading-relaxed font-sans select-text break-words line-clamp-3">
                                            {post.snippet}
                                        </p>
                                    )}
                                    {post.video ? (
                                        renderNewsVideo(post.video)
                                    ) : post.image ? (
                                        <div className="mt-1 rounded-lg overflow-hidden max-h-56 bg-slate-100 dark:bg-[var(--color-card)] flex items-center justify-center border border-slate-200 dark:border-[var(--color-border)]">
                                            <img 
                                                src={post.image} 
                                                alt="" 
                                                loading="lazy"
                                                className="max-h-56 object-cover w-full" 
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                                            />
                                        </div>
                                    ) : null}
                                    <div className="flex items-center justify-between gap-2 mt-1 pt-2.5 border-t border-slate-100 dark:border-[var(--color-border)]">
                                        <button 
                                            onClick={() => (window as any).triggerTacticalAdvice(post.title, post.snippet || post.summary || '')}
                                            className="text-xs md:text-sm font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 flex items-center gap-1 transition-colors uppercase tracking-tight cursor-pointer"
                                        >
                                            ✨ Analyze Impact
                                        </button>
                                        <div className="flex items-center gap-3">
                                            {matchingEvent && onSelectEvent && (
                                                <button 
                                                    onClick={() => onSelectEvent(matchingEvent)}
                                                    className="text-xs md:text-sm font-bold text-amber-600 dark:text-amber-500 hover:text-amber-700 flex items-center gap-1 transition-colors uppercase tracking-tight cursor-pointer"
                                                >
                                                    <MapPin size={13} /> Locate
                                                </button>
                                            )}
                                            {post.url && (
                                                <a 
                                                    href={post.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-xs md:text-sm font-bold text-slate-600 dark:text-[var(--color-text-main)] hover:text-slate-900 uppercase transition-colors flex items-center gap-1"
                                                >
                                                    Open Link <ExternalLink size={12} />
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
                    <div className="flex flex-col items-center justify-center h-full opacity-50 py-12">
                        <Radio size={36} className="text-slate-400 mb-2 animate-pulse" />
                        <p className="text-xs md:text-sm font-bold uppercase tracking-widest text-slate-700 dark:text-[var(--color-text-main)]">Scanning frequency...</p>
                    </div>
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[var(--color-border)] flex items-center justify-between">
                <span className="text-xs md:text-sm text-slate-700 dark:text-[var(--color-text-main)] opacity-85 font-semibold">
                    {validPosts.length > 0 ? `${validPosts.length} live posts inside target box` : 'Connecting...'}
                </span>
                <div className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${validPosts.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></div>
                    <span className={`text-xs md:text-sm font-bold ${validPosts.length > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500'}`}>
                        {validPosts.length > 0 ? 'LIVE' : 'SYNCING'}
                    </span>
                </div>
            </div>
        </div>
    );
}
