import React, { useRef, useEffect, useState } from 'react';
import Globe from 'react-globe.gl';

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
  category?: string;
}

export default function InfiniteSpaceView({
  events,
  onSelectEvent,
  selectedEvent
}: {
  events: GeoEvent[];
  onSelectEvent: (e: GeoEvent) => void;
  selectedEvent: GeoEvent | null;
}) {
  const globeEl = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = 0.5;
      globeEl.current.pointOfView({ altitude: 2.2 });
    }
  }, []);

  useEffect(() => {
    if (selectedEvent && globeEl.current) {
      globeEl.current.pointOfView({
        lat: selectedEvent.lat,
        lng: selectedEvent.lng,
        altitude: 1.5
      }, 1000);
    }
  }, [selectedEvent]);

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return '#f43f5e';
      case 'high': return '#f59e0b';
      case 'medium': return '#0ea5e9';
      default: return '#94a3b8';
    }
  };

  // Simple string hash for stable pseudo-randomness
  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  // Deduplicate and enhance events with stable randomized altitudes and spread offsets
  const globeEvents = React.useMemo(() => {
    const seen = new Set();
    const uniqueEvents = events.filter(e => e.lat != null && e.lng != null).filter(e => {
      const normalized = e.headline.toLowerCase().trim();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    return uniqueEvents.slice(0, 40).map((e, i) => {
      const isMain = i < 8; // Only top 8 events get full cards, rest get small labels
      const seed = hashString(e.headline + e.id);

      // Stable altitude based on seed
      const altitude = isMain
        ? 0.2 + ((seed % 100) / 100) * 0.4
        : 0.4 + ((seed % 100) / 100) * 1.4;

      // Small coordinate offset so identical lat/lngs don't stack in a single line
      const latOffset = ((seed % 50) - 25) * 0.1;
      const lngOffset = (((seed >> 2) % 50) - 25) * 0.1;

      return {
        ...e,
        isMain,
        altitude,
        lat: e.lat + latOffset,
        lng: e.lng + lngOffset
      };
    });
  }, [events]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#020617] rounded-xl overflow-hidden relative">
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"

        // HTML markers
        htmlElementsData={globeEvents}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude="altitude"
        htmlElement={(d: any) => {
          const el = document.createElement('div');
          const color = getSeverityColor(d.severity);
          const isSelected = selectedEvent?.id === d.id;

          if (d.isMain || isSelected) {
            // Full Glassmorphism Card
            el.innerHTML = `
              <div style="
                background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(8px);
                border: 1px solid ${color}80;
                border-radius: 8px;
                padding: 12px;
                width: 250px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 15px ${color}40;
                color: white;
                font-family: system-ui, sans-serif;
                pointer-events: auto;
                cursor: pointer;
                transition: all 0.2s ease;
                ${isSelected ? `box-shadow: 0 0 30px ${color}80; transform: scale(1.05);` : ''}
              ">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; box-shadow: 0 0 8px ${color};"></div>
                  <span style="font-size: 10px; font-weight: bold; color: ${color}; text-transform: uppercase; letter-spacing: 1px;">
                    ${d.city ? d.city : 'GEO-EVENT'}
                  </span>
                </div>
                <div style="font-size: 12px; font-weight: 600; line-height: 1.3; margin-bottom: 8px; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
                  ${d.headline}
                </div>
                <div style="font-size: 9px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
                  SOURCE: <a href="${d.url}" target="_blank" style="color: #38bdf8; text-decoration: none;">${d.url ? (new URL(d.url).hostname) : 'Web'}</a>
                </div>
              </div>
              </div>
              
              <!-- Star core right below the card -->
              <div style="
                position: absolute;
                bottom: -10px;
                left: calc(50% - 3px);
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: ${color};
                box-shadow: 0 0 10px ${color}, 0 0 20px ${color};
              "></div>
            `;
            el.style.transform = `translate(-50%, -100%) translateY(-10px)`;
          } else {
            // Small floating label for distant events
            el.innerHTML = `
              <div style="
                background: rgba(15, 23, 42, 0.5);
                backdrop-filter: blur(4px);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                padding: 4px 8px;
                color: #94a3b8;
                font-family: system-ui, sans-serif;
                font-size: 8px;
                pointer-events: auto;
                cursor: pointer;
                white-space: nowrap;
                max-width: 150px;
                overflow: hidden;
                text-overflow: ellipsis;
                transition: all 0.2s ease;
              ">
                Monitoring: ${d.headline.replace(/^Monitoring:\s*/i, '').substring(0, 30)}...
              </div>
              <!-- Small dot -->
              <div style="
                position: absolute;
                bottom: -15px;
                left: 50%;
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: ${color};
                box-shadow: 0 0 8px ${color};
              "></div>
            `;
            el.style.transform = `translate(-50%, -100%) translateY(-15px)`;
          }

          el.onclick = () => onSelectEvent(d as GeoEvent);

          // Hover effect
          el.onmouseenter = () => { el.style.zIndex = '1000'; el.style.opacity = '1'; };
          el.onmouseleave = () => { el.style.zIndex = '1'; el.style.opacity = '0.9'; };

          return el;
        }}
      />

      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 0% 50%, rgba(56,189,248,0.15), transparent 40%)' }} />
    </div>
  );
}
