import os
from dotenv import load_dotenv
import aiohttp
import asyncio

# Load environment variables
load_dotenv()

# API credentials
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'

class MistralAnalyzer:
    """Handles analysis of relevant signals using Mistral AI"""
    def __init__(self):
        self.api_key = MISTRAL_API_KEY
        self.api_url = MISTRAL_API_URL
    
    async def analyze_signal(self, text, context=None):
        """Analyze a signal with Mistral AI"""
        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            # Create a structured prompt with context if available
            system_prompt = '''
            You are an economic intelligence analyst specializing in Indian markets. 
            Analyze the given information and provide exactly these sections with these exact headings:
            
            1. SUMMARY: A concise explanation of the news/event
            2. SECTOR IMPACT: List specific sectors that will be affected (positive/negative)
            3. STOCK RECOMMENDATIONS: Name 2-3 specific Indian stocks that could be impacted
            4. CONFIDENCE: Rate your confidence in this analysis (Low/Medium/High)
            '''
            
            user_message = f"Context: {context if context else 'None'}\n\nText to analyze: {text}"
            
            payload = {
                'model': 'mistral-large-latest',
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_message}
                ]
            }
            
            import asyncio
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, headers=headers, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data['choices'][0]['message']['content']
                    else:
                        error_text = await response.text()
                        return f"Error from Mistral API: {error_text}"
        except Exception as e:
            return f"An error occurred during analysis: {e}"

    async def extract_locations(self, posts_json_str):
        """Extract explicit geographical locations per telegram post using Mistral"""
        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
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
            
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, headers=headers, json=payload, timeout=60) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data['choices'][0]['message']['content']
                    else:
                        print(f"Error from Mistral: {await response.text()}")
                        return None
        except Exception as e:
            print(f"Mistral Error: {e}")
            return None

    async def analyze_event_market_impact(self, event_text: str):
        """Analyze a specific geopolitical event and predict market impacts using Mistral"""
        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            system_prompt = '''
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
            
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, headers=headers, json=payload, timeout=45) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data['choices'][0]['message']['content']
                    else:
                        print(f"Error from Mistral: {await response.text()}")
                        return "Analysis temporarily unavailable due to API error."
        except Exception as e:
            print(f"Mistral Market Analysis Error: {e}")
            return "Analysis temporarily unavailable. Connection timeout."

    async def _scrape_news_for_symbol(self, symbol: str) -> list[dict]:
        """Scrape latest news headlines for a stock symbol from Google News RSS."""
        # Strip exchange prefix (NSE:RELIANCE -> RELIANCE)
        ticker = symbol.split(":")[-1] if ":" in symbol else symbol
        query = ticker.replace("-", " ")
        url = f"https://news.google.com/rss/search?q={query}+stock+share+price&hl=en-IN&gl=IN&ceid=IN:en"
        news_items = []
        try:
            import aiohttp
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

        news_block = "\n".join(
            [f"- [{n['source']}] {n['title']} ({n['pub_date'][:16]})" for n in news_items]
        ) if news_items else "No recent news headlines found."

        system_prompt = """You are an elite autonomous trading analyst at a top-tier hedge fund. 
        You have deep expertise in technical analysis, fundamental analysis, price action, volume, VWAP, wave theory, and global macro.
        
        You will be given a stock ticker and its latest news headlines plus any relevant geopolitical context.
        
        Produce a structured analysis in **exactly** this format:
        
        **COMPANY OVERVIEW:** (1 sentence on what this company does and its sector)
        
        **LATEST DEVELOPMENTS:** (2-3 bullet points summarizing the key news items provided)
        
        **FUNDAMENTAL OUTLOOK:** (Brief assessment of balance sheet health, growth trajectory, valuations)
        
        **TECHNICAL BIAS:** (State the likely technical setup: ranging, trending up, trending down, breakout, breakdown, etc.)
        
        **KEY LEVELS:** (State 2 support levels and 2 resistance levels the analyst should watch)
        
        **CATALYST WATCH:** (What upcoming events could move this stock significantly: earnings, regulatory decisions, macro data)
        
        **POSITIONING BIAS:** (Declare LONG, SHORT, or NEUTRAL with a 1-sentence rationale and stop-loss suggestion)
        
        Be specific, data-driven, and actionable. Use the news headlines provided as your primary reference."""

        user_message = f"""STOCK: {symbol} (Ticker: {ticker})

LATEST NEWS HEADLINES (scraped live):
{news_block}

Provide a complete trading thesis for this stock."""

        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            payload = {
                'model': 'mistral-large-latest',
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_message}
                ],
                'temperature': 0.4
            }

            import aiohttp
            from datetime import datetime
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, headers=headers, json=payload, timeout=60) as response:
                    if response.status == 200:
                        data = await response.json()
                        thesis_text = data['choices'][0]['message']['content']

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
                            "generated_at": datetime.utcnow().isoformat()
                        }
                    else:
                        err = await response.text()
                        print(f"Mistral Stock Analysis Error: {err}")
                        return {"symbol": symbol, "bias": "NEUTRAL", "thesis": f" Mistral API error: {err[:200]}", "news_sources": news_items, "generated_at": ""}
        except Exception as e:
            print(f"Stock analysis exception: {e}")
            return {"symbol": symbol, "bias": "NEUTRAL", "thesis": f" Analysis failed: {str(e)}", "news_sources": news_items, "generated_at": ""}

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
            import aiohttp
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
            import aiohttp
            import re
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

        system_prompt = """You are an elite intelligence analyst at Artillegence Intelligence.
        A user has just added a new custom search topic to their live map radar.
        
        You will be given the user's custom tracking keyword, recent news headlines, and web search snippets.
        
        Your task is to:
        1. Evaluate if the provided data is ACTUALLY relevant to the user's custom topic.
        2. If relevant: Write a concise, high-impact summary (3-4 sentences max). Extract the best headline. Determine the exact geographic location (lat/lng/city/country).
        3. If IRRELEVANT or NO DATA: Do NOT hallucinate connections. State "Monitoring initiated for [topic]. No highly relevant news detected in the current scrape cycle." Select a general location relevant to the topic itself (e.g., if topic is 'Nashik', use Nashik coordinates). Set the headline to "Monitoring: [topic]".
        4. DIRECT INTENT MATCHING: If the user's topic implies a specific question or data extraction (e.g. "gold prices", "AC prices"), your VERY FIRST sentence MUST directly state the factual answer using the Web Snippets. If the exact numbers/prices are not in the provided data, explicitly state "Current exact prices are not available in the scraped data, but..." and then summarize the articles.
        
        Respond ONLY in valid JSON format matching this exact structure:
        {
          "headline": "The best news title OR 'Monitoring: [Topic]'",
          "thesis": "Your intelligence brief here...",
          "lat": 19.9975,
          "lng": 73.7898,
          "city": "Nashik",
          "country": "India",
          "is_relevant": true
        }"""

        user_message = f"USER'S CUSTOM TOPIC: {query}\n\nLATEST WEB SEARCH SNIPPETS (For Prices/Facts):\n{web_block}\n\nLATEST LIVE HEADLINES:\n{news_block}\n\nProduce the intelligence briefing in JSON format."

        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            payload = {
                'model': 'mistral-large-latest',
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_message}
                ],
                'temperature': 0.1,
                'response_format': {"type": "json_object"}
            }

            from datetime import datetime
            import aiohttp
            import json
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, headers=headers, json=payload, timeout=60) as response:
                    if response.status == 200:
                        data = await response.json()
                        result_text = data['choices'][0]['message']['content']
                        
                        try:
                            parsed_json = json.loads(result_text)
                        except json.JSONDecodeError:
                            parsed_json = {"headline": f"Monitoring: {query}", "thesis": result_text, "lat": None, "lng": None, "city": "Global", "country": ""}
                        
                        headline = parsed_json.get("headline", f"Monitoring: {query}")
                        
                        return {
                            "query": query,
                            "headline": headline,
                            "thesis": parsed_json.get("thesis", "No thesis generated."),
                            "lat": parsed_json.get("lat"),
                            "lng": parsed_json.get("lng"),
                            "city": parsed_json.get("city", "Global"),
                            "country": parsed_json.get("country", ""),
                            "news_sources": news_items,
                        }
                    else:
                        err = await response.text()
                        print(f"Mistral Custom Analysis Error: {err}")
                        return {"query": query, "headline": f"Monitoring: {query}", "thesis": f" Mistral API error: {err[:200]}", "news_sources": news_items}
        except Exception as e:
            print(f"Custom analysis exception: {e}")
            return {"query": query, "headline": f"Monitoring: {query}", "thesis": f" Analysis failed: {str(e)}", "news_sources": news_items}
