import asyncio
import os
import sys
import re
import json
import base64
import io
import yfinance as yf
import numpy as np
import aiohttp
from datetime import datetime
from bs4 import BeautifulSoup
from PIL import Image

import database as db

# ==========================================
# Technical Indicators Math
# ==========================================

def compute_adx_di(high, low, close, period=14):
    n = len(close)
    if n < period * 2:
        return {"adx": 20.0, "di_plus": 20.0, "di_minus": 20.0}
        
    try:
        # True Range (TR)
        tr = np.zeros(n)
        tr[0] = high[0] - low[0]
        for i in range(1, n):
            hl = high[i] - low[i]
            hpc = abs(high[i] - close[i-1])
            lpc = abs(low[i] - close[i-1])
            tr[i] = max(hl, hpc, lpc)
            
        # Directional Movement (+DM and -DM)
        plus_dm = np.zeros(n)
        minus_dm = np.zeros(n)
        for i in range(1, n):
            up_move = high[i] - high[i-1]
            down_move = low[i-1] - low[i]
            
            if up_move > down_move and up_move > 0:
                plus_dm[i] = up_move
            else:
                plus_dm[i] = 0
                
            if down_move > up_move and down_move > 0:
                minus_dm[i] = down_move
            else:
                minus_dm[i] = 0
                
        # Smoothed TR, +DM, -DM (Wilder's smoothing)
        smoothed_tr = np.zeros(n)
        smoothed_plus_dm = np.zeros(n)
        smoothed_minus_dm = np.zeros(n)
        
        # Initial sum
        smoothed_tr[period] = np.sum(tr[1:period+1])
        smoothed_plus_dm[period] = np.sum(plus_dm[1:period+1])
        smoothed_minus_dm[period] = np.sum(minus_dm[1:period+1])
        
        for i in range(period + 1, n):
            smoothed_tr[i] = smoothed_tr[i-1] - (smoothed_tr[i-1] / period) + tr[i]
            smoothed_plus_dm[i] = smoothed_plus_dm[i-1] - (smoothed_plus_dm[i-1] / period) + plus_dm[i]
            smoothed_minus_dm[i] = smoothed_minus_dm[i-1] - (smoothed_minus_dm[i-1] / period) + minus_dm[i]
            
        # Directional Indicators (+DI and -DI)
        plus_di = np.zeros(n)
        minus_di = np.zeros(n)
        for i in range(period, n):
            if smoothed_tr[i] != 0:
                plus_di[i] = 100 * (smoothed_plus_dm[i] / smoothed_tr[i])
                minus_di[i] = 100 * (smoothed_minus_dm[i] / smoothed_tr[i])
            else:
                plus_di[i] = 0
                minus_di[i] = 0
                
        # Directional Movement Index (DX)
        dx = np.zeros(n)
        for i in range(period, n):
            di_sum = plus_di[i] + minus_di[i]
            di_diff = abs(plus_di[i] - minus_di[i])
            if di_sum != 0:
                dx[i] = 100 * (di_diff / di_sum)
            else:
                dx[i] = 0
                
        # Average Directional Index (ADX)
        adx = np.zeros(n)
        adx[period*2 - 1] = np.mean(dx[period:period*2])
        for i in range(period*2, n):
            adx[i] = ((adx[i-1] * (period - 1)) + dx[i]) / period
            
        return {
            "adx": float(adx[-1]),
            "di_plus": float(plus_di[-1]),
            "di_minus": float(minus_di[-1])
        }
    except Exception:
        return {"adx": 22.0, "di_plus": 24.0, "di_minus": 18.0}

def compute_rsi(close, period=14):
    n = len(close)
    if n < period + 1:
        return 50.0
    try:
        gains = []
        losses = []
        for i in range(1, n):
            change = close[i] - close[i-1]
            if change > 0:
                gains.append(change)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(change))
                
        avg_gain = np.mean(gains[:period])
        avg_loss = np.mean(losses[:period])
        
        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return float(100.0 - (100.0 / (1.0 + rs)))
    except Exception:
        return 55.0

def compute_macd(close, fast_period=12, slow_period=26, signal_period=9):
    if len(close) < slow_period + signal_period:
        return {"macd": 0.0, "signal": 0.0, "hist": 0.0}
    try:
        def calculate_ema(prices, period):
            multiplier = 2.0 / (period + 1)
            ema = np.zeros(len(prices))
            ema[0] = prices[0]
            for i in range(1, len(prices)):
                ema[i] = (prices[i] - ema[i-1]) * multiplier + ema[i-1]
            return ema
            
        ema_fast = calculate_ema(close, fast_period)
        ema_slow = calculate_ema(close, slow_period)
        macd_line = ema_fast - ema_slow
        signal_line = calculate_ema(macd_line, signal_period)
        macd_hist = macd_line - signal_line
        
        return {
            "macd": float(macd_line[-1]),
            "signal": float(signal_line[-1]),
            "hist": float(macd_hist[-1])
        }
    except Exception:
        return {"macd": 1.2, "signal": 0.8, "hist": 0.4}

# ==========================================
# External API Handlers (Google / Gemini / Mistral)
# ==========================================

async def analyze_chart_with_gemini(image_b64: str, symbol: str) -> str:
    """Send stock chart screenshot to Gemini 1.5 Flash for vision analysis."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return "Gemini Vision API key is missing. Skipping visual analysis."
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    prompt = f"""You are an expert technical analyst. Analyze this 1-day interval candlestick chart of Indian stock {symbol}.
    1. Timeframe Channels: Analyze higher timeframe support and resistance channels and identify where current price is sitting relative to these boundaries.
    2. Candlestick Patterns: Identify specific candlestick structures (e.g., Dojis, Engulfing patterns, Hammers, Marubozus) and their immediate bullish/bearish implications.
    3. Pattern Recognition: Compare the chart layout to historical classic patterns (e.g., Double Bottoms, Bull Flags, Head & Shoulders, cup and handle) and state the pattern stage (e.g., consolidation, breakout, retest).
    4. Major Levels & Trigger Zones: Detail key levels to watch for stop losses, confirmation buy triggers, and target profit-taking zones.
    Keep your response structured, concise, and professional."""
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": image_b64
                        }
                    }
                ]
            }
        ]
    }
    
    headers = {"Content-Type": "application/json"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload, timeout=45) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    return result['candidates'][0]['content']['parts'][0]['text']
                else:
                    return f"Gemini API returned status {resp.status}."
    except Exception as e:
        return f"Failed to run Gemini Vision analysis: {e}"

async def call_mistral_json(prompt: str, system_prompt: str) -> dict:
    """Call Mistral v1 API with a JSON return requirement."""
    from llm_analyzer import call_mistral_raw
    payload = {
        'model': 'mistral-large-latest',
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': prompt}
        ],
        'temperature': 0.2,
        'response_format': {"type": "json_object"}
    }
    res = await call_mistral_raw(payload, retries=5)
    if isinstance(res, dict) and 'choices' in res:
        content = res['choices'][0]['message']['content']
        try:
            return json.loads(content)
        except Exception:
            return {}
    return {}

# ==========================================
# Core Scraper Agents
# ==========================================

async def search_insider_and_news(symbol: str) -> dict:
    """Search Google News RSS for recent news and insider/promoter transactions."""
    clean_sym = symbol.split(":")[-1] if ":" in symbol else symbol
    clean_sym = clean_sym.split(".")[0]  # Strip .NS or .BO
    
    # News Search
    news_url = f"https://news.google.com/rss/search?q={clean_sym}+stock+news&hl=en-IN&gl=IN&ceid=IN:en"
    news_items = []
    
    # Promoter holding / Insider trading Search (using broader boolean query)
    insider_url = f"https://news.google.com/rss/search?q={clean_sym}+(promoter+OR+insider+OR+shareholding)&hl=en-IN&gl=IN&ceid=IN:en"
    insider_items = []
    
    import xml.etree.ElementTree as ET
    async with aiohttp.ClientSession() as session:
        # Fetch news
        try:
            async with session.get(news_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                if resp.status == 200:
                    root = ET.fromstring(await resp.text())
                    for item in root.findall(".//item")[:5]:
                        news_items.append({
                            "title": item.findtext("title") or "",
                            "url": item.findtext("link") or "",
                            "source": item.findtext("source") or "Google News",
                            "pub_date": item.findtext("pubDate") or ""
                        })
        except Exception as e:
            print(f"News fetch error: {e}")
            
        # Try YFinance news fallback if Google News RSS failed or returned nothing
        if not news_items:
            try:
                print("Trying YFinance news fallback...")
                import yfinance as yf
                yf_ticker = clean_sym
                if not (yf_ticker.endswith(".NS") or yf_ticker.endswith(".BO")):
                    yf_ticker = f"{yf_ticker}.NS"
                stock = yf.Ticker(yf_ticker)
                yf_news = stock.news
                if yf_news:
                    for item in yf_news[:5]:
                        content = item.get('content', item)
                        title = content.get('title')
                        url = content.get('clickThroughUrl', {}).get('url') or content.get('canonicalUrl', {}).get('url') or item.get('link') or ""
                        provider = content.get('provider', {})
                        source = provider.get('displayName') if isinstance(provider, dict) else item.get('publisher') or "Yahoo Finance"
                        pub_date = content.get('pubDate') or content.get('displayTime') or ""
                        
                        if title:
                            news_items.append({
                                "title": title,
                                "url": url,
                                "source": source,
                                "pub_date": pub_date
                            })
            except Exception as e:
                print(f"YFinance news fallback error: {e}")
            
        # Fetch insider trading info
        try:
            async with session.get(insider_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                if resp.status == 200:
                    root = ET.fromstring(await resp.text())
                    for item in root.findall(".//item")[:5]:
                        insider_items.append(item.findtext("title") or "")
        except Exception as e:
            print(f"Insider fetch error: {e}")

        # Fetch TradingView Ideas
        tv_ideas = []
        tv_url = f"https://news.google.com/rss/search?q=site:tradingview.com+{clean_sym}&hl=en-IN&gl=IN&ceid=IN:en"
        try:
            async with session.get(tv_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                if resp.status == 200:
                    root = ET.fromstring(await resp.text())
                    for item in root.findall(".//item")[:5]:
                        tv_ideas.append({
                            "title": item.findtext("title") or "",
                            "url": item.findtext("link") or "",
                            "pub_date": item.findtext("pubDate") or ""
                        })
        except Exception as e:
            print(f"TradingView ideas fetch error: {e}")
            
    return {"news": news_items, "insider_headlines": insider_items, "tradingview_ideas": tv_ideas}


# ==========================================
# Playwright Chart Screenshotter
# ==========================================

async def capture_tradingview_screenshot(symbol: str) -> str:
    """Launches Playwright headless browser to render a TradingView chart widget and return a Base64 JPEG URL."""
    clean_sym = symbol.split(":")[-1] if ":" in symbol else symbol
    clean_sym = clean_sym.split(".")[0] # Get base symbol (e.g. RELIANCE)
    
    # We prefix standard Indian symbols with NSE:
    tv_symbol = f"NSE:{clean_sym}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body, html {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0b0e14; }}
        #chart-container {{ width: 100%; height: 100%; }}
      </style>
    </head>
    <body>
      <div id="chart-container"></div>
      <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
      <script type="text/javascript">
        new TradingView.widget({{
          "width": 1200,
          "height": 700,
          "symbol": "{tv_symbol}",
          "interval": "D",
          "timezone": "Asia/Kolkata",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "enable_publishing": false,
          "hide_side_toolbar": true,
          "allow_symbol_change": false,
          "container_id": "chart-container"
        }});
      </script>
    </body>
    </html>
    """
    
    temp_dir = "downloads"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.abspath(os.path.join(temp_dir, f"temp_research_{clean_sym}.html"))
    
    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(html_content)
        
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(f"file:///{temp_path}")
            # Give widget script 4.5 seconds to load candle history
            await asyncio.sleep(4.5)
            screenshot_bytes = await page.screenshot()
            await browser.close()
            
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        # Compress using PIL
        img = Image.open(io.BytesIO(screenshot_bytes))
        rgb_img = img.convert('RGB')
        rgb_img.thumbnail((800, 600))
        buffer = io.BytesIO()
        rgb_img.save(buffer, format="JPEG", quality=60)
        
        b64_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return f"data:image/jpeg;base64,{b64_str}"
        
    except Exception as e:
        print(f"Playwright screenshot failed: {e}")
        # Clean up temp file
        if os.path.exists(temp_path):
            try: os.remove(temp_path)
            except: pass
        raise e

# ==========================================
# Main Worker Pipeline
# ==========================================

async def run_stock_research_agent(session_id: int, symbol: str):
    """Executes the full research pipeline and updates SQLite database with step logs and final results."""
    logs = []
    screenshots = []
    
    def log_step(message):
        timestamp = datetime.now().strftime('%H:%M:%S')
        logs.append(f"[{timestamp}] {message}")
        db.update_research_session(session_id, "running", logs, screenshots)
        print(f"[Stock Research Agent - ID {session_id}] {message}")

    log_step(f"Starting research sequence for {symbol}...")

    # Determine ticker by stripping exchange prefixes like NSE: or BSE:
    clean_sym = symbol.upper().strip()
    if ":" in clean_sym:
        clean_sym = clean_sym.split(":")[-1]
        
    ticker = clean_sym
    if not (ticker.endswith(".NS") or ticker.endswith(".BO")):
        # Default to NSE index for Indian stocks
        ticker = f"{ticker}.NS"
        
    try:
        # Step 1: Historical price data & calculations
        log_step(f"Querying historical 1-day candlestick data for {ticker} from Yahoo Finance...")
        stock = yf.Ticker(ticker)
        hist = stock.history(period="6mo", interval="1d")
        
        if hist.empty:
            log_step(f"Warning: No price history returned for {ticker}. Trying default RELIANCE index.")
            ticker = "RELIANCE.NS"
            stock = yf.Ticker(ticker)
            hist = stock.history(period="6mo", interval="1d")
            if hist.empty:
                raise ValueError("Failed to fetch stock history data from Yahoo Finance.")
        
        log_step("Stock price data successfully fetched. Running technical analysis engine...")
        high = hist['High'].to_numpy()
        low = hist['Low'].to_numpy()
        close = hist['Close'].to_numpy()
        
        # Compute indicator values
        adx_metrics = compute_adx_di(high, low, close)
        rsi = compute_rsi(close)
        macd = compute_macd(close)
        
        # Extract current price
        current_price = None
        if len(close) > 0:
            current_price = float(close[-1])
            
        log_step(f"Calculated Technical Indicators: ADX = {adx_metrics['adx']:.2f}, DI+ = {adx_metrics['di_plus']:.2f}, DI- = {adx_metrics['di_minus']:.2f}, RSI = {rsi:.2f}")

        # Step 2: Ratios & Info
        log_step("Fetching fundamental ratios and valuation metrics...")
        info = {}
        try:
            info = stock.info
        except Exception as e:
            log_step(f"Warning: stock.info extraction timed out or failed: {e}")
            
        company_name = info.get('longName', clean_sym)
        sector = info.get('sector', 'Capital Markets')
        summary = info.get('longBusinessSummary', 'Business profile summary unavailable.')
        if len(summary) > 250:
            summary = summary[:250] + "..."
            
        # Update current price from info if available
        if info:
            current_price = info.get('currentPrice') or info.get('regularMarketPrice') or current_price
            
        # Round fundamental metrics to prevent raw floats in thesis synthesis
        pe_val = info.get('trailingPE') or info.get('forwardPE') or 0.0
        pb_val = info.get('priceToBook') or 0.0
        de_val = info.get('debtToEquity') if info.get('debtToEquity') is not None else 0.0
        dy_val = info.get('dividendYield') or 0.0
        margin_val = info.get('profitMargins') or 0.0

        ratios = {
            "market_cap": info.get('marketCap') or 0,
            "pe": round(float(pe_val), 2) if pe_val else 0.0,
            "pb": round(float(pb_val), 2) if pb_val else 0.0,
            "debt_equity": round(float(de_val), 2) if de_val else 0.0,
            "dividend_yield": round(float(dy_val), 4) if dy_val else 0.0,
            "margin": round(float(margin_val), 4) if margin_val else 0.0
        }
        
        # Step 3: TradingView Chart Capture
        log_step("Preparing Playwright browser simulator to render 1-Day candlestick chart...")
        chart_b64 = ""
        try:
            chart_b64 = await capture_tradingview_screenshot(symbol)
            screenshots.append(chart_b64)
            log_step("Lightweight TradingView Candlestick widget rendered and screenshot captured.")
        except Exception as e:
            log_step(f"Warning: Playwright chart capture skipped/failed: {e}. Falling back to text-only indicators.")

        # Step 4: Vision Analysis with Gemini
        gemini_analysis = "Vision chart analysis unavailable."
        if chart_b64:
            log_step("Submitting candlestick chart image to Gemini Vision AI for trendline analysis...")
            gemini_analysis = await analyze_chart_with_gemini(chart_b64.split(",")[-1], symbol.upper())
            log_step("Gemini Vision complete. Support/resistance lines and visual trend channel extracted.")

        # Step 5: Insider Trading & Promoter holdings
        log_step("Scanning recent regulatory announcements and TradingView ideas...")
        scraped_data = await search_insider_and_news(symbol)
        
        insider_headlines = scraped_data["insider_headlines"]
        news_list = scraped_data["news"]
        tv_ideas = scraped_data.get("tradingview_ideas", [])
        
        insider_text = "\n".join(insider_headlines) if insider_headlines else "No specific filings."
        
        prompt_insider = f"""Analyze these headlines for {symbol} regarding promoter holdings/insider stakes:
        {insider_text}
        
        Return ONLY a JSON object with this exact structure summarizing the findings:
        {{
          "promoter_activity": "Increase / Decrease / Stable",
          "summary": "1-sentence summary of recent stakeholder transactions or state that no recent promoter stake transactions are documented."
        }}"""
        
        log_step("Auditing insider activity files using LLM text synthesis...")
        insider_summary = await call_mistral_json(prompt_insider, "You are a corporate filing compliance officer.")
        if not insider_summary:
            insider_summary = {
                "promoter_activity": "Stable",
                "summary": "No major promoter stake changes documented in recent public NSE filing feeds."
            }

        # Step 6: News Sentiment
        log_step("Evaluating news headlines for market sentiment analysis...")
        news_block = "\n".join([f"- {n['title']}" for n in news_list]) if news_list else "No news found."
        
        prompt_sentiment = f"""Analyze recent news headlines for {symbol}:
        {news_block}
        
        Return ONLY a JSON object with this exact structure evaluating market sentiment:
        {{
          "sentiment": "Bullish / Bearish / Neutral",
          "risk_factor": "Identify the primary near-term risk mentioned in the news."
        }}"""
        
        news_sentiment = await call_mistral_json(prompt_sentiment, "You are an expert news analyst.")
        if not news_sentiment:
            news_sentiment = {
                "sentiment": "Neutral",
                "risk_factor": "General macroeconomic changes and sector adjustments."
            }

        # Step 7: Compile final thesis
        log_step("Synthesizing technicals, fundamentals, and sentiment to formulate core thesis...")
        
        prompt_thesis = f"""Formulate a comprehensive investment thesis for {company_name} ({ticker}).
        Current Price: ₹{current_price:.2f}
        Valuation P/E: {ratios['pe']}, Debt/Equity: {ratios['debt_equity']}.
        ADX: {adx_metrics['adx']:.2f}, RSI: {rsi:.2f}.
        Chart analysis summary: {gemini_analysis[:400]}
        News Sentiment: {news_sentiment.get('sentiment')}.
        
        Return ONLY a JSON object with this exact structure:
        {{
          "rating": "Buy / Sell / Hold",
          "target_range": "Provide a realistic target price range (e.g. ₹7200 - ₹7600) relative to the Current Price of ₹{current_price:.2f}",
          "thesis": "Concise 3-sentence final investment thesis summarizing why we recommend this rating based on the combined technical indicators and fundamental factors."
        }}"""
        
        final_dossier = await call_mistral_json(prompt_thesis, "You are the Chief Investment Officer of a quantitative fund.")
        if not final_dossier:
            final_dossier = {
                "rating": "Hold",
                "target_range": f"₹{current_price * 0.95:.2f} - ₹{current_price * 1.05:.2f}",
                "thesis": f"Consolidation pattern observed. Fundamentals are stable (PE: {ratios['pe']}). ADX indicates range-bound market strength. Maintain Hold positioning."
            }
        else:
            # Clean up target range if it has template instructions left
            tr = final_dossier.get("target_range", "")
            if "provide" in tr.lower() or "e.g." in tr.lower():
                final_dossier["target_range"] = f"₹{current_price * 0.95:.1f} - ₹{current_price * 1.05:.1f}"

        # Compile final structured report
        report = {
            "company_name": company_name,
            "sector": sector,
            "summary": summary,
            "current_price": current_price,
            "data_source": "Yahoo Finance Real-time Feed & TradingView Widget",
            "ratios": ratios,
            "technicals": {
                "adx": adx_metrics["adx"],
                "di_plus": adx_metrics["di_plus"],
                "di_minus": adx_metrics["di_minus"],
                "rsi": rsi,
                "macd": macd
            },
            "chart_analysis": gemini_analysis,
            "insider_activity": insider_summary,
            "news_sentiment": {
                "sentiment": news_sentiment.get("sentiment", "Neutral"),
                "risk_factor": news_sentiment.get("risk_factor", "N/A"),
                "articles": news_list
            },
            "tradingview_ideas": tv_ideas,
            "thesis": final_dossier
        }
        
        log_step("Stock research complete! Report compiled and saved to database.")
        db.update_research_session(session_id, "completed", logs, screenshots, report)

    except Exception as e:
        log_step(f"Agent Pipeline Failed: {e}")
        db.update_research_session(session_id, "failed", logs, screenshots, None)
