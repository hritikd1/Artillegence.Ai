import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, ExternalLink, Clock, Plus, X, Search, Star } from 'lucide-react';
import { TelegramEmbed } from './TelegramFeed';
import { apiPost } from './api';

// Fix Leaflet's default icon path issues in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom radar pulse icon
const createPulseIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-pulse-icon',
        html: `<div style="
      width: 16px; 
      height: 16px; 
      background-color: ${color}; 
      border-radius: 50%;
      box-shadow: 0 0 0 0 rgba(${color}, 0.7);
      animation: pulse 1.5s infinite;
    "></div>
    <style>
      @keyframes pulse {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 ${color}80; }
        70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(0,0,0,0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0,0,0,0); }
      }
    </style>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });
};

// Star icon for user custom items
const createStarIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-star-icon',
        html: `<div style="
      width: 20px; 
      height: 20px; 
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      filter: drop-shadow(0 0 6px ${color});
      animation: pulse-star 2s infinite;
    ">⭐</div>
    <style>
      @keyframes pulse-star {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.3); }
      }
    </style>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });
};

interface GeoEvent {
    id: string;
    lat: number;
    lng: number;
    city: string;
    country: string;
    headline: string;
    summary: string;
    source: string;
    url: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    timestamp: string;
    telegram_post_id?: string;
    category?: string;
    image_base64?: string;
    isCustom?: boolean;
}

interface EarthMapProps {
    events: GeoEvent[];
    onAddCustomEvent?: (event: GeoEvent) => void;
}

// Helper: fly to a filtered category's first event
function FlyToCategory({ targetEvent, markerRefs }: { targetEvent: GeoEvent | null, markerRefs: React.MutableRefObject<{ [key: string]: L.Marker }> }) {
    const map = useMap();
    const prevTarget = useRef<string | null>(null);

    useEffect(() => {
        if (!targetEvent || targetEvent.id === prevTarget.current) return;
        prevTarget.current = targetEvent.id;
        map.flyTo([targetEvent.lat, targetEvent.lng], 7, { animate: true, duration: 2 });
        setTimeout(() => {
            const marker = markerRefs.current[targetEvent.id];
            if (marker) marker.openPopup();
        }, 2100);
    }, [targetEvent, map, markerRefs]);

    return null;
}

// Helper component to auto-fly to the latest event and cycle when idle
function MapAutoPanner({ events, markerRefs, isPaused }: { events: GeoEvent[], markerRefs: React.MutableRefObject<{ [key: string]: L.Marker }>, isPaused: boolean }) {
    const map = useMap();
    const prevEventsLength = useRef(0);
    const currentIndex = useRef(0);
    const isIdle = useRef(true);
    const idleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track user activity on the map
    useEffect(() => {
        const resetIdle = () => {
            isIdle.current = false;
            if (idleTimeout.current) clearTimeout(idleTimeout.current);
            idleTimeout.current = setTimeout(() => {
                isIdle.current = true;
            }, 10000);
        };

        const mapEl = map.getContainer();
        mapEl.addEventListener('mousemove', resetIdle);
        mapEl.addEventListener('mousedown', resetIdle);
        mapEl.addEventListener('touchstart', resetIdle);
        mapEl.addEventListener('wheel', resetIdle);
        resetIdle();

        return () => {
            mapEl.removeEventListener('mousemove', resetIdle);
            mapEl.removeEventListener('mousedown', resetIdle);
            mapEl.removeEventListener('touchstart', resetIdle);
            mapEl.removeEventListener('wheel', resetIdle);
            if (idleTimeout.current) clearTimeout(idleTimeout.current);
        };
    }, [map]);

    // Slideshow logic
    useEffect(() => {
        if (events.length > prevEventsLength.current) {
            const newest = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            currentIndex.current = events.findIndex(e => e.id === newest.id);
            map.flyTo([newest.lat, newest.lng], 7, { animate: true, duration: 2.5 });
            setTimeout(() => {
                const marker = markerRefs.current[newest.id];
                if (marker) marker.openPopup();
            }, 2600);
            prevEventsLength.current = events.length;
        }

        const interval = setInterval(() => {
            if (!isIdle.current || isPaused || events.length === 0) return;
            currentIndex.current = (currentIndex.current + 1) % events.length;
            const targetEvent = events[currentIndex.current];
            map.flyTo([targetEvent.lat, targetEvent.lng], 6, { animate: true, duration: 2.5 });
            setTimeout(() => {
                const marker = markerRefs.current[targetEvent.id];
                if (marker) marker.openPopup();
            }, 2600);
        }, 12000);

        return () => clearInterval(interval);
    }, [events, map, markerRefs]);

    return null;
}

// Known stock exchange locations for custom items
const STOCK_LOCATIONS: Record<string, { lat: number; lng: number; city: string; country: string }> = {
    'nse': { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' },
    'bse': { lat: 18.9322, lng: 72.8347, city: 'Mumbai', country: 'India' },
    'india': { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' },
    'nifty': { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' },
    'sensex': { lat: 18.9322, lng: 72.8347, city: 'Mumbai', country: 'India' },
    'reliance': { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' },
    'tcs': { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' },
    'infosys': { lat: 12.9716, lng: 77.5946, city: 'Bangalore', country: 'India' },
    'wipro': { lat: 12.9716, lng: 77.5946, city: 'Bangalore', country: 'India' },
    'tata': { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' },
    'hdfc': { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' },
    'sbi': { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' },
    'adani': { lat: 23.0225, lng: 72.5714, city: 'Ahmedabad', country: 'India' },
    'itc': { lat: 22.5726, lng: 88.3639, city: 'Kolkata', country: 'India' },
    'nasdaq': { lat: 40.7580, lng: -73.9855, city: 'New York', country: 'USA' },
    'nyse': { lat: 40.7069, lng: -74.0113, city: 'New York', country: 'USA' },
    'dow': { lat: 40.7069, lng: -74.0113, city: 'New York', country: 'USA' },
    's&p': { lat: 40.7069, lng: -74.0113, city: 'New York', country: 'USA' },
    'apple': { lat: 37.3349, lng: -122.0090, city: 'Cupertino', country: 'USA' },
    'tesla': { lat: 30.2672, lng: -97.7431, city: 'Austin', country: 'USA' },
    'google': { lat: 37.4220, lng: -122.0841, city: 'Mountain View', country: 'USA' },
    'microsoft': { lat: 47.6397, lng: -122.1281, city: 'Redmond', country: 'USA' },
    'amazon': { lat: 47.6062, lng: -122.3321, city: 'Seattle', country: 'USA' },
    'oil': { lat: 25.2048, lng: 55.2708, city: 'Dubai', country: 'UAE' },
    'crude': { lat: 25.2048, lng: 55.2708, city: 'Dubai', country: 'UAE' },
    'gold': { lat: 51.5074, lng: -0.1278, city: 'London', country: 'UK' },
    'bitcoin': { lat: 40.7128, lng: -74.0060, city: 'Global (NYC)', country: 'USA' },
    'crypto': { lat: 40.7128, lng: -74.0060, city: 'Global (NYC)', country: 'USA' },
    'china': { lat: 31.2304, lng: 121.4737, city: 'Shanghai', country: 'China' },
    'japan': { lat: 35.6762, lng: 139.6503, city: 'Tokyo', country: 'Japan' },
    'europe': { lat: 50.1109, lng: 8.6821, city: 'Frankfurt', country: 'Germany' },
    'london': { lat: 51.5074, lng: -0.1278, city: 'London', country: 'UK' },
    'defence': { lat: 28.6139, lng: 77.2090, city: 'New Delhi', country: 'India' },
    'defense': { lat: 28.6139, lng: 77.2090, city: 'New Delhi', country: 'India' },
    'pharma': { lat: 17.3850, lng: 78.4867, city: 'Hyderabad', country: 'India' },
    'auto': { lat: 18.5204, lng: 73.8567, city: 'Pune', country: 'India' },
    'ev': { lat: 18.5204, lng: 73.8567, city: 'Pune', country: 'India' },
};

function getLocationForKeyword(keyword: string): { lat: number; lng: number; city: string; country: string } {
    const lower = keyword.toLowerCase();
    for (const [key, loc] of Object.entries(STOCK_LOCATIONS)) {
        if (lower.includes(key)) return loc;
    }
    // Default to Mumbai (NSE) for unrecognized Indian stocks
    return { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' };
}

export default function EarthMap({ events, onAddCustomEvent }: EarthMapProps) {
    const markerRefs = useRef<{ [key: string]: L.Marker }>({});
    const [timeFilter, setTimeFilter] = useState<number | null>(null);
    const [isInteracting, setIsInteracting] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [flyTarget, setFlyTarget] = useState<GeoEvent | null>(null);

    // Custom watchlist state
    const [showAddForm, setShowAddForm] = useState(false);
    const [customInput, setCustomInput] = useState('');
    const [customItems, setCustomItems] = useState<GeoEvent[]>(() => {
        try {
            const saved = localStorage.getItem('artillegence_custom_watchlist');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    // Auto-rerun latest query on mount if it exists
    useEffect(() => {
        const lastQuery = localStorage.getItem('artillegence_last_custom_query');
        if (lastQuery && customItems.length === 0) {
            setCustomInput(lastQuery);
            // Delay slightly to ensure component is ready
            setTimeout(() => {
                const btn = document.getElementById('btn-track-custom');
                if (btn) btn.click();
            }, 1000);
        }
    }, []);

    // Save custom items to localStorage
    useEffect(() => {
        localStorage.setItem('artillegence_custom_watchlist', JSON.stringify(customItems));
    }, [customItems]);

    // Merge real events + custom watchlist items
    const allEvents = useMemo(() => [...events, ...customItems], [events, customItems]);

    const categories = useMemo(() => {
        const cats = Array.from(new Set(allEvents.map(e => e.category || 'Geopolitics & Telegram')));
        return cats;
    }, [allEvents]);

    const { minTime, maxTime } = useMemo(() => {
        if (!allEvents.length) return { minTime: 0, maxTime: 0 };
        const times = allEvents.map(e => new Date(e.timestamp).getTime());
        return {
            minTime: Math.min(...times),
            maxTime: Math.max(...times)
        };
    }, [allEvents]);

    useEffect(() => {
        if (timeFilter === null) return;
        if (maxTime > 0 && timeFilter >= maxTime - 120000) {
            setTimeFilter(maxTime);
        }
    }, [maxTime, timeFilter]);

    const displayEvents = useMemo(() => {
        let evs = allEvents;
        if (activeCategory) {
            evs = evs.filter(e => (e.category || 'Geopolitics & Telegram') === activeCategory);
        }
        if (timeFilter === null || timeFilter >= maxTime) return evs;
        return evs.filter(ev => new Date(ev.timestamp).getTime() <= timeFilter);
    }, [allEvents, timeFilter, maxTime, activeCategory]);

    // When user clicks a category → fly to first event of that category
    const handleCategoryClick = useCallback((category: string | null) => {
        setActiveCategory(category);
        // Find first event for this category and fly to it
        const targetEvents = category
            ? allEvents.filter(e => (e.category || 'Geopolitics & Telegram') === category)
            : allEvents;
        if (targetEvents.length > 0) {
            const newest = [...targetEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            setFlyTarget({ ...newest }); // spread to create new ref and trigger effect
        }
    }, [allEvents]);

    const [isSearching, setIsSearching] = useState(false);

    // Add custom watchlist item
    const handleAddCustom = useCallback(async () => {
        if (!customInput.trim() || isSearching) return;
        setIsSearching(true);
        const query = customInput;
        localStorage.setItem('artillegence_last_custom_query', query);
        const loc = getLocationForKeyword(query);
        // Slight random offset so multiple items at same exchange don't overlap
        const offset = () => (Math.random() - 0.5) * 0.8;
        
        let headline = query;
        let summary = `📌 Custom watchlist item: "${query}"\n\nAdded by you to track on the intelligence map.`;
        let sourceUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' stock news')}`;
        
        try {
            const data = await apiPost<any>('/api/custom_search', { query });
            if (data.thesis) {
                headline = `🔍 ${query.toUpperCase()}`;
                summary = data.thesis;
                if (data.news_sources && data.news_sources.length > 0) {
                    sourceUrl = data.news_sources[0].url;
                }
                if (data.lat != null && data.lng != null) {
                    loc.lat = data.lat;
                    loc.lng = data.lng;
                    loc.city = data.city || '';
                    loc.country = data.country || '';
                }
            }
        } catch(e) {
            console.error("Custom search failed", e);
        }

        const newItem: GeoEvent = {
            id: `custom-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            lat: loc.lat + offset(),
            lng: loc.lng + offset(),
            city: loc.city,
            country: loc.country,
            headline: headline,
            summary: summary,
            source: 'Artillegence AI Custom Track',
            url: sourceUrl,
            severity: 'high',
            timestamp: new Date().toISOString(),
            category: '⭐ User Custom',
            isCustom: true,
        };
        
        setCustomItems(prev => [...prev, newItem]);
        if (onAddCustomEvent) onAddCustomEvent(newItem);
        setCustomInput('');
        setShowAddForm(false);
        setIsSearching(false);

        // Fly to the new custom item
        setTimeout(() => setFlyTarget(newItem), 300);
    }, [customInput, onAddCustomEvent, isSearching]);

    const handleRemoveCustom = useCallback((id: string) => {
        setCustomItems(prev => prev.filter(item => item.id !== id));
    }, []);

    const [activeAnalysis, setActiveAnalysis] = useState<{ [key: string]: { loading: boolean, text: string | null } }>({});

    const handleAnalyze = async (ev: GeoEvent) => {
        setActiveAnalysis(prev => ({ ...prev, [ev.id]: { loading: true, text: null } }));
        try {
            const data = await apiPost<any>('/api/analyze_impact', { event_text: ev.summary || ev.headline });
            setActiveAnalysis(prev => ({
                ...prev,
                [ev.id]: { loading: false, text: data.thesis || "Analysis failed." }
            }));
        } catch (error) {
            setActiveAnalysis(prev => ({
                ...prev,
                [ev.id]: { loading: false, text: "Network error requesting analysis." }
            }));
        }
    };

    const getPointColor = (severity: string) => {
        switch (severity) {
            case 'critical': return '#ef4444';
            case 'high': return '#f97316';
            case 'medium': return '#eab308';
            case 'low': return '#38bdf8';
            default: return '#38bdf8';
        }
    };

    return (
        <div className="relative w-full rounded-lg overflow-hidden border border-slate-800/80 shadow-2xl" style={{ height: '500px' }}>
            <MapContainer
                center={[20, 78]}
                zoom={4}
                className="w-full h-full"
                style={{ background: '#0a0a0a' }}
                zoomControl={false}
            >
                {/* ESRI World Imagery for Google Earth style satellite view */}
                <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution='&copy; ESRI'
                    maxZoom={18}
                />

                {/* Optional dark label overlay so we can see cities/borders */}
                <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                    attribution=""
                    maxZoom={18}
                />

                <MapAutoPanner events={displayEvents} markerRefs={markerRefs} isPaused={isInteracting} />
                <FlyToCategory targetEvent={flyTarget} markerRefs={markerRefs} />

                {displayEvents.length > 1 && (
                    <Polyline
                        positions={displayEvents.map(ev => [ev.lat, ev.lng] as [number, number])}
                        color="#38bdf8"
                        weight={1.5}
                        opacity={0.4}
                        dashArray="5, 10"
                    />
                )}

                {displayEvents.map((ev) => (
                    <Marker
                        key={ev.id}
                        position={[ev.lat, ev.lng]}
                        icon={ev.isCustom ? createStarIcon('#fbbf24') : createPulseIcon(getPointColor(ev.severity))}
                        ref={(r) => { if (r) markerRefs.current[ev.id] = r; }}
                    >
                        <Popup className="glass-popup pb-2" autoPan={true} autoPanPaddingTopLeft={[10, 88]} autoPanPaddingBottomRight={[10, 70]}>
                            <div className={`bg-slate-900/95 border p-4 rounded-lg shadow-xl shadow-black/50 w-[340px] -m-3 max-h-[320px] overflow-y-auto scrollbar-thin ${ev.isCustom ? 'border-amber-500/50' : 'border-slate-700'}`}>
                                <div className="flex items-center gap-2 mb-2 justify-between">
                                    <div className="flex items-center gap-2">
                                        {ev.isCustom ? (
                                            <Star size={10} className="text-amber-400 fill-amber-400" />
                                        ) : (
                                            <div className={`w-2 h-2 rounded-full ${ev.severity === 'critical' ? 'bg-red-500' :
                                                ev.severity === 'high' ? 'bg-orange-500' : 'bg-sky-400'
                                                }`}></div>
                                        )}
                                        <span className="text-[10px] font-bold text-sky-400 tracking-widest uppercase">
                                            {ev.city}{ev.country ? `, ${ev.country}` : ''}
                                        </span>
                                        <span className={`text-[8px] px-1 py-0.5 rounded border uppercase tracking-widest ${ev.isCustom ? 'bg-amber-900/50 text-amber-300 border-amber-700/50' : 'bg-sky-900/50 text-sky-300 border-sky-700/50'}`}>
                                            {ev.category || 'Geopolitics'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {ev.isCustom && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRemoveCustom(ev.id); }}
                                                className="text-[9px] text-red-400 hover:text-red-300 border border-red-800/50 px-1.5 py-0.5 rounded hover:bg-red-900/30"
                                                title="Remove from watchlist"
                                            >
                                                <X size={8} />
                                            </button>
                                        )}
                                        {!activeAnalysis[ev.id] && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleAnalyze(ev); }}
                                                className="ml-auto text-xs bg-indigo-600/80 hover:bg-indigo-500 text-white px-3 py-1 rounded shadow cursor-pointer transition-all border border-indigo-400/50 flex flex-items-center gap-1 font-bold tracking-wide">
                                                🌟 ANALYZE IMPACT
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {activeAnalysis[ev.id] ? (
                                    <div className="mt-3 bg-slate-800/50 p-3 rounded border border-indigo-500/30">
                                        {activeAnalysis[ev.id].loading ? (
                                            <div className="flex flex-col items-center justify-center py-4 space-y-2">
                                                <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                                                <span className="text-xs text-indigo-300 font-mono animate-pulse tracking-widest uppercase">Mistral AI Modeling...</span>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                                                {activeAnalysis[ev.id].text?.split('**').map((chunk, i) =>
                                                    i % 2 === 1 ? <span key={i} className="font-bold text-indigo-300">{chunk}</span> : chunk
                                                )}
                                            </div>
                                        )}
                                        <button onClick={() => setActiveAnalysis(prev => { const n = { ...prev }; delete n[ev.id]; return n; })} className="mt-3 w-full text-center text-[10px] text-slate-500 hover:text-slate-300 border border-slate-700 rounded py-1">RETURN TO SOURCE</button>
                                    </div>
                                ) : (
                                    <>
                                        {ev.image_base64 && (
                                            <div className="mt-3 mb-2 rounded overflow-hidden border border-slate-700/60 shadow-lg">
                                                <div className="text-[9px] font-bold text-slate-400 bg-slate-800 px-2 py-1 flex items-center justify-between">
                                                    <span>VISUAL WEB RESEARCH </span>
                                                    <span className="text-violet-400">GROQ VISION</span>
                                                </div>
                                                <img src={`data:image/jpeg;base64,${ev.image_base64}`} alt="Scraped View" className="w-full h-auto opacity-90 hover:opacity-100 transition-opacity" />
                                            </div>
                                        )}
                                        {ev.telegram_post_id ? (
                                            <div className="mt-2" style={{ maxHeight: "220px", overflowY: "auto", overflowX: "hidden", borderRadius: "8px", border: "1px solid rgba(56,189,248,0.15)" }}>
                                                <TelegramEmbed channelSlug={typeof ev.source === "string" ? ev.source.replace("Telegram: ", "") : "CIG_telegram"} postId={ev.telegram_post_id} compact />
                                            </div>
                                        ) : (
                                            <>
                                                <h4 className="text-sm font-bold text-white leading-tight mb-2 pb-2 border-b border-slate-700/50">{ev.headline}</h4>
                                                <p className="text-xs text-slate-300 leading-relaxed mb-3 whitespace-pre-wrap">
                                                    {ev.summary?.split('**').map((chunk, i) =>
                                                        i % 2 === 1 ? <span key={i} className="font-bold text-sky-400">{chunk}</span> : chunk
                                                    )}
                                                </p>
                                            </>
                                        )}
                                    </>
                                )}

                                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                                    <a href={ev.url} target="_blank" rel="noopener noreferrer"
                                        className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1">
                                        SOURCE <ExternalLink size={10} />
                                    </a>
                                    <span className="text-[9px] text-slate-500">
                                        {new Date(ev.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Overlay: Event Count, Categories + Custom Watchlist */}
            <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 px-3 py-1.5 rounded flex flex-col gap-2 z-[1000] pointer-events-auto transition-all shadow-xl" style={{ maxWidth: '380px' }}>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <MapPin size={12} className="text-sky-400" />
                        <span className="text-[10px] font-bold text-slate-200 tracking-wider">
                            {displayEvents.length} EVENTS GEO-TAGGED
                        </span>
                    </div>
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className={`flex items-center gap-1 text-[9px] font-bold tracking-wider px-2 py-1 rounded transition-all ${showAddForm
                            ? 'bg-red-600/50 text-red-200 border border-red-500/40 hover:bg-red-600/70'
                            : 'bg-amber-600/50 text-amber-200 border border-amber-500/40 hover:bg-amber-600/70'
                            }`}
                    >
                        {showAddForm ? <X size={10} /> : <Plus size={10} />}
                        {showAddForm ? 'CLOSE' : 'ADD CUSTOM'}
                    </button>
                </div>

                {/* Add Custom Watchlist Input */}
                {showAddForm && (
                    <div className="border-t border-slate-700/50 pt-2 animate-fade-in">
                        <div className="flex gap-1.5">
                            <input
                                type="text"
                                value={customInput}
                                onChange={(e) => setCustomInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                                placeholder="e.g. Reliance, Gold, Tesla, Crude Oil..."
                                className="flex-1 bg-slate-800/80 border border-slate-600 rounded px-2 py-1.5 text-[10px] text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
                                autoFocus
                            />
                            <button
                                id="btn-track-custom"
                                onClick={handleAddCustom}
                                disabled={!customInput.trim() || isSearching}
                                className="px-2 py-1.5 bg-amber-600/80 hover:bg-amber-600 disabled:opacity-40 rounded text-white text-[9px] font-bold border border-amber-500/50 flex items-center gap-1 whitespace-nowrap min-w-[70px] justify-center"
                            >
                                {isSearching ? (
                                    <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Search size={9} />
                                )}
                                {isSearching ? 'SCRAPING...' : 'TRACK'}
                            </button>
                        </div>
                        {customItems.length > 0 && (
                            <div className="mt-2 space-y-1 max-h-[100px] overflow-y-auto scrollbar-thin">
                                {customItems.map(item => (
                                    <div key={item.id} className="flex items-center justify-between bg-amber-900/20 border border-amber-800/30 rounded px-2 py-1">
                                        <span className="text-[9px] text-amber-300 font-medium">⭐ {item.headline}</span>
                                        <button
                                            onClick={() => handleRemoveCustom(item.id)}
                                            className="text-red-400 hover:text-red-300 ml-2"
                                        >
                                            <X size={9} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Category Filters */}
                {categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 border-t border-slate-700/50 pt-2">
                        <button
                            onClick={() => handleCategoryClick(null)}
                            className={`text-[9px] font-bold tracking-widest uppercase px-2 py-1 rounded transition-colors ${activeCategory === null ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            ALL
                        </button>
                        {categories.map(c => (
                            <button
                                key={c}
                                onClick={() => handleCategoryClick(c)}
                                className={`text-[9px] font-bold tracking-widest uppercase px-2 py-1 rounded transition-colors ${activeCategory === c
                                    ? (c === '⭐ User Custom' ? 'bg-amber-600 text-white' : 'bg-sky-600 text-white')
                                    : (c === '⭐ User Custom' ? 'bg-amber-900/40 text-amber-400 hover:bg-amber-800/50 border border-amber-700/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')
                                    }`}>
                                {c}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Overlay: Timeline Playback Slider */}
            {
                allEvents.length > 1 && minTime < maxTime && (
                    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/50 p-3 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-[1000] flex flex-col gap-2 transition-all hover:bg-slate-900/95 outline outline-1 outline-slate-800 pointer-events-auto">
                        <div className="flex justify-between items-center px-1">
                            <div className="flex items-center gap-2 text-sky-400">
                                <Clock size={14} className={isInteracting ? "text-sky-300" : ""} />
                                <span className="text-[10px] font-bold tracking-widest uppercase">Time Machine Playback</span>
                            </div>
                            <span className="text-[10px] text-sky-100 font-mono bg-slate-800/80 px-2 py-1 rounded border border-slate-700 shadow-inner">
                                {timeFilter === null || timeFilter >= maxTime ? 'LIVE VIEW' : new Date(timeFilter).toLocaleString()}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-slate-500 font-mono">{new Date(minTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <input
                                type="range"
                                min={minTime}
                                max={maxTime}
                                step={1000}
                                value={timeFilter !== null ? timeFilter : maxTime}
                                onChange={(e) => setTimeFilter(Number(e.target.value))}
                                onMouseDown={() => setIsInteracting(true)}
                                onMouseUp={() => setIsInteracting(false)}
                                onTouchStart={() => setIsInteracting(true)}
                                onTouchEnd={() => setIsInteracting(false)}
                                className="flex-1 h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer hover:bg-slate-600 transition-colors [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                            />
                            <span className="text-[10px] text-sky-500 font-mono font-bold tracking-wider">LATEST</span>
                        </div>
                    </div>
                )
            }

            {/* Overwrite leaflet popup styles purely in CSS */}
            <style>{`
                .leaflet-popup-content-wrapper {
                    background: transparent;
                    box-shadow: none;
                    padding: 0;
                }
                .leaflet-popup-tip-container {
                    display: none;
                }
                .leaflet-container a.leaflet-popup-close-button {
                    color: #fff;
                    top: 8px;
                    right: 8px;
                    z-index: 10;
                }
            `}</style>
        </div >
    );
}
