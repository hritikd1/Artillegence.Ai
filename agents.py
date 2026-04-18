import os
import asyncio
import json
import re
import aiohttp
from datetime import datetime
from dotenv import load_dotenv

from core_scrapers import GoogleRSSFeed, GoogleNewsScraper, GOOGLE_NEWS_TOPICS, TelegramChannelScraper, GoogleTrendsScraper
from llm_analyzer import MistralAnalyzer
import database as db

load_dotenv()

MISTRAL_API_KEY = os.getenv('MISTRAL_API_KEY')
MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'

# Dynamic Port for Render internal communication
API_PORT = os.getenv("PORT", "8000")
BASE_API_URL = f"http://localhost:{API_PORT}"

if not MISTRAL_API_KEY:
    print("  [AUTH] WARNING: MISTRAL_API_KEY is missing! Set it in your Render Environment Variables.")

#  Utility 

def strip_markdown(text: str) -> str:
    """Remove markdown formatting from text so the UI displays cleanly."""
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'^[\-\*]{3,}$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\|.*\|$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[\-\s\|]+$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


async def call_mistral(prompt: str, system_msg: str | None = None) -> str:
    """Call Mistral AI. Returns clean plain-text response."""
    default_system = (
        f"Today's date is {datetime.now().strftime('%A, %B %d, %Y')}. "
        "You are an expert Indian stock market analyst. "
        "CRITICAL RULES: "
        "1) Never use markdown formatting like #, ##, **, ---, or tables. "
        "2) Write in clean plain text with numbered lists and line breaks. "
        "3) Be specific about stock names, sectors, and give actionable advice. "
        "4) ONLY analyze based on the news headlines provided. Do NOT make up data or use your training data. "
        "5) Always cite which headline you are referencing."
    )
    try:
        headers = {
            'Authorization': f'Bearer {MISTRAL_API_KEY}',
            'Content-Type': 'application/json'
        }
        payload = {
            'model': 'mistral-large-latest',
            'messages': [
                {'role': 'system', 'content': system_msg or default_system},
                {'role': 'user', 'content': prompt}
            ]
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(MISTRAL_API_URL, headers=headers, json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    raw = data['choices'][0]['message']['content']
                    return strip_markdown(raw)
                else:
                    error = await resp.text()
                    return f"API error ({resp.status}): {error[:200]}"
    except Exception as e:
        return f"Analysis unavailable: {e}"


async def broadcast(event: dict):
    """POST event to FastAPI webhook."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{BASE_API_URL}/api/webhook/agent_event", json=event
            ) as resp:
                if resp.status == 200:
                    print(f"   Broadcasted to dashboard")
    except Exception as e:
        print(f"   Dashboard broadcast error ({BASE_API_URL}): {e}")

async def post_to_api(endpoint: str, payload: dict):
    """Generic helper to post to internal API."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{BASE_API_URL}/api/webhook/agent_event", json=payload
            ) as resp:
                if resp.status == 200:
                    print(f"   Logged {endpoint} successfully")
    except Exception as e:
        print(f"   Failed to log to {endpoint}: {e}")


async def fetch_rss(topics: list, limit=5, hours=6) -> list:
    """Fetch news from multiple RSS topics (Bing RSS). Default: 6 h freshness."""
    articles = []
    for name, query in topics:
        src = GoogleRSSFeed(name=name, source_type="Financial", topic=query)
        try:
            data = await src.fetch_data(limit=limit, hours=hours)
            articles.extend(data)
        except Exception as e:
            print(f"   RSS {name}: {e}")
    return articles


async def fetch_google_news(topics: list, limit=5, hours=6) -> list:
    """Fetch news from Google News RSS (news.google.com). Default: 6 h freshness."""
    articles = []
    for name, query in topics:
        src = GoogleNewsScraper(name=name, source_type="Google News", query=query)
        try:
            data = await src.fetch_data(limit=limit, hours=hours)
            articles.extend(data)
        except Exception as e:
            print(f"   Google News {name}: {e}")
    return articles


async def fetch_google_news_topics(topic_keys: list, limit=10, hours=6) -> list:
    """Fetch from Google News built-in topic sections (top_stories, business, etc.). Default: 6 h."""
    articles = []
    for key in topic_keys:
        src = GoogleNewsScraper(name=key.title(), source_type="Google News", topic_key=key)
        try:
            data = await src.fetch_data(limit=limit, hours=hours)
            articles.extend(data)
        except Exception as e:
            print(f"   Google News topic {key}: {e}")
    return articles


def deduplicate(articles: list) -> list:
    """Remove duplicate articles by title."""
    seen = set()
    out = []
    for a in articles:
        t = a.get('title', '').lower().strip()
        if t and t not in seen:
            seen.add(t)
            out.append(a)
    return out


def make_source_list(articles: list, limit: int = 5) -> list:
    """Build a list of source dicts for the frontend."""
    return [{
        "title": a.get('title', ''),
        "source": a.get('source', 'Google News'),
        "url": a.get('link', ''),
        "image": a.get('image', ''),
    } for a in articles[:limit]]


# 
# Section definitions for Market Analyzer
# 

ANALYSIS_SECTIONS = {
    'market_overview': {
        'prompt': (
            "Based ONLY on the following news headlines, analyze the current sentiment of the Indian stock market. "
            "Structure your response as:\n"
            "SENTIMENT: [Bullish/Bearish/Neutral] with a confidence score from 1-10\n"
            "KEY DRIVERS: List 3-4 main factors driving sentiment right now (cite headlines)\n"
            "MARKET MOOD: A 2-3 sentence summary of market mood\n"
            "RISK LEVEL: [Low/Medium/High] with reasoning\n"
            "Write in plain text only."
        ),
        'terms': ["Indian stock market today", "Sensex Nifty today", "Indian market sentiment"]
    },
    'global_impact': {
        'prompt': (
            "Based ONLY on these headlines, what global events are impacting Indian markets? "
            "You MUST explicitly analyze Commodity & Raw Material trends (Oil, Gold, Metals) "
            "and how they affect the Indian economy. "
            "Structure your response as:\n"
            "GLOBAL IMPACT SCORE: [1-10] how much global events are affecting India\n"
            "KEY EVENTS & RAW MATERIALS: List each event/commodity and its impact on India (cite specific headlines)\n"
            "AFFECTED SECTORS: Which Indian sectors are most affected and why\n"
            "OUTLOOK: Short-term impact assessment\n"
            "Write in plain text only."
        ),
        'terms': ["global markets impact India", "crude oil price impact India", "gold and metal prices India stock market", "US Fed India stocks"]
    },
    'sectoral_analysis': {
        'prompt': (
            "Based ONLY on these headlines, rate each Indian sector's current performance on a scale of 1-10. "
            "You MUST include these sectors with a score:\n"
            "IT: [score]/10 - [1 line reason citing headline]\n"
            "Banking: [score]/10 - [1 line reason]\n"
            "Pharma: [score]/10 - [1 line reason]\n"
            "Auto: [score]/10 - [1 line reason]\n"
            "Energy: [score]/10 - [1 line reason]\n"
            "FMCG: [score]/10 - [1 line reason]\n"
            "Infrastructure: [score]/10 - [1 line reason]\n"
            "Metals: [score]/10 - [1 line reason]\n"
            "Then give 2-3 lines of overall sector analysis.\n"
            "Write in plain text only."
        ),
        'terms': ["Indian IT sector stocks", "Indian banking sector", "pharma auto energy India stocks"]
    },
    'fii_dii_data': {
        'prompt': (
            "Based ONLY on these headlines, analyze institutional investor activity. "
            "Structure:\n"
            "FII STANCE: [Buying/Selling/Mixed] - estimated flow direction\n"
            "DII STANCE: [Buying/Selling/Mixed] - estimated flow direction\n"
            "NET FLOW: Overall institutional money direction\n"
            "IMPACT: How this affects retail investors (cite headlines)\n"
            "SECTORS IN FOCUS: Where institutions are putting money\n"
            "Write in plain text only."
        ),
        'terms': ["FII DII data India today", "foreign institutional investors India", "mutual fund inflows India"]
    },
    'raw_materials': {
        'prompt': (
            "Based ONLY on these headlines, analyze commodity and raw material trends. "
            "For each major commodity, give direction:\n"
            "Crude Oil: [Up/Down/Stable] - impact on India\n"
            "Gold: [Up/Down/Stable] - impact\n"
            "Steel/Metals: [Up/Down/Stable] - impact\n"
            "Agricultural: [Up/Down/Stable] - impact\n"
            "Then 2-3 lines on which Indian stocks benefit or suffer.\n"
            "Write in plain text only."
        ),
        'terms': ["commodity prices India", "crude oil price impact India", "metal prices India"]
    },
    'company_performance': {
        'prompt': (
            "Based ONLY on these headlines, which companies are in the news for positive/negative reasons? "
            "List top 5 companies mentioned with:\n"
            "Company: [Action: Positive/Negative] - reason from headline\n"
            "Then 2-3 lines about overall corporate earnings trends.\n"
            "Write in plain text only."
        ),
        'terms': ["Indian company results quarterly", "stock picks India", "company performance India"]
    },
}


# 
# AGENT 1: News Scanner (every 5 min)
# 

async def news_scanner_cycle():
    print("\n [NEWS SCANNER] Starting cycle...")

    topics = [
        ("Stock Market", "Indian stock market today"),
        ("Economy", "India economy news"),
        ("Banking", "India banking RBI"),
        ("IT Tech", "India IT technology stocks"),
        ("Energy", "crude oil India energy"),
        ("Pharma", "pharma stocks India"),
        ("Auto", "automobile stocks India"),
        ("Infra", "infrastructure stocks India"),
        ("Global", "global markets impact"),
    ]

    # Fetch from both Bing RSS and Google News RSS, then merge
    bing_articles = await fetch_rss(topics, limit=5, hours=6)
    gn_articles = await fetch_google_news(topics[:5], limit=5, hours=6)
    gn_top = await fetch_google_news_topics(["top_stories", "business"], limit=8, hours=6)
    all_articles = bing_articles + gn_articles + gn_top
    unique = deduplicate(all_articles)[:25]

    if not unique:
        print("   No articles found")
        return

    headlines = "\n".join([f"- {a['title']} ({a.get('source', 'Unknown')})" for a in unique])

    prompt = f"""Here are {len(unique)} recent financial news headlines. Write a market summary covering:

1) What is happening in the markets right now (reference specific headlines)
2) Which sectors are being impacted and why
3) Overall market sentiment (bullish/bearish/mixed)
4) 3 key things investors should watch

Headlines:
{headlines}

IMPORTANT: Only reference information from these headlines. Do not use your training data. Write in plain text, no markdown."""

    summary = await call_mistral(prompt)

    news_items = [{
        "title": a['title'],
        "source": a.get('source', 'Google News'),
        "url": a.get('link', ''),
        "snippet": a.get('snippet', '')[:120],
        "image": a.get('image', ''),
        "timestamp": a.get('timestamp', datetime.now().isoformat())
    } for a in unique[:15]]

    payload = {
        "agent": "news_scanner",
        "title": "Market Update",
        "summary": summary,
        "news_items": news_items,
        "timestamp": datetime.now().isoformat()
    }
    await broadcast(payload)
    # Persist to DB
    db.save_intelligence("news_scanner", payload)

    print(f"   [NEWS SCANNER] {len(unique)} articles  summary broadcasted & saved to DB")


# 
# AGENT 2: Market Analyzer (every 2 hr)
# 

async def market_analyzer_cycle():
    print("\n [MARKET ANALYZER] Starting comprehensive analysis...")

    results = {}

    for section_name, section_data in ANALYSIS_SECTIONS.items():
        display_name = section_name.replace('_', ' ').title()
        print(f"   {display_name}...")

        articles = await fetch_rss(
            [(display_name, t) for t in section_data['terms']],
            limit=5, hours=8   # Market analyzer runs every 30 min  8 h is safe
        )

        if not articles:
            print(f"     No data, skipping")
            continue

        news_text = "\n".join([
            f"- {a['title']} (Source: {a.get('source', 'Unknown')})"
            for a in articles[:10]
        ])

        prompt = f"""{section_data['prompt']}

News headlines to analyze:
{news_text}

IMPORTANT: Base your analysis ONLY on these headlines. Cite the headline you are referencing."""

        analysis = await call_mistral(prompt)
        sources = make_source_list(articles, limit=5)

        results[section_name] = {
            'timestamp': datetime.now().isoformat(),
            'analysis': analysis,
            'news_count': len(articles),
            'sources': sources,
        }

        # Append section result to agent memory
        db.append_agent_memory("market_analyzer", f"{section_name}: {analysis[:400]}")

        await broadcast({
            "agent": "market_analyzer",
            "title": f"Market Analysis: {display_name}",
            "section": section_name,
            "summary": analysis[:1500],
            "sources": sources,
            "news_count": len(articles),
            "timestamp": datetime.now().isoformat()
        })

        await asyncio.sleep(2)

    # Save full results to DB (replaces market_analysis.json)
    if results:
        db.save_intelligence("market_analyzer_full", results)


    print(f"   [MARKET ANALYZER] Completed {len(results)} sections, saved to DB")


# 
# AGENT 3: Opportunity Finder (every 2 hr)
# 

async def opportunity_finder_cycle():
    print("\n [OPPORTUNITY FINDER] Searching...")

    topics = [
        ("Undervalued", "undervalued stocks India"),
        ("Breakout", "breakout stocks India"),
        ("Growth", "high growth companies India"),
        ("Small Cap", "small cap mid cap stocks India"),
        ("IPO", "upcoming IPO India 2026"),
    ]

    articles = await fetch_rss(topics, limit=5, hours=6)
    unique = deduplicate(articles)[:15]


    headlines = "\n".join([f"- {a['title']}" for a in unique])

    # Inject memory context before generating analysis
    memory_ctx = db.build_memory_context("opportunity_finder")
    prompt = f"""Based on these news headlines and market context, identify TOP 5 INVESTMENT OPPORTUNITIES.
{memory_ctx}
News:
{headlines}

Market Context:
{market_ctx[:1000]}

For each opportunity:
1. Stock/Company Name (specific like "HDFC Bank", "Tata Motors")
2. Action: BUY / ACCUMULATE / WATCH
3. Reasoning citing the headline
4. Risk Level: Low / Medium / High
5. Time Horizon

Also name ONE stock to AVOID.

IMPORTANT: Only cite information from these headlines. Write in plain text only."""

    analysis = await call_mistral(prompt)
    db.append_agent_memory("opportunity_finder", analysis[:600])
    sources = make_source_list(unique, limit=5)

    await broadcast({
        "agent": "opportunity_finder",
        "title": "Investment Opportunities Found",
        "summary": analysis[:2000],
        "sources": sources,
        "source_count": len(unique),
        "timestamp": datetime.now().isoformat()
    })


    print("   [OPPORTUNITY FINDER] Complete")


# 
# AGENT 4: Trending Tracker (every 15 min)
# 

async def trending_tracker_cycle():
    print("\n [TRENDING TRACKER] Scanning trends...")

    topics = [
        ("Market Today", "stock market India today"),
        ("Top Stocks", "top stocks India"),
        ("Market Movers", "stocks gainers losers India"),
        ("IPO News", "IPO India news"),
        ("Breaking", "breaking news stock market India"),
        ("Nifty", "Nifty 50 today"),
        ("Sensex", "Sensex today"),
    ]

    bing_articles = await fetch_rss(topics, limit=6, hours=6)
    gn_articles = await fetch_google_news(topics[:4], limit=6, hours=6)
    articles = bing_articles + gn_articles
    unique = deduplicate(articles)[:15]

    if not unique:
        # Fallback: try broader terms
        print("   No trending data from first pass, trying broader terms...")
        fallback_topics = [
            ("Market", "India market"),
            ("Stocks", "stocks India"),
            ("Business", "business news India"),
        ]
        articles = await fetch_rss(fallback_topics, limit=8, hours=8)  # fallback: slightly wider window
        unique = deduplicate(articles)[:15]

    if not unique:
        print("   No trending data found even with fallback")
        await broadcast({
            "agent": "trending_tracker",
            "title": "Trending  Waiting for Data",
            "summary": "The trending tracker is waiting for fresh market news. This section will update automatically when new stories come in.",
            "trending_items": [],
            "timestamp": datetime.now().isoformat()
        })
        return

    headlines = "\n".join([f"- {a['title']} ({a.get('source', 'Unknown')})" for a in unique])

    # Inject memory context
    memory_ctx = db.build_memory_context("trending_tracker")
    prompt = f"""Based on these headlines, identify what is TRENDING in the market right now.
{memory_ctx}
Headlines:
{headlines}

Write your response covering:
1) TOP 3 TRENDING TOPICS  what everyone is talking about (cite the headlines)
2) TRENDING STOCKS  which stocks are making moves and why
3) MARKET MOVERS  biggest gainers and losers
4) TREND OUTLOOK  which trends could have lasting impact

IMPORTANT: Only reference these headlines. Write in plain text, no markdown."""

    analysis = await call_mistral(prompt)
    db.append_agent_memory("trending_tracker", analysis[:600])

    trending_items = [{
        "title": a['title'],
        "source": a.get('source', 'Google News'),
        "url": a.get('link', ''),
        "image": a.get('image', ''),
        "timestamp": a.get('timestamp', datetime.now().isoformat())
    } for a in unique[:10]]

    payload = {
        "agent": "trending_tracker",
        "title": "What's Trending Now",
        "summary": analysis[:2000],
        "trending_items": trending_items,
        "timestamp": datetime.now().isoformat()
    }
    await broadcast(payload)
    db.save_intelligence("trending_tracker", payload)


    print(f"   [TRENDING TRACKER] {len(unique)} items found, saved to DB")


# 
# AGENT 5: Indian Market Tracker (every 10 min)
# 

async def indian_market_tracker_cycle():
    print("\n [INDIAN MARKET TRACKER] Tracking...")

    topics = [
        ("Nifty", "Nifty 50 today"),
        ("Sensex", "Sensex today"),
        ("Bank Nifty", "Bank Nifty today"),
        ("FII", "FII buying selling India today"),
        ("Stock Moves", "stocks big moves India today"),
        ("Rupee", "Indian rupee dollar"),
    ]

    bing_articles = await fetch_rss(topics, limit=5, hours=4)
    gn_articles = await fetch_google_news(topics, limit=5, hours=4)
    gn_india = await fetch_google_news_topics(["india", "business"], limit=6, hours=4)
    articles = bing_articles + gn_articles + gn_india
    unique = deduplicate(articles)[:20]

    if not unique:
        print("   No Indian market data found")
        return

    headlines = "\n".join([f"- {a['title']} ({a.get('source', 'Unknown')})" for a in unique])

    # Inject memory context
    memory_ctx = db.build_memory_context("indian_market_tracker")
    prompt = f"""Based on these headlines, give a live Indian market update.
{memory_ctx}
{headlines}

Structure:
MARKET SNAPSHOT: Nifty/Sensex direction and key levels (cite headlines)
STOCKS IN FOCUS: 5 specific stocks making moves (cite headlines)
SECTOR HEAT: Which sectors are hot (green) and cold (red)
FII/DII: Institutional activity
RUPEE: Currency movement

IMPORTANT: Only cite these headlines. Write in plain text, no markdown."""

    analysis = await call_mistral(prompt)
    db.append_agent_memory("indian_market_tracker", analysis[:600])
    sources = make_source_list(unique, limit=5)

    market_items = [{
        "title": a['title'],
        "source": a.get('source', 'Google News'),
        "url": a.get('link', ''),
        "image": a.get('image', ''),
        "timestamp": a.get('timestamp', datetime.now().isoformat())
    } for a in unique[:10]]

    payload = {
        "agent": "indian_market_tracker",
        "title": "Indian Market Live Update",
        "summary": analysis[:2000],
        "sources": sources,
        "market_items": market_items,
        "timestamp": datetime.now().isoformat()
    }
    await broadcast(payload)
    db.save_intelligence("indian_market_tracker", payload)


    print(" [INDIAN MARKET TRACKER] Complete, saved to DB")


# 
# AGENT 6: Telegram Scanner (Provides raw events to extraction webhook)
# 
async def telegram_scanner_cycle():
    print("\n [TELEGRAM RAW SCANNER] Fetching live intel...")
    try:
        channels = ["CIG_telegram", "idfofficial", "rnintel", "QudsNen", "wfwitness"]
        all_tg_data = []
        for ch in channels:
            try:
                tg_scraper = TelegramChannelScraper(name=ch, source_type="Telegram Intelligence", channel_slug=ch)
                data = await tg_scraper.fetch_data(limit=10, hours=6)
                if data:
                    all_tg_data.extend(data)
            except Exception as e:
                print(f"   Error scraping {ch}: {e}")
                
        # Sort by timestamp descending to get the absolute newest intel across all channels
        all_tg_data.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        tg_data = all_tg_data[:25]  # Keep to 25 absolute latest so Mistral doesn't timeout
        
        if not tg_data:
            print("   No Telegram data found")
            return
            
        news_items = [{
            "title": a['title'],
            "source": a.get('source', 'Telegram'),
            "url": a.get('link', ''),
            "snippet": a.get('snippet', '')[:200],
            "image": a.get('image', ''),
            "telegram_post_id": a.get('telegram_post_id', ''),
            "timestamp": a.get('timestamp', datetime.now().isoformat())
        } for a in tg_data]
        
        # Package posts into a minimal JSON array for Mistral
        posts_for_ai = [{"id": a.get('telegram_post_id', ''), "text": a.get('snippet', '')} for a in tg_data if a.get('telegram_post_id')]
        posts_json_str = json.dumps(posts_for_ai)
        
        analyzer = MistralAnalyzer()
        geo_data_raw = await analyzer.extract_locations(posts_json_str)
        
        mistral_data = {"results": []}
        if geo_data_raw:
            try:
                clean_json = geo_data_raw.replace('```json', '').replace('```', '').strip()
                mistral_data = json.loads(clean_json)
            except Exception as e:
                print(f"   Error parsing Mistral JSON: {e}")
                
        # To maintain backwards compatibility of the payload (or if needed), we could join snippets as summary
        combined_text = " | ".join([a.get('snippet', '') for a in tg_data])
        
        event_payload = {
            "agent": "telegram_scanner",
            "title": "Telegram Intel Feed Update",
            "summary": combined_text,
            "news_items": news_items,
            "mistral_analysis": mistral_data,
            "timestamp": datetime.now().isoformat()
        }
        await broadcast(event_payload)
        db.save_intelligence("telegram_scanner", event_payload)


        print(f"   [TELEGRAM RAW SCANNER] {len(tg_data)} intel messages broadcasted & saved to DB")
    except Exception as e:
        print(f" Telegram pipeline error: {e}")

async def visual_research_cycle():
    """Autonomous Visual Web Researcher"""
    print("\n[VISUAL RESEARCH] Launching autonomous web scrape...")
    try:
        from core_scrapers import GoogleRSSFeed, WebScraper
        from claude_agent import MistralVisionAgent
        
        # 1. Find a trending news URL (using BingRSS)
        rss = GoogleRSSFeed("Top Global Finance", "rss", "global financial markets trending OR crisis OR massive profit", country="US")
        articles = await rss.fetch_data(limit=1, hours=4)
        if not articles:
            print("[VISUAL RESEARCH] No trending URLs found.")
            return
            
        target_article = articles[0]
        url = target_article.get('link', target_article.get('url', ''))
        print(f"[VISUAL RESEARCH] Found target: {url}")
        
        # 2. Capture Screenshot
        print("[VISUAL RESEARCH] Initiating headless screenshot...")
        image_b64 = await WebScraper.capture_screenshot(url)
        if not image_b64:
            print("[VISUAL RESEARCH] Screenshot capture failed.")
            return
            
        # 3. Analyze with Groq
        print("[VISUAL RESEARCH] Analyzing screenshot layout via Vision...")
        vision_agent = MistralVisionAgent()
        analysis = await vision_agent.analyze_web_screenshot(image_b64)
        summary = analysis.get("summary", target_article['snippet'])
        
        # 4. Post explicit synthetic payload to api logs
        payload = {
            "agent": "visual_researcher",
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "news_items": [
                {
                    "title": target_article['title'],
                    "snippet": summary,
                    "url": url,
                    "image_base64": image_b64,
                    "source": "Autonomous Vision Agent"
                }
            ],
            "message": f"Successfully captured visual intelligence for {url}"
        }
        await post_to_api("api_logs", payload)
        print(f"[VISUAL RESEARCH] Intelligence logged to EarthMap.")
    except Exception as e:
        print(f" Visual Research Error: {e}")

# 
# AGENT 7: Google News Scanner (every 10 min)
# Rotates through GOOGLE_NEWS_TOPICS list
# 

# Track which batch of topics to query next (rotates across cycles)
_gn_batch_index = 0

async def google_news_scanner_cycle():
    """Dedicated Google News agent that rotates through the master topic list."""
    global _gn_batch_index
    print("\n [GOOGLE NEWS SCANNER] Starting cycle...")

    batch_size = 8  # topics per cycle to avoid rate-limiting
    topics = GOOGLE_NEWS_TOPICS
    start = _gn_batch_index % len(topics)
    batch = topics[start:start + batch_size]
    if len(batch) < batch_size:
        batch += topics[:batch_size - len(batch)]  # wrap around
    _gn_batch_index += batch_size

    print(f"   Topics this cycle: {[t[0] for t in batch]}")

    # Also grab Google News built-in sections (all categories from homepage)
    gn_search = await fetch_google_news(batch, limit=8, hours=6)
    gn_sections = await fetch_google_news_topics(
        ["top_stories", "business", "india", "technology", "world", "entertainment", "sports", "science", "health", "local"],
        limit=8, hours=6
    )
    all_articles = gn_search + gn_sections
    unique = deduplicate(all_articles)[:25]

    if not unique:
        print("   No Google News articles found")
        return

    headlines = "\n".join([f"- {a['title']} ({a.get('source', 'Unknown')})" for a in unique])

    prompt = f"""Here are {len(unique)} headlines from Google News India.
Write a comprehensive market intelligence brief covering:

1) TOP HEADLINES  The 5 most important stories right now and why they matter (cite headlines)
2) MARKET IMPACT  How these stories affect the Indian stock market and key sectors
3) SECTOR SPOTLIGHT  Which sectors are in focus based on these headlines
4) INVESTOR ACTION ITEMS  3 specific things investors should do right now
5) RISK ALERTS  Any warnings or risks mentioned in the headlines

Headlines:
{headlines}

IMPORTANT: Only reference information from these headlines. Write in plain text, no markdown."""

    summary = await call_mistral(prompt)

    news_items = [{
        "title": a['title'],
        "source": a.get('source', 'Google News'),
        "url": a.get('link', ''),
        "snippet": a.get('snippet', '')[:150],
        "image": a.get('image', ''),
        "timestamp": a.get('timestamp', datetime.now().isoformat())
    } for a in unique[:15]]

    await broadcast({
        "agent": "google_news_scanner",
        "title": "Google News India Brief",
        "summary": summary,
        "news_items": news_items,
        "topics_queried": [t[0] for t in batch],
        "timestamp": datetime.now().isoformat()
    })


    print(f"   [GOOGLE NEWS SCANNER] {len(unique)} articles  brief broadcasted")


# 
# AGENT 9: Google Trends Tracker (every 20 min)
# Detects unusual search spikes for stocks
# 

_trends_batch_index = 0

async def google_trends_tracker_cycle():
    """Track Google search interest spikes for stocks  alternative data signal."""
    global _trends_batch_index
    print("\n [GOOGLE TRENDS] Scanning search interest...")

    scraper = GoogleTrendsScraper()

    # Rotate through keywords in batches of 5
    all_kw = scraper.keywords
    batch_size = 5
    start = _trends_batch_index % len(all_kw)
    batch = all_kw[start:start + batch_size]
    if len(batch) < batch_size:
        batch += all_kw[:batch_size - len(batch)]
    _trends_batch_index += batch_size

    print(f"   Keywords this cycle: {batch}")

    # 1. Fetch interest data for the batch
    interest_data = await scraper.fetch_interest(keywords=batch)

    # 2. Fetch today's trending searches in India
    trending_searches = await scraper.fetch_trending_searches()

    # 3. Identify spikes (ratio >= 1.8x)
    spikes = [d for d in interest_data if d.get('is_spiking')]

    # 4. If there are spikes, get AI analysis
    summary = ""
    if interest_data:
        spike_text = "\n".join([
            f"- {d['keyword']}: Interest {d['current_interest']}/100 (avg {d['avg_interest']})  {d['spike_ratio']}x {' SPIKE!' if d['is_spiking'] else ''} [{d['trend_direction']}]"
            for d in interest_data
        ])
        trending_text = "\n".join([
            f"- #{t['rank']}: {t['term']}"
            for t in trending_searches[:10]
        ])

        prompt = f"""You are analyzing Google search trends in India. Search interest spikes often precede big stock moves.

STOCK SEARCH INTEREST (current vs 7-day average):
{spike_text}

TOP TRENDING SEARCHES IN INDIA TODAY:
{trending_text}

Based on this data:
1) SPIKE ALERTS  Which stocks have unusual search interest and what might it indicate?
2) TRENDING ANALYSIS  Are any trending searches related to markets/stocks? What could they mean?
3) INVESTOR SIGNAL  What should investors watch based on these search patterns?
4) PREDICTION  Which stocks might see big moves based on search interest alone?

IMPORTANT: Only reference the data provided. Write in plain text, no markdown."""

        summary = await call_mistral(prompt)

    # Build trending items for the frontend
    trend_items = [{
        "keyword": d['keyword'],
        "current_interest": d['current_interest'],
        "avg_interest": d['avg_interest'],
        "spike_ratio": d['spike_ratio'],
        "is_spiking": d['is_spiking'],
        "trend_direction": d['trend_direction'],
    } for d in interest_data]

    trending_list = [{
        "term": t['term'],
        "rank": t['rank'],
    } for t in trending_searches[:15]]

    payload = {
        "agent": "google_trends_tracker",
        "title": "Google Trends Intelligence",
        "summary": summary or "Collecting search trend data...",
        "trend_items": trend_items,
        "trending_searches": trending_list,
        "spike_count": len(spikes),
        "keywords_scanned": batch,
        "timestamp": datetime.now().isoformat()
    }

    await broadcast(payload)
    db.save_intelligence("google_trends_tracker", payload)


    print(f"   [GOOGLE TRENDS] {len(interest_data)} keywords tracked, {len(spikes)} spikes detected, saved to DB")


# 
# FEATURE: Event Chain Prediction Engine
# 

async def predict_event_chain(event_text: str) -> dict:
    """Given a geopolitical/market event, predict a cascading chain of impacts."""
    prompt = f"""You are an elite geopolitical-financial strategist. Analyze this event and predict a CHAIN of cascading market impacts.

EVENT: {event_text}

Return your analysis as a JSON object with this EXACT structure:
{{
    "event": "<1-line summary of the trigger event>",
    "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    "chain": [
        {{
            "step": 1,
            "impact": "<What happens as a direct result>",
            "affected": "<Specific commodity/sector/index affected>",
            "direction": "UP" | "DOWN" | "VOLATILE",
            "magnitude": "<estimated % move or qualitative: 'significant', 'moderate', 'minor'>",
            "probability": "<HIGH/MEDIUM/LOW>",
            "timeframe": "<immediate/1-3 days/1-2 weeks/1 month>"
        }},
        {{
            "step": 2,
            "impact": "<Second-order effect from step 1>",
            "affected": "<specific stocks or sectors>",
            "direction": "UP" | "DOWN" | "VOLATILE",
            "magnitude": "<>",
            "probability": "<>",
            "timeframe": "<>"
        }}
    ],
    "indian_stocks_affected": [
        {{"name": "<Stock Name>", "ticker": "<NSE ticker>", "impact": "POSITIVE" | "NEGATIVE", "reason": "<1 line>"}}
    ],
    "hedge_suggestion": "<1-2 sentences on how to protect against this scenario>",
    "overall_market_impact": "BULLISH" | "BEARISH" | "NEUTRAL"
}}

Generate 4-6 chain steps showing the cascading effects. Be specific about Indian stocks.
Return ONLY valid JSON. No markdown fences."""

    system_msg = (
        "You are a JSON-only response bot. You must return valid JSON with no extra text, "
        "no markdown, no code fences. Just raw JSON."
    )

    try:
        raw = await call_mistral(prompt, system_msg=system_msg)
        # Try to parse as JSON
        clean = raw.strip()
        if clean.startswith('```'):
            clean = clean.split('\n', 1)[1] if '\n' in clean else clean[3:]
            clean = clean.rsplit('```', 1)[0]
        chain_data = json.loads(clean)
        chain_data['generated_at'] = datetime.now().isoformat()
        return chain_data
    except json.JSONDecodeError:
        # Fallback: return the raw text as a summary
        return {
            "event": event_text[:200],
            "severity": "MEDIUM",
            "chain": [],
            "indian_stocks_affected": [],
            "hedge_suggestion": raw[:500] if raw else "Analysis unavailable.",
            "overall_market_impact": "NEUTRAL",
            "raw_analysis": raw,
            "generated_at": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "event": event_text[:200],
            "error": str(e),
            "generated_at": datetime.now().isoformat()
        }


# 
# FEATURE: AI Signal Accuracy Tracker
# 

SIGNAL_LOG_FILE = 'signal_log.json'

def _load_signals() -> list:
    """Kept for backward compat  now reads from DB."""
    return []

def _save_signals(signals: list):
    """Kept for backward compat  DB handles persistence now."""
    pass

def log_signal(agent: str, signal_type: str, target: str, direction: str, confidence: str, reasoning: str = ""):
    """Log an AI-generated signal  delegates to DB layer."""
    db.log_signal(agent, signal_type, target, direction, confidence, reasoning)


def get_signal_scorecard() -> dict:
    """Calculate Oracle's overall signal accuracy  delegates to DB layer."""
    return db.get_signal_scorecard()


# 
# Agent Status Tracking & Loops
# 

agent_status = {
    "news_scanner":           {"status": "idle", "last_run": None, "cycle_count": 0},
    "market_analyzer":        {"status": "idle", "last_run": None, "cycle_count": 0},
    "opportunity_finder":     {"status": "idle", "last_run": None, "cycle_count": 0},
    "trending_tracker":       {"status": "idle", "last_run": None, "cycle_count": 0},
    "indian_market_tracker":  {"status": "idle", "last_run": None, "cycle_count": 0},
    "telegram_scanner":       {"status": "idle", "last_run": None, "cycle_count": 0},
    "visual_researcher":      {"status": "idle", "last_run": None, "cycle_count": 0},
    "google_news_scanner":    {"status": "idle", "last_run": None, "cycle_count": 0},
    "google_trends_tracker":  {"status": "idle", "last_run": None, "cycle_count": 0},
}

def get_agent_status():
    return agent_status

async def run_agent_loop(name: str, fn, interval_min: int):
    global agent_status
    await asyncio.sleep(5)
    while True:
        try:
            agent_status[name]["status"] = "active"
            await fn()
            agent_status[name]["last_run"] = datetime.now().isoformat()
            agent_status[name]["cycle_count"] += 1
            agent_status[name]["status"] = "idle"
        except Exception as e:
            print(f" [{name.upper()}] Error: {e}")
            agent_status[name]["status"] = "error"
        print(f" [{name.upper()}] Next in {interval_min} min...")
        await asyncio.sleep(interval_min * 60)

async def start_all_agents():
    # Slightly offset the runtimes so we don't hit mistral/telegram rate limits at exactly the same time
    await asyncio.gather(
        run_agent_loop("news_scanner",            news_scanner_cycle,            interval_min=5),
        run_agent_loop("market_analyzer",         market_analyzer_cycle,         interval_min=30),
        run_agent_loop("opportunity_finder",      opportunity_finder_cycle,      interval_min=30),
        run_agent_loop("trending_tracker",        trending_tracker_cycle,        interval_min=15),
        run_agent_loop("indian_market_tracker",   indian_market_tracker_cycle,   interval_min=10),
        run_agent_loop("telegram_scanner",        telegram_scanner_cycle,        interval_min=5),
        run_agent_loop("visual_researcher",       visual_research_cycle,         interval_min=20),
        run_agent_loop("google_news_scanner",     google_news_scanner_cycle,     interval_min=10),
        run_agent_loop("google_trends_tracker",   google_trends_tracker_cycle,   interval_min=20),
    )
