import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, ExternalLink, Clock, Plus, X, Search, Star } from 'lucide-react';
import { TelegramEmbed, renderNewsVideo } from './TelegramFeed';
import { apiPost } from './api';

// Fix Leaflet's default icon path issues in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom radar pulse icon with concentric rings from reference image 3
const createPulseIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-pulse-icon',
        html: `
            <div class="relative flex items-center justify-center animate-pulse" style="transform: translate(-8px, -8px); width: 16px; height: 16px;">
                <!-- Center dot with white core -->
                <div class="absolute w-3.5 h-3.5 rounded-full flex items-center justify-center z-20 shadow-[0_0_12px_${color}]" style="background-color: ${color};">
                    <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
                </div>
                <!-- Pulsing concentric halos -->
                <div class="absolute w-6 h-6 rounded-full animate-ping opacity-30" style="border: 2px solid ${color}; animation-duration: 2s; z-index: 10;"></div>
                <div class="absolute w-10 h-10 rounded-full animate-ping opacity-15" style="border: 1.5px solid ${color}; animation-duration: 3s; animation-delay: 0.5s; z-index: 9;"></div>
            </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });
};

// Custom regional zoning glow icon using native radial gradients
const createGlowIcon = (color: string, severity: string) => {
    const size = severity === 'critical' || severity === 'high' ? 100 : severity === 'medium' ? 70 : 50;
    const half = size / 2;
    const opacityInner = severity === 'critical' || severity === 'high' ? '0a' : severity === 'medium' ? '06' : '04';
    const opacityMid = severity === 'critical' || severity === 'high' ? '05' : severity === 'medium' ? '03' : '02';
    const opacityOuter = severity === 'critical' || severity === 'high' ? '01' : severity === 'medium' ? '01' : '00';
    return L.divIcon({
        className: 'zoning-glow-marker',
        html: `
            <div style="
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                background: radial-gradient(circle, ${color}${opacityInner} 0%, ${color}${opacityMid} 30%, ${color}${opacityOuter} 60%, transparent 75%);
                transform: translate(-${half}px, -${half}px);
                pointer-events: none;
                mix-blend-mode: screen;
                filter: blur(8px);
            "></div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
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
      transform: translate(-10px, -10px);
    ">⭐</div>
    <style>
      @keyframes pulse-star {
        0%, 100% { transform: scale(1) translate(-10px, -10px); }
        50% { transform: scale(1.3) translate(-7.5px, -7.5px); }
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
    image?: string;
    video?: string;
}

interface EarthMapProps {
    events: GeoEvent[];
    onAddCustomEvent?: (event: GeoEvent) => void;
    onSelectEvent?: (event: GeoEvent | null) => void;
    selectedEvent?: GeoEvent | null;
}

// Helper: Check if coordinates are valid numbers and within correct ranges
export function isValidCoordinate(lat: any, lng: any): boolean {
    const l = parseFloat(lat);
    const n = parseFloat(lng);
    return !isNaN(l) && !isNaN(n) && l >= -90 && l <= 90 && n >= -180 && n <= 180;
}

// Helper: fly to a filtered category's first event
function FlyToCategory({ targetEvent, markerRefs }: { targetEvent: GeoEvent | null, markerRefs: React.MutableRefObject<{ [key: string]: L.Marker }> }) {
    const map = useMap();
    const prevTarget = useRef<string | null>(null);

    useEffect(() => {
        if (!targetEvent || targetEvent.id === prevTarget.current || !isValidCoordinate(targetEvent.lat, targetEvent.lng)) return;
        prevTarget.current = targetEvent.id;

        const marker = markerRefs.current[targetEvent.id];
        if (marker && marker.isPopupOpen()) return;

        const currentZoom = map.getZoom();
        map.flyTo([targetEvent.lat, targetEvent.lng], Math.max(currentZoom, 6), { animate: true, duration: 2 });
        const timer = setTimeout(() => {
            const m = markerRefs.current[targetEvent.id];
            if (m) m.openPopup();
        }, 2100);
        return () => clearTimeout(timer);
    }, [targetEvent, map, markerRefs]);

    return null;
}

// Helper component to auto-fly to the latest event and cycle when idle
function MapAutoPanner({ events, markerRefs, isPaused, totalCount }: { events: GeoEvent[], markerRefs: React.MutableRefObject<{ [key: string]: L.Marker }>, isPaused: boolean, totalCount: number }) {
    const map = useMap();
    const prevTotalCount = useRef(0);
    const currentIndex = useRef(0);
    const isIdle = useRef(true);
    const isPopupOpen = useRef(false);
    const idleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoPanTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        const handlePopupOpen = () => { isPopupOpen.current = true; };
        const handlePopupClose = () => { isPopupOpen.current = false; resetIdle(); };
        map.on('popupopen', handlePopupOpen);
        map.on('popupclose', handlePopupClose);

        return () => {
            mapEl.removeEventListener('mousemove', resetIdle);
            mapEl.removeEventListener('mousedown', resetIdle);
            mapEl.removeEventListener('touchstart', resetIdle);
            mapEl.removeEventListener('wheel', resetIdle);
            map.off('popupopen', handlePopupOpen);
            map.off('popupclose', handlePopupClose);
            if (idleTimeout.current) clearTimeout(idleTimeout.current);
        };
    }, [map]);

    // Reset idle whenever events change (e.g. category switch or new event)
    useEffect(() => {
        isIdle.current = false;
        if (idleTimeout.current) clearTimeout(idleTimeout.current);
        idleTimeout.current = setTimeout(() => {
            isIdle.current = true;
        }, 12000); // 12 seconds of quiet time after any event update
    }, [events]);

    // Handle real-time new event arrival focus
    useEffect(() => {
        if (prevTotalCount.current > 0 && totalCount > prevTotalCount.current) {
            const newest = [...events]
                .filter(e => isValidCoordinate(e.lat, e.lng))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            if (newest) {
                currentIndex.current = events.findIndex(e => e.id === newest.id);
                const currentZoom = map.getZoom();
                map.flyTo([newest.lat, newest.lng], Math.max(currentZoom, 6), { animate: true, duration: 2.5 });

                if (autoPanTimeout.current) clearTimeout(autoPanTimeout.current);
                autoPanTimeout.current = setTimeout(() => {
                    if (isPopupOpen.current) return;
                    const marker = markerRefs.current[newest.id];
                    if (marker) marker.openPopup();
                }, 2600);
            }
        }
        prevTotalCount.current = totalCount;
    }, [totalCount, events, map, markerRefs]);

    // Slideshow logic (only triggers when idle, does NOT run on render/prop changes)
    useEffect(() => {
        const interval = setInterval(() => {
            if (!isIdle.current || isPaused || events.length === 0 || isPopupOpen.current) return;
            currentIndex.current = (currentIndex.current + 1) % events.length;
            const targetEvent = events[currentIndex.current];
            if (targetEvent && isValidCoordinate(targetEvent.lat, targetEvent.lng)) {
                const currentZoom = map.getZoom();
                map.flyTo([targetEvent.lat, targetEvent.lng], Math.max(currentZoom, 5), { animate: true, duration: 2.5 });

                if (autoPanTimeout.current) clearTimeout(autoPanTimeout.current);
                autoPanTimeout.current = setTimeout(() => {
                    if (isPopupOpen.current) return;
                    const marker = markerRefs.current[targetEvent.id];
                    if (marker) marker.openPopup();
                }, 2600);
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [events, map, markerRefs, isPaused]);

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
    return { lat: 19.0760, lng: 72.8777, city: 'Mumbai', country: 'India' };
}

function getEventCategory(e: GeoEvent): string {
    const isCustom = e.isCustom
        || (e.id && (String(e.id).startsWith('custom-') || String(e.id).startsWith('websrc-') || String(e.id).startsWith('webscan-')))
        || e.source === 'User Custom'
        || e.source === 'Artillegence AI Custom Track'
        || (e.source && String(e.source).startsWith('Web:'))
        || (e as any).section === 'user_custom'
        || (e as any).section === 'web_monitoring';

    if (isCustom) {
        return e.category && e.category.startsWith('⭐') ? e.category : '⭐ User Custom';
    }
    return e.category || 'Geopolitics & Telegram';
}

export default function EarthMap({ events, onAddCustomEvent, onSelectEvent, selectedEvent }: EarthMapProps) {
    const markerRefs = useRef<{ [key: string]: L.Marker }>({});

    // Sync flyTarget with external selectedEvent updates
    useEffect(() => {
        if (selectedEvent) {
            setFlyTarget(selectedEvent);
        }
    }, [selectedEvent]);
    const [timeFilter, setTimeFilter] = useState<number | null>(null);
    const [isInteracting, setIsInteracting] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [flyTarget, setFlyTarget] = useState<GeoEvent | null>(null);

    // Dynamic country polygon highlights
    const [geoJsonData, setGeoJsonData] = useState<any>(null);
    useEffect(() => {
        // Fetch world borders GeoJSON (lightweight, ~500kb-2mb)
        fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
            .then(res => {
                if (!res.ok) throw new Error('Primary GeoJSON source failed');
                return res.json();
            })
            .then(data => setGeoJsonData(data))
            .catch(err => {
                console.warn("Primary country borders CDN failed, trying fallback:", err);
                fetch('https://openlayers.org/en/v6.0.1/examples/data/geojson/countries.geojson')
                    .then(res => {
                        if (!res.ok) throw new Error('Secondary GeoJSON source failed');
                        return res.json();
                    })
                    .then(data => setGeoJsonData(data))
                    .catch(e => console.error("All country boundary sources failed", e));
            });
    }, []);

    // Custom watchlist state
    const [showAddForm, setShowAddForm] = useState(false);
    const [customInput, setCustomInput] = useState('');
    const [customItems, setCustomItems] = useState<GeoEvent[]>(() => {
        try {
            const saved = localStorage.getItem('artillegence_custom_watchlist');
            if (saved) {
                const parsed = JSON.parse(saved) as GeoEvent[];
                const cleaned = parsed.filter(item => {
                    const urlStr = String(item.url || '').toLowerCase();
                    const headStr = String(item.headline || '').toLowerCase();
                    const sumStr = String(item.summary || '').toLowerCase();
                    const validCoords = isValidCoordinate(item.lat, item.lng);
                    return validCoords && !urlStr.includes('chartlink') && !headStr.includes('chartlink') && !sumStr.includes('chartlink');
                });
                if (cleaned.length !== parsed.length) {
                    localStorage.setItem('artillegence_custom_watchlist', JSON.stringify(cleaned));
                }
                return cleaned;
            }
            return [];
        } catch { return []; }
    });

    // Auto-rerun latest query on mount if it exists
    useEffect(() => {
        const lastQuery = localStorage.getItem('artillegence_last_custom_query');
        if (lastQuery && lastQuery.toLowerCase().includes('chartlink')) {
            localStorage.removeItem('artillegence_last_custom_query');
            return;
        }
        if (lastQuery && customItems.length === 0) {
            setCustomInput(lastQuery);
            setTimeout(() => {
                const btn = document.getElementById('btn-track-custom');
                if (btn) btn.click();
            }, 1000);
        }
    }, [customItems.length]);

    // Save custom items to localStorage
    useEffect(() => {
        localStorage.setItem('artillegence_custom_watchlist', JSON.stringify(customItems));
    }, [customItems]);

    // Merge real events + custom watchlist items
    const allEvents = useMemo(() => [...events, ...customItems], [events, customItems]);

    const categories = useMemo(() => {
        const cats = Array.from(new Set(allEvents.map(e => getEventCategory(e))));
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
        let evs = [...allEvents]
            .filter(e => isValidCoordinate(e.lat, e.lng))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (activeCategory) {
            evs = evs.filter(e => getEventCategory(e) === activeCategory);
        }
        if (timeFilter !== null && timeFilter < maxTime) {
            evs = evs.filter(ev => new Date(ev.timestamp).getTime() <= timeFilter);
        } else if (timeFilter === null && !activeCategory) {
            // Default live view: show top 20 most recent events to prevent crowding
            evs = evs.slice(0, 20);
        }
        return evs;
    }, [allEvents, timeFilter, maxTime, activeCategory]);

    // Auto-propagate default selection when events change
    const prevSelectedId = useRef<string | null>(null);
    useEffect(() => {
        if (displayEvents.length > 0) {
            const newest = [...displayEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            if (onSelectEvent && newest.id !== prevSelectedId.current) {
                prevSelectedId.current = newest.id;
                onSelectEvent(newest);
            }
        }
    }, [displayEvents, onSelectEvent]);

    // When user clicks a category → fly to first event of that category
    const handleCategoryClick = useCallback((category: string | null) => {
        setActiveCategory(category);
        const targetEvents = category
            ? allEvents.filter(e => getEventCategory(e) === category)
            : allEvents;
        if (targetEvents.length > 0) {
            const newest = [...targetEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            setFlyTarget({ ...newest });
            if (onSelectEvent) onSelectEvent(newest);
        }
    }, [allEvents, onSelectEvent]);

    const [isSearching, setIsSearching] = useState(false);

    // Add custom watchlist item
    const handleAddCustom = useCallback(async () => {
        if (!customInput.trim() || isSearching) return;
        setIsSearching(true);
        const query = customInput;
        localStorage.setItem('artillegence_last_custom_query', query);
        const loc = getLocationForKeyword(query);
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
                    const flat = parseFloat(data.lat);
                    const flng = parseFloat(data.lng);
                    if (!isNaN(flat) && !isNaN(flng)) {
                        loc.lat = flat;
                        loc.lng = flng;
                        loc.city = data.city || '';
                        loc.country = data.country || '';
                    }
                }
            }
        } catch (e) {
            console.error("Custom search failed", e);
        }

        const newItemLat = loc.lat + offset();
        const newItemLng = loc.lng + offset();

        const newItem: GeoEvent = {
            id: `custom-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            lat: isNaN(newItemLat) ? 19.0760 : newItemLat,
            lng: isNaN(newItemLng) ? 72.8777 : newItemLng,
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

        setTimeout(() => {
            setFlyTarget(newItem);
            if (onSelectEvent) onSelectEvent(newItem);
        }, 300);
    }, [customInput, onAddCustomEvent, isSearching, onSelectEvent]);

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
            case 'low': return '#10b981';
            default: return '#10b981';
        }
    };

    const getCountryColor = useCallback((countryName: string, countryCode: string) => {
        const nameLower = countryName?.toLowerCase().trim() || '';
        const codeLower = countryCode?.toLowerCase().trim() || '';

        if (!nameLower && !codeLower) return null;

        const countryEvents = displayEvents.filter(ev => {
            const evCountry = ev.country?.toLowerCase().trim() || '';
            const evCity = ev.city?.toLowerCase().trim() || '';
            const evHeadline = ev.headline?.toLowerCase() || '';
            const evSummary = ev.summary?.toLowerCase() || '';

            let isLocationMatch = false;

            if (evCountry) {
                if (evCountry === nameLower || evCountry === codeLower) {
                    isLocationMatch = true;
                } else if ((nameLower === 'united states' || nameLower === 'united states of america') && (evCountry === 'usa' || evCountry === 'us')) {
                    isLocationMatch = true;
                } else if ((nameLower === 'united kingdom' || nameLower === 'uk') && (evCountry === 'uk' || evCountry === 'gb' || evCountry === 'united kingdom')) {
                    isLocationMatch = true;
                } else if (nameLower === 'russia' && (evCountry === 'russia' || evCountry === 'russian federation')) {
                    isLocationMatch = true;
                } else if (nameLower === 'iran' && (evCountry === 'iran' || evCountry === 'islamic republic of iran')) {
                    isLocationMatch = true;
                }
            }

            if (evCity) {
                if (evCity === nameLower || evCity === codeLower) {
                    isLocationMatch = true;
                } else if (nameLower === 'india' && ['mumbai', 'delhi', 'new delhi', 'bangalore', 'bengaluru', 'chennai', 'kolkata', 'hyderabad', 'pune'].includes(evCity)) {
                    isLocationMatch = true;
                } else if ((nameLower === 'united states' || nameLower === 'united states of america') && ['new york', 'washington', 'los angeles', 'chicago', 'san francisco', 'houston'].includes(evCity)) {
                    isLocationMatch = true;
                } else if (nameLower === 'russia' && ['moscow', 'saint petersburg'].includes(evCity)) {
                    isLocationMatch = true;
                } else if (nameLower === 'united kingdom' && ['london', 'belfast', 'birmingham'].includes(evCity)) {
                    isLocationMatch = true;
                } else if (nameLower === 'ukraine' && ['kyiv', 'kiev', 'lviv', 'kharkiv', 'odessa'].includes(evCity)) {
                    isLocationMatch = true;
                } else if (nameLower === 'israel' && ['tel aviv', 'jerusalem', 'gaza', 'haifa'].includes(evCity)) {
                    isLocationMatch = true;
                } else if (nameLower === 'iran' && ['tehran', 'isfahan', 'shiraz'].includes(evCity)) {
                    isLocationMatch = true;
                } else if (nameLower === 'lebanon' && ['beirut'].includes(evCity)) {
                    isLocationMatch = true;
                }
            }

            let isHotzoneMatch = false;
            if (nameLower === 'ukraine' && (evHeadline.includes('ukraine') || evSummary.includes('ukraine'))) {
                isHotzoneMatch = true;
            } else if (nameLower === 'israel' && (evHeadline.includes('israel') || evSummary.includes('israel') || evHeadline.includes('gaza') || evSummary.includes('gaza'))) {
                isHotzoneMatch = true;
            } else if (nameLower === 'iran' && (evHeadline.includes('iran') || evSummary.includes('iran'))) {
                isHotzoneMatch = true;
            }

            return isLocationMatch || isHotzoneMatch;
        });

        if (countryEvents.length === 0) return null;

        const severities: ('critical' | 'high' | 'medium' | 'low')[] = ['critical', 'high', 'medium', 'low'];
        for (const sev of severities) {
            if (countryEvents.some(e => e.severity === sev)) {
                return getPointColor(sev);
            }
        }
        return '#10b981';
    }, [displayEvents]);

    const filteredGeoJson = useMemo(() => {
        if (!geoJsonData || !geoJsonData.features) return null;
        return {
            ...geoJsonData,
            features: geoJsonData.features.filter((feature: any) => {
                const properties = feature?.properties || {};
                const countryName = properties.ADMIN || properties.name || properties.Name || '';
                const countryCode = properties.ISO_A3 || properties.iso_a3 || properties['ISO3166-1-Alpha-3'] || properties['ISO3166-1-Alpha-2'] || properties.code || '';
                return getCountryColor(countryName, countryCode) !== null;
            })
        };
    }, [geoJsonData, displayEvents, getCountryColor]);

    return (
        <div className="relative w-full rounded-lg overflow-hidden border border-slate-800/80 shadow-2xl" style={{ height: '500px' }}>
            <MapContainer
                center={[20, 78]}
                zoom={4}
                className="w-full h-full"
                style={{ background: '#070a0f' }}
                zoomControl={true}
            >
                {/* Free high-fidelity dark tiles (Esri World Dark Gray - no API key watermark) */}
                <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                    attribution='&copy; Esri, HERE, Garmin, USGS'
                    maxZoom={16}
                />

                {filteredGeoJson && filteredGeoJson.features.length > 0 && (
                    <GeoJSON
                        key={displayEvents.map(e => e.id + '-' + e.severity).join('_')}
                        data={filteredGeoJson}
                        style={(feature) => {
                            const properties = feature?.properties || {};
                            const countryName = properties.ADMIN || properties.name || properties.Name || '';
                            const countryCode = properties.ISO_A3 || properties.iso_a3 || properties['ISO3166-1-Alpha-3'] || properties['ISO3166-1-Alpha-2'] || properties.code || '';
                            const color = getCountryColor(countryName, countryCode);

                            if (color) {
                                return {
                                    fillColor: color,
                                    fillOpacity: 0.12,
                                    color: color,
                                    weight: 0.8,
                                    opacity: 0.35
                                };
                            }
                            return {
                                fillColor: 'transparent',
                                fillOpacity: 0,
                                color: '#1e293b',
                                weight: 0.3,
                                opacity: 0.06
                            };
                        }}
                    />
                )}

                <MapAutoPanner events={displayEvents} markerRefs={markerRefs} isPaused={isInteracting} totalCount={allEvents.length} />
                <FlyToCategory targetEvent={flyTarget} markerRefs={markerRefs} />

                {displayEvents.length > 1 && (
                    <Polyline
                        positions={displayEvents.map(ev => [ev.lat, ev.lng] as [number, number])}
                        color="#38bdf8"
                        weight={1.5}
                        opacity={0.3}
                        dashArray="4, 8"
                    />
                )}

                {displayEvents.map((ev) => (
                    <React.Fragment key={`glow-group-${ev.id}`}>
                        <Marker
                            position={[ev.lat, ev.lng]}
                            icon={createGlowIcon(getPointColor(ev.severity), ev.severity)}
                            interactive={false}
                        />
                        <Marker
                            position={[ev.lat, ev.lng]}
                            icon={ev.isCustom ? createStarIcon('#fbbf24') : createPulseIcon(getPointColor(ev.severity))}
                            ref={(r) => { if (r) markerRefs.current[ev.id] = r; }}
                            eventHandlers={{
                                click: () => {
                                    if (onSelectEvent) {
                                        onSelectEvent(ev);
                                    }
                                }
                            }}
                        >
                            <Popup className="glass-popup pb-2" autoPan={true} autoPanPaddingTopLeft={[10, 88]} autoPanPaddingBottomRight={[10, 70]}>
                                <div className={`bg-slate-900/95 border p-4 rounded-lg shadow-xl shadow-black/50 -m-3 overflow-y-auto scrollbar-thin ${ev.isCustom ? 'border-amber-500/50 w-[400px] max-h-[400px]' : 'border-slate-700 w-[350px] max-h-[400px]'}`}>
                                    <div className="flex items-center gap-2 mb-2 justify-between">
                                        <div className="flex items-center gap-2">
                                            {ev.isCustom ? (
                                                <Star size={10} className="text-amber-400 fill-amber-400" />
                                            ) : (
                                                <div className={`w-2 h-2 rounded-full ${ev.severity === 'critical' ? 'bg-red-500' :
                                                    ev.severity === 'high' ? 'bg-orange-500' : 'bg-sky-400'
                                                    }`}></div>
                                            )}
                                            <span className="text-[9px] font-bold text-sky-400 tracking-widest uppercase truncate max-w-[150px]">
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
                                                    className="ml-auto text-[10px] bg-indigo-600/80 hover:bg-indigo-50 text-white px-2 py-0.5 rounded shadow cursor-pointer border border-indigo-450/40 flex items-center gap-0.5 font-bold tracking-wide">
                                                    ANALYZE
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {activeAnalysis[ev.id] ? (
                                        <div className="mt-3 bg-slate-800/50 p-3 rounded border border-indigo-500/30 font-mono">
                                            {activeAnalysis[ev.id].loading ? (
                                                <div className="flex flex-col items-center justify-center py-4 space-y-2">
                                                    <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                                                    <span className="text-[10px] text-indigo-300 font-mono animate-pulse uppercase tracking-wider">Mistral AI Modeling...</span>
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                                                    {activeAnalysis[ev.id].text}
                                                </div>
                                            )}
                                            <button onClick={() => setActiveAnalysis(prev => { const n = { ...prev }; delete n[ev.id]; return n; })} className="mt-3 w-full text-center text-[9px] text-slate-500 hover:text-slate-300 border border-slate-700 rounded py-0.5">RETURN TO SOURCE</button>
                                        </div>
                                    ) : (
                                        <>
                                            {ev.image_base64 && (
                                                <div className="mt-3 mb-2 rounded overflow-hidden border border-slate-700/60 shadow-lg">
                                                    <img src={`data:image/jpeg;base64,${ev.image_base64}`} alt="Scraped View" className="w-full h-auto opacity-90" />
                                                </div>
                                            )}
                                            <>
                                                <h4 className="text-xs font-bold text-white leading-tight mb-2 pb-1 border-b border-slate-700/50">{ev.headline}</h4>
                                                {ev.category === '⭐ User Custom' ? (
                                                    <div className="mt-2 rounded overflow-hidden h-[280px] bg-white relative">
                                                        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-slate-800 text-xs font-bold pointer-events-none">
                                                            Loading Browser...
                                                        </div>
                                                        <iframe
                                                            src={`https://www.google.com/search?igu=1&q=${encodeURIComponent(ev.headline.replace(/Monitoring:\s*/i, ''))}`}
                                                            className="w-full h-full border-0 relative z-10"
                                                            title="In-App Browser"
                                                            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                                                        />
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-slate-300 leading-relaxed mb-1 whitespace-pre-wrap">
                                                        {ev.summary}
                                                    </p>
                                                )}

                                                {(() => {
                                                    const rawSource = typeof ev.source === "string" ? ev.source.replace("Telegram: ", "") : "CIG_telegram";
                                                    const isEmbeddable = ev.telegram_post_id && !rawSource.includes(' ') && rawSource.toLowerCase() !== 'rnintel';

                                                    if (isEmbeddable) {
                                                        return (
                                                            <div className="mt-2" style={{ maxHeight: "250px", overflowY: "auto", overflowX: "hidden", borderRadius: "8px", border: "1px solid rgba(56,189,248,0.15)" }}>
                                                                <TelegramEmbed channelSlug={rawSource} postId={ev.telegram_post_id} compact />
                                                            </div>
                                                        );
                                                    }
                                                    if (ev.video) return renderNewsVideo(ev.video);
                                                    if (ev.image) {
                                                        return (
                                                            <div className="mt-2 rounded overflow-hidden max-h-32 bg-slate-950/80 flex items-center justify-center border border-slate-750/40">
                                                                <img
                                                                    src={ev.image}
                                                                    alt=""
                                                                    className="max-h-32 object-cover w-full"
                                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                />
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </>
                                        </>
                                    )}

                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                                        <a href={ev.url} target="_blank" rel="noopener noreferrer"
                                            className="text-[9px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold">
                                            SOURCE <ExternalLink size={8} />
                                        </a>
                                        <span className="text-[8px] text-slate-500">
                                            {new Date(ev.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    </React.Fragment>
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
                .zoning-glow {
                    filter: blur(40px);
                    pointer-events: none;
                }
                .leaflet-overlay-pane svg {
                    overflow: visible;
                }
            `}</style>

            {/* Overlay: Legend */}
            <div className="absolute bottom-6 right-6 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-4 py-2 rounded-xl shadow-2xl z-[1000] flex items-center gap-4 pointer-events-auto border-1">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]"></div>
                    <span className="text-[10px] font-bold text-slate-350 uppercase tracking-wider">Low Impact</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#eab308] shadow-[0_0_8px_#eab308]"></div>
                    <span className="text-[10px] font-bold text-slate-350 uppercase tracking-wider">Medium Impact</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shadow-[0_0_8px_#ef4444]"></div>
                    <span className="text-[10px] font-bold text-slate-350 uppercase tracking-wider">High Impact</span>
                </div>
            </div>
        </div >
    );
}
