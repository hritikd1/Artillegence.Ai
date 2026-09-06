import os
from dotenv import load_dotenv
import aiohttp
import asyncio
import database as db
from datetime import datetime
import time
import json
import re

from llm_providers import get_llm_provider, LLMProvider

load_dotenv()

# Global provider singleton — initialized once on first use
_provider: LLMProvider | None = None
_provider_lock = asyncio.Lock()


async def get_provider() -> LLMProvider:
    global _provider
    if _provider is None:
        async with _provider_lock:
            if _provider is None:
                _provider = get_llm_provider()
    return _provider


# Global rate limiter to ensure we do not exceed 30 RPM and 1000 RPD for free tier LLMs
_llm_rate_limit_lock = asyncio.Lock()
_last_llm_call_time = 0.0
_USAGE_FILE = "scratch/llm_usage.json"

def _check_daily_limit():
    import json
    from datetime import date
    today = str(date.today())
    usage = 0
    
    if os.path.exists(_USAGE_FILE):
        try:
            with open(_USAGE_FILE, "r") as f:
                data = json.load(f)
                if data.get("date") == today:
                    usage = data.get("count", 0)
        except Exception:
            pass
            
    if usage >= 1000:
        return False
        
    usage += 1
    os.makedirs(os.path.dirname(_USAGE_FILE), exist_ok=True)
    with open(_USAGE_FILE, "w") as f:
        json.dump({"date": today, "count": usage}, f)
    return True

# Backward-compatible aliases used across the codebase
async def call_mistral_raw(payload: dict, retries=5) -> dict | None:
    global _last_llm_call_time
    
    if not _check_daily_limit():
        print("   [LLM] Daily limit of 1000 requests reached. Denying request.")
        return {"error": "Daily quota (1000 RPD) reached."}
    
    provider = await get_provider()
    messages = payload.get("messages", [])
    model = payload.get("model")
    temperature = payload.get("temperature", 0.7)
    max_tokens = payload.get("max_tokens")
    response_format = payload.get("response_format")
    
    async with _llm_rate_limit_lock:
        now = time.time()
        elapsed = now - _last_llm_call_time
        if elapsed < 2.1:
            await asyncio.sleep(2.1 - elapsed)
        
        result = await provider.chat(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_format,
            retries=retries,
        )
        _last_llm_call_time = time.time()
        return result


async def call_nvidia_minimax_raw(payload: dict, retries=3) -> dict | None:
    """Deprecated: use provider system instead. Kept for backward compat."""
    return await call_mistral_raw(payload, retries=retries)

class MistralAnalyzer:
    """Handles analysis of relevant signals using the configured LLM provider."""
    def __init__(self):
        pass
    
    async def analyze_signal(self, text, context=None, retries=5):
        """Analyze a signal with the configured LLM provider."""
        system_prompt = f'''
        Today's date is {datetime.now().strftime('%A, %B %d, %Y')}.
        You are an economic intelligence analyst specializing in Indian markets. 
        Analyze the given information and provide exactly these sections with these exact headings:
        
        4. TACTICAL ACTION PLAN: Specific, data-driven trade setup (Entry, Target, Stop Loss) if applicable to Indian markets. For general news, suggest a portfolio hedging strategy (e.g. "Buy NIFTY Puts", "Increase Cash").
        5. CONFIDENCE: Rate your confidence (Low/Medium/High)
        '''
        
        user_message = f"Context: {context if context else 'None'}\n\nText to analyze: {text}"
        
        payload = {
            'model': 'mistral-large-latest',
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message}
            ]
        }
        
        res = await call_mistral_raw(payload, retries=retries)
        if isinstance(res, dict):
            if 'choices' in res:
                return res['choices'][0]['message']['content']
        return "Analysis timed out."

    async def extract_locations(self, posts_json_str):
        """Extract explicit geographical locations per telegram post using Mistral"""
        system_prompt = '''
        You are a geopolitical intelligence analyst. Your objective is to extract geographical locations explicitly or implicitly mentioned in the provided JSON array of Telegram posts.
        Return ONLY a valid JSON object with this exact structure, mapping each post "id" exactly as provided in the input array to its extracted "locations".
        Do not summarize.
        {
            "results": [
                {
                    "id": "<USE THE EXACT MATCHING ID FROM INPUT JSON>",
                    "locations": [
                        {"name": "Specific City or Region Name", "lat": 12.3456, "lng": 56.7890}
                    ]
                }
            ]
        }
        CRITICAL RULES:
        1. The "id" MUST exactly match the "id" of the post you extracted the location from. Do NOT invent IDs or copy this example!
        2. You MUST estimate highly precise latitude and longitude coordinates. Do not just use generic country centers if a city, town, or base is mentioned. Use 4 decimal places for accuracy.
        3. You MUST deduce the region or country of militant groups if no city is named. For example, if Hezbollah is mentioned, add Lebanon/Israel border. If Houthis are mentioned, add Yemen/Red Sea. If IDF is mentioned, add Israel/Gaza.
        4. Only include an object in the "results" array if you found at least one location for that post. I expect you to find locations for at least half of the posts!
        '''
        
        payload = {
            'model': 'mistral-large-latest',
            'max_tokens': 8192,
            'response_format': {"type": "json_object"},
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': f"Posts to analyze: {posts_json_str}"}
            ]
        }
        
        res = await call_mistral_raw(payload, retries=5)
        if isinstance(res, dict) and 'choices' in res:
            return res['choices'][0]['message']['content']
        return None

    async def analyze_event_market_impact(self, event_text: str):
        """Analyze a specific geopolitical event and predict market impacts using Mistral"""
        system_prompt = f'''
        Today's date is {datetime.now().strftime('%A, %B %d, %Y')}.
        You are an elite geopolitical financial analyst at a top-tier hedge fund. 
        Analyze the provided intelligence report and rapidly deduce its highly specific impact on global markets.
        
        Output your thesis exactly in the following markdown format:
        **OVERVIEW:** (1-2 sentences summarizing the core event and immediate risk factor)
        
        **COMMODITY IMPACT:** (Identify 1-2 specific commodities like Brent Crude, Gold, Wheat, Copper that will react. Explain why.)
        
        **REGIONAL EQUITIES:** (Identify which global or regional stock indices/sectors will see volatility. Example: "Defense contractors (LMT, RTX) likely to surge. European airlines face headwinds.")
        
        **POSITIONING BIAS:** (Declare a clear LONG or SHORT bias on a specific linked asset based on this intel, with a brief hedge warning.)
        '''
        
        payload = {
            'model': 'mistral-large-latest',
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': f"INTELLIGENCE REPORT:\n{event_text}"}
            ]
        }
        
        res = await call_mistral_raw(payload, retries=5)
        if isinstance(res, dict) and 'choices' in res:
            return res['choices'][0]['message']['content']
        return "Analysis temporarily unavailable due to API error."

    async def _scrape_news_for_symbol(self, symbol: str) -> list[dict]:
        """Scrape latest news headlines for a stock symbol from Google News RSS."""
        # Strip exchange prefix (NSE:RELIANCE -> RELIANCE)
        ticker = symbol.split(":")[-1] if ":" in symbol else symbol
        query = ticker.replace("-", " ")
        url = f"https://news.google.com/rss/search?q={query}+stock+share+price&hl=en-IN&gl=IN&ceid=IN:en"
        news_items = []
        try:
            import xml.etree.ElementTree as ET
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    if resp.status == 200:
                        content = await resp.text()
                        root = ET.fromstring(content)
                        for item in root.findall(".//item")[:8]:
                            title = item.findtext("title") or ""
                            link = item.findtext("link") or ""
                            source = item.findtext("source") or "Google News"
                            pub_date = item.findtext("pubDate") or ""
                            news_items.append({"title": title, "url": link, "source": source, "pub_date": pub_date})
        except Exception as e:
            print(f"News scrape error for {symbol}: {e}")
        return news_items

    async def analyze_stock_with_news(self, symbol: str) -> dict:
        """
        Full stock analysis:
        1. Scrape live news headlines for the symbol
        2. Pass them + geo-political context to Mistral
        3. Return structured thesis + news sources
        """
        # Step 1: Scrape live news
        news_items = await self._scrape_news_for_symbol(symbol)
        ticker = symbol.split(":")[-1] if ":" in symbol else symbol

        import yfinance as yf
        current_price = "Unknown"
        try:
            yf_ticker = f"{ticker}.NS" if symbol.startswith('NSE:') and not ticker.endswith('.NS') else ticker
            stock_info = await asyncio.to_thread(yf.Ticker, yf_ticker)
            hist = await asyncio.to_thread(stock_info.history, period="1d")
            if not hist.empty:
                current_price = f"₹{hist['Close'].iloc[-1]:.2f}"
        except Exception as e:
            print(f"Error fetching price for {ticker}: {e}")

        news_block = "\n".join(
            [f"- [{n['source']}] {n['title']} ({n['pub_date'][:16]})" for n in news_items]
        ) if news_items else "No recent news headlines found."

        system_prompt = f"""Today's date is {datetime.now().strftime('%A, %B %d, %Y')}.
        You are an elite autonomous trading analyst at a top-tier hedge fund. 
        You have deep expertise in technical analysis, fundamental analysis, price action, volume, VWAP, wave theory, and global macro.
        
        You will be given a stock ticker and its latest news headlines plus any relevant geopolitical context.
        
        Produce a structured analysis in **exactly** this format:
        
        **COMPANY OVERVIEW:** (1 sentence on what this company does and its sector)
        
        **TACTICAL ACTION PLAN:** (Provide a specific trade setup: Entry Price Range, Primary Target, and a hard Stop-Loss level. Be extremely precise based on recent price action trends in the news.)
        
        **POSITIONING BIAS:** (Declare LONG, SHORT, or NEUTRAL with a 1-sentence rationale)
        
        Be specific, data-driven, and actionable. Use the news headlines provided as your primary reference."""

        user_message = f"""STOCK: {symbol} (Ticker: {ticker})
CURRENT LIVE PRICE: {current_price}

LATEST NEWS HEADLINES (scraped live):
{news_block}

Provide a complete trading thesis for this stock."""

        payload = {
            'model': 'mistral-large-latest',
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message}
            ],
            'temperature': 0.4
        }

        res = await call_mistral_raw(payload, retries=5)
        if isinstance(res, dict) and 'choices' in res:
            thesis_text = res['choices'][0]['message']['content']

            # Detect bias
            bias = 'NEUTRAL'
            if '**POSITIONING BIAS:** LONG' in thesis_text or 'POSITIONING BIAS:** LONG' in thesis_text:
                bias = 'LONG'
            elif '**POSITIONING BIAS:** SHORT' in thesis_text or 'POSITIONING BIAS:** SHORT' in thesis_text:
                bias = 'SHORT'
            # Fallback keyword scan
            upper = thesis_text.upper()
            if bias == 'NEUTRAL':
                long_score = upper.count('LONG') + upper.count('BULLISH') + upper.count('BUY')
                short_score = upper.count('SHORT') + upper.count('BEARISH') + upper.count('SELL')
                if long_score > short_score + 1:
                    bias = 'LONG'
                elif short_score > long_score + 1:
                    bias = 'SHORT'

            return {
                "symbol": symbol,
                "bias": bias,
                "thesis": thesis_text,
                "news_sources": news_items,
                "generated_at": datetime.now().isoformat()
            }
        else:
            return {"symbol": symbol, "bias": "NEUTRAL", "thesis": " Mistral API rate limit/timeout. Please try again later.", "news_sources": news_items, "generated_at": ""}

    async def analyze_custom_search(self, query: str) -> dict:
        """
        Custom watchlist search:
        1. Scrapes Google News for the custom keyword.
        2. Generates an AI summary/analysis of the news.
        """
        search_query = query.replace(" ", "+")
        url = f"https://news.google.com/rss/search?q={search_query}&hl=en-US&gl=US&ceid=US:en"
        news_items = []
        try:
            import xml.etree.ElementTree as ET
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    if resp.status == 200:
                        content = await resp.text()
                        root = ET.fromstring(content)
                        for item in root.findall(".//item")[:6]:
                            title = item.findtext("title") or ""
                            link = item.findtext("link") or ""
                            source = item.findtext("source") or "Google News"
                            pub_date = item.findtext("pubDate") or ""
                            news_items.append({"title": title, "url": link, "source": source, "pub_date": pub_date})
        except Exception as e:
            print(f"News scrape error for custom query '{query}': {e}")

        # Step 1.5: Scrape web snippets for factual data (prices, dates) via DDG Lite
        web_snippets = []
        try:
            ddg_url = "https://html.duckduckgo.com/html/"
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            post_data = {"q": query}
            async with aiohttp.ClientSession() as session:
                async with session.post(ddg_url, data=post_data, headers=headers, timeout=10) as resp:
                    if resp.status == 200:
                        content = await resp.text()
                        snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', content, re.IGNORECASE | re.DOTALL)
                        for s in snippets[:3]:
                            clean_s = re.sub(r'<[^>]+>', '', s).strip()
                            if clean_s: web_snippets.append(clean_s)
        except Exception as e:
            print(f"Web snippet error: {e}")

        news_block = "\n".join(
            [f"- [{n['source']}] {n['title']} ({n['pub_date'][:16]})" for n in news_items]
        ) if news_items else "No news headlines found."
        
        web_block = "\n".join([f"- {s}" for s in web_snippets]) if web_snippets else "No web snippets found."

        system_prompt = f"""Today's date is {datetime.now().strftime('%A, %B %d, %Y')}.
        You are an elite intelligence analyst at Artillegence Intelligence.
        A user has just added a new custom search topic to their live map radar.
        
        You will be given the user's custom tracking keyword, recent news headlines, and web search snippets.
        
        Your task is to:
        1. Evaluate if the provided data is ACTUALLY relevant to the user's custom topic.
        2. If relevant: Write a concise, high-impact summary (3-4 sentences max). Extract the best headline. Determine the exact geographic location (lat/lng/city/country).
        3. If IRRELEVANT or NO DATA: Do NOT hallucinate connections. State "Monitoring initiated for [topic]. No highly relevant news detected in the current scrape cycle." Select a general location relevant to the topic itself (e.g., if topic is 'Nashik', use Nashik coordinates). Set the headline to "Monitoring: [topic]".
        4. DIRECT INTENT MATCHING: If the user's topic implies a specific question or data extraction (e.g. "gold prices", "AC prices"), your VERY FIRST sentence MUST directly state the factual answer using the Web Snippets. If the exact numbers/prices are not in the provided data, explicitly state "Current exact prices are not available in the scraped data, but..." and then summarize the articles.
        
        Respond ONLY in valid JSON format matching this exact structure:
        {{
          "headline": "The best news title OR 'Monitoring: [Topic]'",
          "thesis": "Your intelligence brief here...",
          "lat": 19.9975,
          "lng": 73.7898,
          "city": "Nashik",
          "country": "India",
          "is_relevant": true
        }}"""

        # Bypass Mistral completely and directly show Google results as requested by user
        thesis = f"Direct Search Results for '{query}'\n\nLatest News:\n{news_block}\n\nWeb Snippets:\n{web_block}"
        headline = f"Monitoring: {query}"
        
        # Persist to geo_events so it appears on the live map
        import uuid
        db.save_geo_events([{
            "id": f"custom-{uuid.uuid4().hex[:8]}",
            "lat": 19.9975, # Default fallback if we wanted to extract, but we just use a generic lat
            "lng": 73.7898,
            "city": query,
            "country": "Unknown",
            "headline": headline,
            "summary": thesis,
            "source": "User Custom",
            "url": news_items[0]['url'] if news_items else "",
            "severity": "medium",
            "timestamp": datetime.now().isoformat(),
            "section": "user_custom"
        }])

        return {
            "query": query,
            "headline": headline,
            "thesis": thesis,
            "lat": 19.9975, # Default fallback
            "lng": 73.7898,
            "city": query,
            "country": "Unknown",
            "news_sources": news_items,
        }
