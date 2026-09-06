# Artillegence AI — Indian Stock Market Intelligence Platform

Autonomous multi-agent system that monitors news, Telegram intel, Google Trends, and economic calendars to generate real-time market insights for Indian stocks.

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.template .env
```

Edit `.env` and set:
- `LLM_PROVIDER=mistral` (or `ollama`, `groq`, `gemini`)
- Required API keys for your chosen provider
- `JWT_SECRET_KEY` — any strong random string

### 3. Run
```bash
python main.py
```

Access:
- API: http://localhost:8000
- Dashboard: http://localhost:3000 (frontend)

---

## LLM Provider Options

Set `LLM_PROVIDER` in `.env` to choose your AI backend:

### Mistral (default)
- Requires `MISTRAL_API_KEY`
- Get key at https://console.mistral.ai/
- Free tier: ~1 request/sec, generous limits

### Ollama (Local — Zero Cost, No Limits) ⭐ Recommended for minimum specs
- Runs entirely on your machine — no API keys needed
- Zero rate limits, zero cost, complete privacy
- **Minimum hardware**: 4GB RAM (runs `phi3:mini` smoothly)
- **Setup**:
  ```bash
  # Install Ollama from https://ollama.ai
  ollama pull phi3:mini
  # For better quality (needs ~6GB RAM):
  ollama pull mistral:7b
  ```
- Set `LLM_PROVIDER=ollama` and `OLLAMA_MODEL=phi3:mini` in `.env`

### Groq (Cloud — Ultra Fast)
- Requires `GROQ_API_KEY`
- Get key at https://console.groq.com/
- Free tier: 30 req/min, 14,400 req/day
- 300+ tokens/sec — fastest cloud inference
- Set `LLM_PROVIDER=groq`

### Gemini (Google — Generous Free Tier)
- Requires `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- Get key at https://aistudio.google.com/app/apikey
- Free tier: 15 RPM, 1M tokens/min
- Set `LLM_PROVIDER=gemini`

### NVIDIA NIM (Cloud — Works on 500MB servers) ⭐ Recommended for low-spec servers
- Requires `NVIDIA_API_KEY`
- Get key at https://build.nvidia.com
- Zero local resource usage — all inference runs on NVIDIA servers
- OpenAI-compatible API, supports vision models for chart analysis
- Free tier available
- Recommended models:
  - `z-ai/glm-5.2` — supports vision, great for chart screenshots
  - `meta/llama-3.2-90b-vision-instruct` — vision-capable
  - `meta/llama-3.1-70b-versatile` — text only
- Set `LLM_PROVIDER=nvidia` and `NVIDIA_MODEL=z-ai/glm-5.2` in `.env`
- Set `VISION_MODEL=z-ai/glm-5.2` for chart analysis

---

## Switching Providers

To switch LLM providers, just change one line in `.env`:
```bash
LLM_PROVIDER=ollama   # local, free, no limits
LLM_PROVIDER=mistral  # cloud, high quality
LLM_PROVIDER=groq     # cloud, ultra fast
LLM_PROVIDER=gemini   # cloud, generous free tier
```

The system automatically maps model names across providers, so no code changes are needed.

---

## Architecture

| Component | Technology |
|-----------|-----------|
| Backend API | FastAPI + WebSocket |
| Frontend | React + Vite + Plotly |
| Database | SQLite (WAL mode) |
| Auth | JWT + bcrypt |
| LLM | Pluggable (Mistral / Ollama / Groq / Gemini) |
| Scraping | feedparser, Scrapling, Playwright, pytrends |
| Live Data | yfinance, Angel One API, NSElib |

## Agents

| Agent | Frequency | Purpose |
|-------|-----------|---------|
| News Scanner | 5 min | Aggregates Bing/Google/CNBC/Moneycontrol/ET feeds |
| Market Analyzer | 30 min | 6-section deep analysis (sentiment, sectors, FII/DII, commodities) |
| Opportunity Finder | 30 min | BUY/AVOID stock opportunities from news |
| Trending Tracker | 15 min | Market movers and trending topics |
| Indian Market Tracker | 10 min | Live Nifty/Sensex/Bank Nifty updates |
| Telegram Scanner | 5 min | Geo-intel from Telegram channels |
| Visual Researcher | 20 min | Autonomous screenshot + vision analysis |
| Google News Scanner | 10 min | Rotating topic-based news briefs |
| Google Trends | 20 min | Search spike detection for sentiment |
| Website Scanner | 60 min | User-added web sources |
| Economic Calendar | 60 min | NSE corporate actions/events |
| Scenario Intelligence | 15 min | IF→THEN investment scenarios |

## Database Schema

- `intelligence_cache` — latest output per agent
- `geo_events` — persistent geo-tagged events for EarthMap
- `signal_log` — AI signal accuracy tracking
- `agent_memory` — rolling context summaries per agent
- `custom_sources` — user-added Telegram/Web sources
- `user_custom_searches` — user watchlist topics
- `stock_research` — async research session logs/reports

## API Endpoints

```
POST /api/auth/login       — JWT login
POST /api/auth/register    — Create user

GET  /api/market/analysis  — Latest market analysis
GET  /api/market/performance — Sector/stock performance
GET  /api/opportunities    — Investment opportunities
GET  /api/trending         — Trending stocks/topics
GET  /api/telegram/status  — Telegram intel feed
GET  /api/news/status      — News scanner output
GET  /api/indian-market    — Indian market tracker
GET  /api/geo/events       — Geo-tagged events for map
GET  /api/economic-calendar — NSE corporate actions
GET  /api/google-trends    — Google Trends intelligence
GET  /api/scenarios        — AI-generated scenarios
GET  /api/signals          — Signal accuracy scorecard

POST /api/analyze_impact   — Geopolitical event → market thesis
POST /api/custom_search    — One-off LLM search + monitoring
POST /api/stock_forecast   — Pattern-matching price forecast
POST /api/stock_analysis   — Full stock thesis with news
POST /api/claude_chart_analysis — Chart screenshot → technical analysis
POST /api/chat             — Multimodal AI chat (vision + text)
POST /api/add_intel_source — Add Telegram/Web to background scanner
POST /api/research/initiate — Start async stock research pipeline

WS   /ws                   — Real-time agent broadcasts
```

## Deployment

### Local Development
```bash
python main.py
```

### Render
- Uses `render.yaml` for web service
- Persistent disk at `/data` for SQLite DB
- Set env vars in Render dashboard

## Troubleshooting

**Ollama not connecting?**
```bash
# Verify Ollama is running
ollama list
# Test API
curl http://localhost:11434/api/tags
```

**Mistral rate limits?**
Switch to `LLM_PROVIDER=ollama` or `LLM_PROVIDER=groq` for free unlimited inference.

**Frontend not loading?**
```bash
cd frontend
npm install
npm run dev
```
