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

/* Telegram Feed Section */
export default function TelegramFeed({ data }: { data?: any }) {
    const newsItems = data?.news_items || [];
    const validPosts = newsItems
        .filter((item: any) => item.telegram_post_id)
        .slice(0, 15); // display up to 15 latest posts to prevent UI stuttering

    return (
        <div className="glass-panel p-4 h-full flex flex-col" style={{ maxHeight: '520px' }}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <MessageCircle size={16} className="text-sky-400" />
                    <h3 className="text-xs font-bold text-white tracking-wider">INTEL FEED</h3>
                </div>
                <div className="flex items-center gap-2">
                    <a href="https://t.me/idfofficial" target="_blank" rel="noopener noreferrer" className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1">IDF <ExternalLink size={8} /></a>
                    <span className="text-slate-600">|</span>
                    <a href="https://t.me/rnintel" target="_blank" rel="noopener noreferrer" className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1">RNI <ExternalLink size={8} /></a>
                    <span className="text-slate-600">|</span>
                    <a href="https://t.me/QudsNen" target="_blank" rel="noopener noreferrer" className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1">Quds <ExternalLink size={8} /></a>
                    <span className="text-slate-600">|</span>
                    <a href="https://t.me/wfwitness" target="_blank" rel="noopener noreferrer" className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1">WFW <ExternalLink size={8} /></a>
                    <span className="text-slate-600">|</span>
                    <a href="https://t.me/CIG_telegram" target="_blank" rel="noopener noreferrer" className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1">CIG <ExternalLink size={8} /></a>
                </div>
            </div>

            <div className="text-[9px] text-slate-500 tracking-widest font-bold mb-2">RECENT DISPATCHES</div>

            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin pr-1">
                {validPosts.length > 0 ? (
                    validPosts.map((post: any, i: number) => {
                        const slug = typeof post.source === 'string' ? post.source.replace('Telegram: ', '') : 'CIG_telegram';
                        return (
                            <TelegramEmbed
                                key={post.telegram_post_id + '-' + i}
                                channelSlug={slug}
                                postId={post.telegram_post_id}
                            />
                        );
                    })
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 border border-slate-800/50 rounded-lg bg-slate-900/40 p-6 text-center">
                        <Radio className="animate-pulse mb-3" size={24} />
                        <span className="text-sm font-bold text-slate-400">Awaiting Transmissions</span>
                        <span className="text-xs mt-1">Stand by for live intelligence feed...</span>
                    </div>
                )}
            </div>

            <div className="mt-2 pt-3 border-t border-slate-800/50 flex items-center justify-between">
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
