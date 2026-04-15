import asyncio
import json
import re
import uuid
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List
import os

# Internal modules
from auth import require_auth
import database as db

app = FastAPI(title="Artillegence AI API")

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from auth import router as auth_router
app.include_router(auth_router)

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        dead = []
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for d in dead:
            self.disconnect(d)

manager = ConnectionManager()

# ── Geo Events Storage ──

CITY_COORDS = {
    "mumbai": (19.076, 72.8777), "delhi": (28.6139, 77.2090), "new delhi": (28.6139, 77.2090),
    "bangalore": (12.9716, 77.5946), "bengaluru": (12.9716, 77.5946), "chennai": (13.0827, 80.2707),
    "kolkata": (22.5726, 88.3639), "hyderabad": (17.385, 78.4867), "pune": (18.5204, 73.8567),
    "ahmedabad": (23.0225, 72.5714), "jaipur": (26.9124, 75.7873), "lucknow": (26.8467, 80.9462),
    "kabul": (34.5553, 69.2075), "tehran": (35.6892, 51.3890), "baghdad": (33.3152, 44.3661),
    "dubai": (25.2048, 55.2708), "riyadh": (24.7136, 46.6753), "doha": (25.2854, 51.5310),
    "islamabad": (33.6844, 73.0479), "karachi": (24.8607, 67.0011), "lahore": (31.5204, 74.3587),
    "beijing": (39.9042, 116.4074), "shanghai": (31.2304, 121.4737), "hong kong": (22.3193, 114.1694),
    "tokyo": (35.6762, 139.6503), "singapore": (1.3521, 103.8198), "seoul": (37.5665, 126.978),
    "taipei": (25.033, 121.5654), "sydney": (33.8688, 151.2093), "moscow": (55.7558, 37.6173),
    "kyiv": (50.4501, 30.5234), "kiev": (50.4501, 30.5234), "minsk": (53.9006, 27.5590),
    "london": (51.5074, -0.1278), "paris": (48.8566, 2.3522), "berlin": (52.52, 13.405),
    "rome": (41.9028, 12.4964), "madrid": (40.4168, -3.7038), "brussels": (50.8503, 4.3517),
    "amsterdam": (52.3676, 4.9041), "zurich": (47.3769, 8.5417), "vienna": (48.2082, 16.3738),
    "new york": (40.7128, -74.006), "washington": (38.9072, -77.0369), "los angeles": (34.0522, -118.2437),
    "chicago": (41.8781, -87.6298), "san francisco": (37.7749, -122.4194), "houston": (29.7604, -95.3698),
    "toronto": (43.6532, -79.3832), "ottawa": (45.4215, -75.6972),
    "gaza": (31.5, 34.47), "tel aviv": (32.0853, 34.7818), "jerusalem": (31.7683, 35.2137),
    "beirut": (33.8938, 35.5018), "damascus": (33.5138, 36.2765), "amman": (31.9454, 35.9284),
    "cairo": (30.0444, 31.2357), "nairobi": (1.2921, 36.8219), "lagos": (6.5244, 3.3792),
    "johannesburg": (-26.2041, 28.0473), "cape town": (-33.9249, 18.4241),
    "sao paulo": (-23.5505, -46.6333), "buenos aires": (-34.6037, -58.3816),
    "mexico city": (19.4326, -99.1332), "lima": (-12.0464, -77.0428),
    "bangkok": (13.7563, 100.5018), "jakarta": (-6.2088, 106.8456),
    "kuala lumpur": (3.139, 101.6869), "hanoi": (21.0278, 105.8342),
    "iran": (32.4279, 53.688), "israel": (31.0461, 34.8516), "ukraine": (48.3794, 31.1656),
    "russia": (61.524, 105.3188), "china": (35.8617, 104.1954), "india": (20.5937, 78.9629),
    "usa": (37.0902, -95.7129), "japan": (36.2048, 138.2529), "germany": (51.1657, 10.4515),
    "france": (46.2276, 2.2137), "uk": (55.3781, -3.436), "saudi arabia": (23.8859, 45.0792),
    "turkey": (38.9637, 35.2433), "yemen": (15.5527, 48.5164), "syria": (34.8021, 38.9968),
    "sudan": (12.8628, 30.2176), "pakistan": (30.3753, 69.3451),
    "wall street": (40.7069, -74.0089), "sensex": (19.076, 72.8777), "nifty": (19.076, 72.8777),
}

# Geo events are now stored in SQLite via database.py
# The in-memory list is kept only as a write-through cache for broadcast speed.
_geo_cache: list = []

def _sync_geo_cache():
    """Load geo events from DB into the in-memory cache on startup."""
    global _geo_cache
    _geo_cache = db.get_geo_events(limit=200)
    print(f"✅ [DB] Loaded {len(_geo_cache)} geo events from database")

_sync_geo_cache()


def extract_geo_events(event: dict):
    """Extract locations from Mistral analysis and create geo events."""
    found = []

    GLOBAL_LOCATIONS = {
        'india': {'lat': 20.59, 'lng': 78.96, 'city': 'India'},
        'mumbai': {'lat': 19.07, 'lng': 72.87, 'city': 'Mumbai'},
        'delhi': {'lat': 28.61, 'lng': 77.20, 'city': 'Delhi'},
        'us': {'lat': 37.09, 'lng': -95.71, 'city': 'USA'},
        'usa': {'lat': 37.09, 'lng': -95.71, 'city': 'USA'},
        'china': {'lat': 35.86, 'lng': 104.19, 'city': 'China'},
        'russia': {'lat': 61.52, 'lng': 105.31, 'city': 'Russia'},
        'ukraine': {'lat': 48.37, 'lng': 31.16, 'city': 'Ukraine'},
        'israel': {'lat': 31.04, 'lng': 34.85, 'city': 'Israel'},
        'iran': {'lat': 32.42, 'lng': 53.68, 'city': 'Iran'},
        'middle east': {'lat': 29.29, 'lng': 42.55, 'city': 'Middle East'},
        'uk': {'lat': 55.37, 'lng': -3.43, 'city': 'UK'},
        'japan': {'lat': 36.20, 'lng': 138.25, 'city': 'Japan'},
        'europe': {'lat': 54.52, 'lng': 15.25, 'city': 'Europe'}
    }

    agent_type = event.get("agent", "unknown")

    # 1. TELEGRAM SCANNER HANDLING
    if agent_type == "telegram_scanner":
        mistral_data = event.get("mistral_analysis")
        if not mistral_data: return found
        results = mistral_data.get("results", [])
        news_items = event.get("news_items", [])
        for res in results:
            post_id = res.get("id")
            locations = res.get("locations", [])
            matching_item = next((item for item in news_items if item.get("telegram_post_id") == post_id), {})
            
            text = (matching_item.get('title', '') + ' ' + matching_item.get('snippet', '')).lower()
            severity = 'medium'
            if any(w in text for w in ['bomb', 'attack', 'kill', 'war', 'strike', 'missile', 'terror', 'explosion']): severity = 'critical'
            elif any(w in text for w in ['crash', 'crisis', 'collapse', 'emergency', 'conflict', 'sanctions']): severity = 'high'
            
            for loc in locations:
                if isinstance(loc, dict) and 'lat' in loc and 'lng' in loc:
                    try:
                        lat, lng = float(loc.get('lat')), float(loc.get('lng'))
                        stable_id = f"tg-{post_id}" if post_id else str(uuid.uuid4())[:8]
                        raw_source = matching_item.get('source', 'CIG_telegram')
                        clean_slug = raw_source.replace('Telegram: ', '') if isinstance(raw_source, str) else 'CIG_telegram'

                        found.append({
                            'id': stable_id,
                            'lat': lat, 'lng': lng,
                            'city': str(loc.get('name', 'Unknown')).title(),
                            'country': '',
                            'headline': matching_item.get('title', 'Telegram Intel Update'),
                            'summary': matching_item.get('snippet', ''),
                            'telegram_post_id': post_id,
                            'source': clean_slug,
                            'url': matching_item.get('url', ''),
                            'severity': severity,
                            'category': 'Geopolitics & Telegram',
                            'timestamp': matching_item.get('timestamp') or datetime.now().isoformat()
                        })
                    except (ValueError, TypeError): continue
        return found

    # 2. STANDARD SCRAPERS AND VISUAL RESEARCHER
    news_items = event.get("news_items", []) or event.get("trending_items", []) or event.get("market_items", [])
    if not news_items and 'sources' in event:
        news_items = event.get('sources', [])

    import random
    for item in news_items:
        text = (item.get('title', '') + ' ' + item.get('snippet', '') + ' ' + str(item.get('url', ''))).lower()
        if not text: continue
        
        severity = 'low'
        category = 'Global Macro'
        if agent_type == 'visual_researcher': category = 'Visual Web Research'
        elif agent_type == 'trending_tracker': category = 'Trending Stocks'
        elif 'india' in text or 'nifty' in text or 'sensex' in text: category = 'Indian Markets'
            
        if any(w in text for w in ['crash', 'crisis', 'collapse']): severity = 'high'

        mapped_lat, mapped_lng, mapped_city = None, None, None
        for key, loc in GLOBAL_LOCATIONS.items():
            if key in text.split() or f" {key} " in f" {text} " or f" {key}," in f" {text}":
                mapped_lat, mapped_lng, mapped_city = loc['lat'], loc['lng'], loc['city']
                break
                
        if not mapped_lat:
            if category == 'Indian Markets':
                mapped_lat, mapped_lng, mapped_city = GLOBAL_LOCATIONS['mumbai']['lat'], GLOBAL_LOCATIONS['mumbai']['lng'], GLOBAL_LOCATIONS['mumbai']['city']
            elif agent_type == 'visual_researcher':
                mapped_lat, mapped_lng, mapped_city = GLOBAL_LOCATIONS['us']['lat'], GLOBAL_LOCATIONS['us']['lng'], GLOBAL_LOCATIONS['us']['city']

        if mapped_lat:
            found.append({
                'id': f"news-{uuid.uuid4().hex[:6]}",
                'lat': mapped_lat + (random.uniform(-1, 1) if mapped_city == 'India' or mapped_city == 'USA' else random.uniform(-0.1, 0.1)),
                'lng': mapped_lng + (random.uniform(-1, 1) if mapped_city == 'India' or mapped_city == 'USA' else random.uniform(-0.1, 0.1)),
                'city': mapped_city,
                'country': '',
                'headline': item.get('title', ''),
                'summary': item.get('snippet', ''),
                'source': item.get('source', 'Autonomous Agent'),
                'url': item.get('url', ''),
                'image_base64': item.get('image_base64', ''),
                'severity': severity,
                'category': category,
                'timestamp': item.get('timestamp') or datetime.now().isoformat()
            })

    unique_found = []
    seen = set()
    for f in found:
        if f['headline'] not in seen:
            seen.add(f['headline'])
            unique_found.append(f)
            
    return unique_found[:10]


from pydantic import BaseModel

class AnalyzeRequest(BaseModel):
    event_text: str

# ── REST Endpoints (no auth required) ──

@app.post("/api/analyze_impact")
async def analyze_impact(request: AnalyzeRequest, _user=Depends(require_auth)):
    """Trigger the Mistral AI to generate a financial thesis on an isolated geopolitical event."""
    try:
        from llm_analyzer import MistralAnalyzer
        analyzer = MistralAnalyzer()
        thesis = await analyzer.analyze_event_market_impact(request.event_text)
        return {"thesis": thesis}
    except Exception as e:
        return {"error": str(e)}

class CustomSearchRequest(BaseModel):
    query: str

@app.post("/api/custom_search")
async def custom_search(request: CustomSearchRequest, _user=Depends(require_auth)):
    """Scrape live news for a custom topic and generate an AI summary."""
    try:
        from llm_analyzer import MistralAnalyzer
        analyzer = MistralAnalyzer()
        result = await analyzer.analyze_custom_search(request.query)
        return result
    except Exception as e:
        return {"error": str(e), "query": request.query, "thesis": f"Error: {e}"}

class StockAnalysisRequest(BaseModel):
    symbol: str

@app.post("/api/stock_analysis")
async def stock_analysis(request: StockAnalysisRequest, _user=Depends(require_auth)):
    """
    Scrape live news for a given stock symbol and use Mistral AI to produce
    a structured technical + fundamental + geopolitical thesis.
    """
    try:
        from llm_analyzer import MistralAnalyzer
        analyzer = MistralAnalyzer()
        result = await analyzer.analyze_stock_with_news(request.symbol)
        return result
    except Exception as e:
        return {
            "symbol": request.symbol,
            "bias": "NEUTRAL",
            "thesis": f"⚠️ Error: {str(e)}",
            "news_sources": [],
            "generated_at": ""
        }


class ChartAnalysisRequest(BaseModel):
    symbol: str
    image_base64: str       # base64-encoded PNG of the chart
    media_type: str = "image/png"
    news_context: str = ""  # optional headlines from Mistral news scrape

@app.post("/api/claude_chart_analysis")
async def claude_chart_analysis(request: ChartAnalysisRequest, _user=Depends(require_auth)):
    """
    Autonomous chart analysis: captures a fresh screenshot of the TradingView chart
    from the backend (to ensure high fidelity and bypass CORS/CSS errors) and
    sends it to Claude 3.5 Sonnet Vision for a structured technical analysis.
    """
    try:
        from claude_agent import MistralVisionAgent
        from chart_scraper import scraper
        
        agent = MistralVisionAgent()
        
        image_base64 = request.image_base64
        
        # If frontend image is missing or we want to guarantee quality, use scraper.
        # A blank transparent PNG from html2canvas failing on an iframe is ~3000-8000 bytes.
        # A manually pasted image is > 50,000 bytes.
        # If the user pasted an image, it skips the scraper and uses their image!
        if not image_base64 or len(image_base64) < 50000:
            print(f"Frontend capture missing or too small (blank). Running backend scraper for {request.symbol}...")
            image_base64 = await scraper.get_chart_screenshot(request.symbol)
        else:
            print(f"User provided manual chart screenshot for {request.symbol}. Bypassing scraper.")
        
        result = await agent.analyze_chart_screenshot(
            image_base64=image_base64,
            symbol=request.symbol,
            news_context=request.news_context,
            media_type=request.media_type
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "symbol": request.symbol,
            "bias": "NEUTRAL",
            "trend": {"direction": "SIDEWAYS", "strength": "WEAK", "description": "Analysis unavailable."},
            "key_levels": {"support": [], "resistance": []},
            "patterns": [],
            "commentary": f"⚠️ Chart analysis failed: {str(e)}",
            "confidence": "LOW",
            "error": str(e)
        }

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str = ""
    image_base64: str = ""
    history: List[ChatMessage] = []

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, _user=Depends(require_auth)):
    """
    Conversational endpoint for chatting with Groq Vision.
    """
    try:
        from claude_agent import MistralVisionAgent
        agent = MistralVisionAgent()
        
        history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history]
        
        response_text = await agent.chat(
            user_message=request.message,
            image_base64=request.image_base64,
            history=history_dicts
        )
        return {"response": response_text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e), "response": f"Chat failed: {str(e)}"}

@app.get("/api/status")
async def get_status():
    return {"status": "online", "system": "Artillegence AI"}

@app.get("/api/agents/status")
async def get_agent_status(_user=Depends(require_auth)):
    """Return the live status of all AI agents."""
    try:
        from agents import get_agent_status
        return get_agent_status()
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/market/analysis")
async def get_market_analysis(_user=Depends(require_auth)):
    """Return the latest market analysis from DB."""
    data = db.get_intelligence("market_analyzer_full")
    if data:
        return data
    return {"status": "no data yet — agents are still running their first cycle"}

@app.get("/api/opportunities")
async def get_opportunities(_user=Depends(require_auth)):
    """Return the latest investment opportunities from DB."""
    data = db.get_intelligence("opportunity_finder")
    if data:
        return data
    return {"status": "no opportunities yet — agent is still running"}

@app.get("/api/trending")
async def get_trending(_user=Depends(require_auth)):
    """Return the latest trending data from DB."""
    data = db.get_intelligence("trending_tracker")
    if data:
        return data
    return {"status": "no trending data yet"}

@app.get("/api/telegram/status")
async def get_telegram_status(_user=Depends(require_auth)):
    """Return the latest telegram intel data from DB."""
    data = db.get_intelligence("telegram_scanner")
    if data:
        return data
    return {"status": "no telegram data yet"}

@app.get("/api/indian-market")
async def get_indian_market(_user=Depends(require_auth)):
    """Return the latest Indian market tracker data from DB."""
    data = db.get_intelligence("indian_market_tracker")
    if data:
        return data
    return {"status": "no market data yet"}

@app.get("/api/geo/events")
async def get_geo_events(_user=Depends(require_auth)):
    """Return all geo-tagged events from DB."""
    return db.get_geo_events()

@app.get("/api/google-trends")
async def get_google_trends(_user=Depends(require_auth)):
    """Return the latest Google Trends intelligence data from DB."""
    data = db.get_intelligence("google_trends_tracker")
    if data:
        return data
    return {"status": "no trends data yet — agent is starting up"}

@app.post("/api/predict_chain")
async def predict_chain(request: AnalyzeRequest, _user=Depends(require_auth)):
    """Predict a cascading chain of market impacts from a geopolitical event."""
    try:
        from agents import predict_event_chain
        chain = await predict_event_chain(request.event_text)
        return chain
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/signals")
async def get_signals(_user=Depends(require_auth)):
    """Return the AI signal accuracy scorecard from DB."""
    try:
        return db.get_signal_scorecard()
    except Exception as e:
        return {"error": str(e)}

# ── Webhook (agents POST here to broadcast to UI) ──

@app.post("/api/webhook/agent_event")
async def agent_event(event: dict):
    """Agents POST their insights here. Broadcasts to all WebSocket clients."""
    # Extract geo events from the news
    new_geo = extract_geo_events(event)
    if new_geo:
        # Persist to DB (deduplication + pruning handled inside)
        db.save_geo_events(new_geo)
        # Refresh in-memory cache
        _geo_cache.clear()
        _geo_cache.extend(db.get_geo_events(limit=200))
        # Broadcast full array to frontend
        await manager.broadcast({"type": "geo_events_update", "events": _geo_cache})

    await manager.broadcast(event)
    return {"status": "broadcasted", "clients": len(manager.active_connections)}


# ── WebSocket ──

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# ── Static Frontend Serving for Render ──
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.exists(frontend_dist):
    # Mount the /assets/ folder where Vite builds JS/CSS
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    @app.get("/{catchall:path}")
    async def serve_react_app(catchall: str):
        """Fallback route for SPA routing: serve index.html for unmatched non-API routes."""
        file_path = os.path.join(frontend_dist, catchall)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

