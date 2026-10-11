import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Globe from 'react-globe.gl';
import type { GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';

// Fallback news pins when backend is unavailable
const FALLBACK_NEWS = [
  { id: 'f1', city: 'Mumbai', headline: 'Nifty IT Index Hits ATH', lat: 19.07, lng: 72.87, severity: 'low', source: 'NSE', timestamp: new Date().toISOString() },
  { id: 'f2', city: 'New York', headline: 'Fed Holds Rates Steady at 5.5%', lat: 40.71, lng: -74.00, severity: 'high', source: 'Reuters', timestamp: new Date().toISOString() },
  { id: 'f3', city: 'Tokyo', headline: 'Semiconductor Expansion Approved', lat: 35.68, lng: 139.65, severity: 'low', source: 'NHK', timestamp: new Date().toISOString() },
  { id: 'f4', city: 'Moscow', headline: 'Energy Sanctions Impact Markets', lat: 55.75, lng: 37.61, severity: 'critical', source: 'Bloomberg', timestamp: new Date().toISOString() },
  { id: 'f5', city: 'Brussels', headline: 'EU AI Regulation Framework Passed', lat: 50.85, lng: 4.35, severity: 'medium', source: 'EC', timestamp: new Date().toISOString() },
  { id: 'f6', city: 'London', headline: 'FTSE 100 Rally Continues', lat: 51.50, lng: -0.12, severity: 'low', source: 'FT', timestamp: new Date().toISOString() },
  { id: 'f7', city: 'Dubai', headline: 'Oil Futures Spike 3.2%', lat: 25.20, lng: 55.27, severity: 'high', source: 'OPEC', timestamp: new Date().toISOString() },
  { id: 'f8', city: 'Beijing', headline: 'PBoC Cuts Reserve Ratio', lat: 39.90, lng: 116.40, severity: 'high', source: 'Xinhua', timestamp: new Date().toISOString() },
  { id: 'f9', city: 'Singapore', headline: 'ASEAN Tech Summit Opens', lat: 1.35, lng: 103.82, severity: 'low', source: 'ST', timestamp: new Date().toISOString() },
  { id: 'f10', city: 'Sydney', headline: 'ASX Mining Sector Surge', lat: -33.87, lng: 151.21, severity: 'medium', source: 'ABC', timestamp: new Date().toISOString() },
  { id: 'f11', city: 'Frankfurt', headline: 'ECB Digital Euro Roadmap', lat: 50.11, lng: 8.68, severity: 'critical', source: 'Bundesbank', timestamp: new Date().toISOString() },
  { id: 'f12', city: 'Seoul', headline: 'AI Chip Export Growth Hits 40%', lat: 37.56, lng: 126.97, severity: 'high', source: 'Yonhap', timestamp: new Date().toISOString() },
  { id: 'f13', city: 'Toronto', headline: 'Clean Energy Grid Investment', lat: 43.65, lng: -79.38, severity: 'low', source: 'CBC', timestamp: new Date().toISOString() },
  { id: 'f14', city: 'Paris', headline: 'Aerospace Defense Orders Surge', lat: 48.85, lng: 2.35, severity: 'medium', source: 'AFP', timestamp: new Date().toISOString() },
  { id: 'f15', city: 'Washington', headline: 'Strategic Treasury Yield Shifts', lat: 38.90, lng: -77.03, severity: 'high', source: 'Fed', timestamp: new Date().toISOString() },
];

// Color palette for pins - vivid colors matching the reference image
const PIN_COLORS = [
  '#38bdf8', // cyan
  '#8b5cf6', // purple
  '#f97316', // orange
  '#ef4444', // red
  '#22d3ee', // teal
  '#a855f7', // violet
  '#3b82f6', // blue  
  '#10b981', // emerald
  '#f43f5e', // rose
  '#eab308', // yellow
];

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#ef4444';
    case 'high': return '#f97316';
    case 'medium': return '#eab308';
    default: return '#38bdf8';
  }
}

// Get a deterministic color based on index
function getPinColor(index: number): string {
  return PIN_COLORS[index % PIN_COLORS.length];
}

// Time formatter
function timeAgo(timestamp: string): string {
  try {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'JUST NOW';
    if (mins < 60) return `${mins}m AGO`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h AGO`;
    return `${Math.floor(hrs / 24)}d AGO`;
  } catch { return 'LIVE'; }
}

const CITIES_LIST = [
  { city: 'New York', lat: 40.71, lng: -74.00, severity: 'critical' },
  { city: 'London', lat: 51.50, lng: -0.12, severity: 'high' },
  { city: 'Tokyo', lat: 35.68, lng: 139.65, severity: 'high' },
  { city: 'Mumbai', lat: 19.07, lng: 72.87, severity: 'high' },
  { city: 'Moscow', lat: 55.75, lng: 37.61, severity: 'critical' },
  { city: 'Brussels', lat: 50.85, lng: 4.35, severity: 'high' },
  { city: 'Dubai', lat: 25.20, lng: 55.27, severity: 'critical' },
  { city: 'Beijing', lat: 39.90, lng: 116.40, severity: 'high' },
  { city: 'Singapore', lat: 1.35, lng: 103.82, severity: 'high' },
  { city: 'Sydney', lat: -33.87, lng: 151.21, severity: 'high' },
  { city: 'Frankfurt', lat: 50.11, lng: 8.68, severity: 'critical' },
  { city: 'Seoul', lat: 37.56, lng: 126.97, severity: 'high' },
  { city: 'Toronto', lat: 43.65, lng: -79.38, severity: 'high' },
  { city: 'Paris', lat: 48.85, lng: 2.35, severity: 'high' },
  { city: 'Washington', lat: 38.90, lng: -77.03, severity: 'critical' }
];

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
}

interface ParticleGlobeProps {
  events?: GeoEvent[];
  theme?: 'broken-glass' | 'neon-black';
}

export default function ParticleGlobe({ events, theme = 'broken-glass' }: ParticleGlobeProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [liveNews, setLiveNews] = useState<any[]>([]);
  const [dimensions, setDimensions] = useState({ width: 800, height: 800 });

  // Sync props to state for live updates
  useEffect(() => {
    if (events && events.length > 0) {
      setLiveNews(events);
    }
  }, [events]);

  // Responsive sizing
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth || window.innerWidth,
          height: containerRef.current.offsetHeight || window.innerHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Fetch live news from the backend (only if authenticated) OR fall back to live RSS feed
  useEffect(() => {
    const fetchNews = async () => {
      try {
        let backendData: any[] = [];
        const token = localStorage.getItem('token');
        if (token) {
          try {
            // Attempt to fetch from Local Backend (authenticated only)
            const res = await fetch('/api/geo/events', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) backendData = await res.json();
          } catch { /* Backend might be offline */ }
        }

        // If backend has events, format and show them
        if (backendData && Array.isArray(backendData) && backendData.length >= 5) {
          const sorted = backendData.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setLiveNews(sorted.slice(0, 15));
        } else {
          // AUTOMATIC RSS SCRAPE: Pull live Google News RSS (Global + India)!
          const rssUrlGlobal = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
          const rssUrlIndia = 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en';

          const [rssResGlobal, rssResIndia] = await Promise.all([
            fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrlGlobal)}`),
            fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrlIndia)}`)
          ]);

          const dataGlobal = await rssResGlobal.json();
          const dataIndia = await rssResIndia.json();

          let combinedItems = [];
          if (dataGlobal?.items) combinedItems.push(...dataGlobal.items);
          if (dataIndia?.items) combinedItems.push(...dataIndia.items);

          if (combinedItems.length > 0) {
            // Shuffle lightly to mix India + Global natively
            combinedItems = combinedItems.sort(() => 0.5 - Math.random());

            const now = Date.now();
            const mappedNews = combinedItems.slice(0, 60).map((item: any, index: number) => {
              // Google News format: "Actual Headline - Publisher Name"
              let headline = item.title;
              let source = 'Global News';

              if (headline.includes(' - ')) {
                const parts = headline.split(' - ');
                source = parts.pop()?.trim() || source;
                headline = parts.join(' - ').trim();
              }

              const cityAnchor = CITIES_LIST[index % CITIES_LIST.length];

              // Force timestamp strictly into "today" format within the last 12 hrs
              const offsetMs = (Math.random() * 12 * 60 * 60 * 1000);
              const forcedTodayTimestamp = new Date(now - offsetMs).toISOString();

              return {
                id: `rss-${index}`,
                city: cityAnchor.city,
                headline: headline,
                lat: cityAnchor.lat + (Math.random() * 2 - 1),
                lng: cityAnchor.lng + (Math.random() * 2 - 1),
                severity: cityAnchor.severity,
                source: source,
                timestamp: forcedTodayTimestamp
              };
            });

            setLiveNews(mappedNews);
          } else {
            setLiveNews(FALLBACK_NEWS.map(n => ({ ...n, timestamp: new Date(Date.now() - Math.random() * 40000000).toISOString() })));
          }
        }
      } catch (err) {
        setLiveNews(FALLBACK_NEWS.map(n => ({ ...n, timestamp: new Date(Date.now() - Math.random() * 40000000).toISOString() })));
      }
    };
    fetchNews();
    // Refresh only every 120s rather than 12s to avoid constant re-renders
    const interval = setInterval(fetchNews, 120000);
    return () => clearInterval(interval);
  }, []);

  // Generate radiating pin stalks (streamlined count for high FPS)
  const pinStalks = useMemo(() => {
    const stalks: any[] = [];
    const count = theme === 'broken-glass' ? 30 : 45;
    for (let i = 0; i < count; i++) {
      const lat = (Math.random() - 0.5) * 160;
      const lng = (Math.random() - 0.5) * 360;
      const height = 0.15 + Math.random() * 0.5;
      const color = PIN_COLORS[i % PIN_COLORS.length];
      stalks.push({ lat, lng, height, color, size: 0.3 + Math.random() * 0.4 });
    }
    return stalks;
  }, [theme]);

  // Scattered background bokeh particles (streamlined for 60fps)
  const bokehParticles = useMemo(() => {
    const particles: any[] = [];
    for (let i = 0; i < 40; i++) {
      const lat = (Math.random() - 0.5) * 180;
      const lng = (Math.random() - 0.5) * 360;
      const alt = 0.8 + Math.random() * 1.2;
      const color = PIN_COLORS[i % PIN_COLORS.length];
      particles.push({ lat, lng, alt, color, size: 0.3 + Math.random() * 0.8 });
    }
    return particles;
  }, []);

  // Configure scene: lighting, controls, post-processing
  const setupScene = useCallback(() => {
    if (!globeRef.current) return;

    const controls = globeRef.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    globeRef.current.pointOfView({ lat: 15, lng: 30, altitude: 2.2 }, 0);

    const scene = globeRef.current.scene();
    const renderer = globeRef.current.renderer();

    // Cap pixel ratio to 1.25 to prevent 4x-9x pixel shading overhead on high-DPI retina displays
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));

    // Enable tone mapping for cinematic feel
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // Clear existing lights
    scene.children.filter((c: any) => c instanceof THREE.Light).forEach((l: any) => scene.remove(l));

    // Key light - strong blue directional
    const keyLight = new THREE.DirectionalLight(0x38bdf8, 4.0);
    keyLight.position.set(200, 150, 300);
    scene.add(keyLight);

    // Rim light - subtle purple backlight
    const rimLight = new THREE.DirectionalLight(0x8b5cf6, 1.5);
    rimLight.position.set(-200, -50, -200);
    scene.add(rimLight);

    // Cool ambient
    const ambientLight = new THREE.AmbientLight(0x0a1628, 2.0);
    scene.add(ambientLight);

    // Bottom lens flare glow
    const flareGeometry = new THREE.PlaneGeometry(500, 3);
    const flareMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const flare = new THREE.Mesh(flareGeometry, flareMaterial);
    flare.position.set(0, -100, 0);
    flare.rotation.x = -Math.PI / 2;
    scene.add(flare);
  }, [theme]);

  useEffect(() => {
    const timer = setTimeout(setupScene, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [setupScene]);

  // Data for the HTML news boxes (15 pins for rich global intelligence coverage)
  const newsBoxData = useMemo(() => {
    const mainCount = Math.min(15, liveNews.length);
    return liveNews.slice(0, mainCount).map(item => ({ ...item, isMain: true }));
  }, [liveNews]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 flex items-center justify-center">
      {/* Ambient background glow layers (hide in white theme) */}
      {theme !== 'broken-glass' && (
        <>
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0,
            background: 'radial-gradient(ellipse 60% 50% at 55% 45%, rgba(56,189,248,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0,
            background: 'radial-gradient(ellipse 40% 30% at 50% 55%, rgba(139,92,246,0.04) 0%, transparent 60%)',
            pointerEvents: 'none',
          }} />
          {/* Bottom lens flare CSS effect */}
          <div style={{
            position: 'absolute', bottom: '30%', left: '10%', right: '10%', height: '2px', zIndex: 1,
            background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.3), rgba(34,211,238,0.15), transparent)',
            filter: 'blur(4px)',
            pointerEvents: 'none',
          }} />
        </>
      )}

      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        showGlobe={theme !== 'broken-glass'}

        // Swap globe texture based on theme
        globeImageUrl={theme === 'broken-glass'
          ? "//unpkg.com/three-globe/example/img/earth-water.png"
          : "//unpkg.com/three-globe/example/img/earth-night.jpg"}
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"

        // Glowing atmosphere
        atmosphereColor={theme === 'broken-glass' ? '#ffffff' : '#38bdf8'}
        atmosphereAltitude={0.25}

        // Pin stalks as custom 3D objects (the radiating lines with dots at the tips)
        customLayerData={[...pinStalks, ...(theme === 'broken-glass' ? [] : bokehParticles)]}
        customThreeObject={(d: any) => {
          const group = new THREE.Group();

          if (d.height) {
            // This is a pin stalk
            // Line (stalk)
            const lineGeo = new THREE.CylinderGeometry(0.08, 0.08, d.height * 100, 4);
            const lineMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(d.color),
              transparent: true,
              opacity: 0.4,
            });
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.position.y = (d.height * 100) / 2;
            group.add(line);

            // Dot at tip
            const dotGeo = new THREE.SphereGeometry(d.size, 8, 8);
            const dotMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(d.color),
              transparent: true,
              opacity: 0.9,
            });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.y = d.height * 100;
            group.add(dot);

            // Glow around dot
            const glowGeo = new THREE.SphereGeometry(d.size * 2.5, 8, 8);
            const glowMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(d.color),
              transparent: true,
              opacity: 0.12,
              blending: THREE.AdditiveBlending,
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.y = d.height * 100;
            group.add(glow);
          } else {
            // This is a bokeh / background particle
            const sphere = new THREE.SphereGeometry(d.size, 6, 6);
            const mat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(d.color),
              transparent: true,
              opacity: 0.15 + Math.random() * 0.2,
              blending: THREE.AdditiveBlending,
            });
            group.add(new THREE.Mesh(sphere, mat));

            // Soft glow halo
            const haloGeo = new THREE.SphereGeometry(d.size * 3, 6, 6);
            const haloMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(d.color),
              transparent: true,
              opacity: 0.04,
              blending: THREE.AdditiveBlending,
            });
            group.add(new THREE.Mesh(haloGeo, haloMat));
          }

          return group;
        }}
        customThreeObjectUpdate={(obj: any, d: any) => {
          const coords = globeRef.current?.getCoords(d.lat, d.lng, d.alt || 0);
          if (coords) {
            Object.assign(obj.position, coords);
            // Orient stalks to point away from globe center
            if (d.height) {
              obj.lookAt(new THREE.Vector3(0, 0, 0));
              obj.rotateX(Math.PI / 2);
            }
          }
        }}

        // Animated real-time news HTML elements
        htmlElementsData={newsBoxData}
        htmlElement={(d: any, idx?: number) => {
          const el = document.createElement('div');

          if (!d.isMain) {
            // Render fading background floating news hooked directly onto bokeh particles
            const pinColor = getPinColor(idx || 0);
            const isLight = theme === 'broken-glass';

            el.innerHTML = `
              <div style="
                opacity: ${d.opacity.toFixed(2)};
                background: ${isLight ? 'rgba(255, 255, 255, 0.4)' : 'rgba(11, 25, 44, 0.4)'};
                border: 1px solid ${isLight ? 'rgba(255, 255, 255, 0.8)' : 'rgba(56, 189, 248, 0.2)'};
                padding: 4px 6px;
                border-radius: 4px;
                color: ${isLight ? '#1a202c' : '#ffffff'};
                font-weight: 600;
                font-size: 7px;
                font-family: 'Inter', system-ui, sans-serif;
                letter-spacing: 0.03em;
                white-space: nowrap;
                max-width: 140px;
                overflow: hidden;
                text-overflow: ellipsis;
                box-shadow: 0 0 10px ${pinColor}20, inset 0 0 5px rgba(${isLight ? '255,255,255,0.05' : '56,189,248,0.05'});
                transform: translate(-50%, -50%);
                pointer-events: none;
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
              ">${d.headline}</div>
            `;
            return el;
          }

          const pinColor = getSeverityColor(d.severity || 'low');
          const accentColor = getPinColor(typeof idx === 'number' ? idx : Math.floor(Math.random() * PIN_COLORS.length));
          const cityName = (d.city || d.name || 'INTEL').toUpperCase();
          const headline = d.headline || d.news || 'Signal intercepted';
          const source = d.source || 'Artillegence';
          const time = timeAgo(d.timestamp || new Date().toISOString());
          const isLight = theme === 'broken-glass';

          el.style.pointerEvents = 'auto';
          el.innerHTML = `
            <div class="globe-news-pin" style="
              display: flex;
              flex-direction: column;
              align-items: center;
              transform: translateY(-45px);
              transition: transform 0.3s ease;
              will-change: transform;
              contain: layout style;
              cursor: pointer;
            " onmouseover="this.style.transform='translateY(-55px) scale(1.08)';" onmouseout="this.style.transform='translateY(-45px) scale(1)';">

              <!-- News Card -->
              <div style="
                background: ${isLight ? '#ffffff' : '#040b16'};
                border: 1px solid ${isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(56, 189, 248, 0.3)'};
                border-left: 3px solid ${pinColor};
                box-shadow: 0 4px 14px rgba(0,0,0,0.15);
                padding: 7px 10px;
                border-radius: 8px;
                color: ${isLight ? '#1a202c' : '#ffffff'};
                display: flex;
                flex-direction: column;
                gap: 3px;
                max-width: 190px;
                min-width: 130px;
              ">
                <!-- Header: City + Time -->
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <span style="
                    font-size: 7px; font-weight: 900; letter-spacing: 0.15em;
                    color: ${pinColor}; text-transform: uppercase;
                    display: flex; align-items: center; gap: 4px;
                  ">
                    <span style="width: 5px; height: 5px; background: ${pinColor}; border-radius: 50%; display: inline-block; animation: blink 2s infinite;"></span>
                    ${cityName}
                  </span>
                  <span style="font-size: 6px; color: ${isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.5)'}; font-weight: 700; letter-spacing: 0.08em; white-space: nowrap;">${time}</span>
                </div>
                
                <!-- Headline -->
                <span style="
                  font-size: 9px; font-weight: 700; font-family: 'Inter', system-ui, sans-serif;
                  letter-spacing: 0.02em; line-height: 1.3;
                  color: ${isLight ? '#2d3748' : '#e2e8f0'};
                  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
                ">${headline}</span>
                
                <!-- Source Tag -->
                <div style="display: flex; align-items: center; gap: 4px; margin-top: 1px;">
                  <span style="
                    font-size: 6px; font-weight: 700; letter-spacing: 0.12em;
                    color: ${accentColor}; text-transform: uppercase;
                    background: ${accentColor}15; padding: 1px 5px; border-radius: 3px;
                    border: 1px solid ${accentColor}30;
                  ">${source}</span>
                </div>
              </div>
              
              <!-- Vertical Stalk -->
              <div style="
                width: 1px; height: 40px;
                background: linear-gradient(to bottom, ${pinColor}90, ${pinColor}20, transparent);
                margin-top: 2px;
              "></div>
              
              <!-- Origin Dot with pulse ring -->
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <div style="
                  position: absolute;
                  width: 14px; height: 14px; border-radius: 50%;
                  background: ${pinColor}20;
                  animation: pulse-ring 2.5s ease-out infinite;
                "></div>
                <div style="
                  width: 6px; height: 6px; border-radius: 50%;
                  background: ${pinColor};
                  box-shadow: 0 0 10px ${pinColor}, 0 0 20px ${pinColor}60;
                  border: 1.5px solid rgba(255,255,255,0.6);
                  position: relative; z-index: 2;
                "></div>
              </div>
            </div>
          `;
          return el;
        }}
        htmlAltitude={(d: any) => d.alt || 0.12}
      />

      {/* Inject keyframe animations */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .globe-news-pin {
          animation: fadeInUp 0.6s ease-out both;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(-45px); }
        }
      `}</style>
    </div>
  );
}
