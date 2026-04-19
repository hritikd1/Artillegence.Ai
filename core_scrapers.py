import os
import asyncio
import requests
import feedparser
import time
import re
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API credentials
# API credentials  Only non-public scrapers would need keys.
# (Dynamic scrapers below use public RSS or web previews and require NO keys).

class WebScraper:
    """A robust web scraper for fetching and cleaning article content."""
    @staticmethod
    async def scrape_content(url: str, timeout: int = 10) -> str | None:
        """Asynchronously scrapes and cleans the text content of a given URL."""
        if not url:
            return None
            
        try:
            from scrapling.fetchers import Fetcher
            # Use Scrapling with Chrome TLS impersonation to bypass bot checks
            response = await asyncio.to_thread(Fetcher.get, url, impersonate='chrome', timeout=timeout)
            
            if response.status != 200:
                print(f"Scrapling returned status {response.status} for {url}")
                return None

            soup = BeautifulSoup(response.body, 'html.parser')

            for script_or_style in soup(['script', 'style', 'nav', 'footer', 'aside']):
                script_or_style.decompose()

            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = '\n'.join(chunk for chunk in chunks if chunk)

            return text[:8000] # Limit for token budgets
        except Exception as e:
            print(f"Error scraping content from {url}: {e}")
            return None

    @staticmethod
    async def capture_screenshot(url: str) -> str | None:
        """Asynchronously capture a full-page screenshot of a given URL as base64 jpeg."""
        if not url: return None
        try:
            from playwright.async_api import async_playwright
            import base64
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(viewport={"width": 1280, "height": 800})
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                await asyncio.sleep(2) # wait for arbitrary images to pop in
                screenshot_bytes = await page.screenshot(type='jpeg', quality=65)
                await browser.close()
                return base64.b64encode(screenshot_bytes).decode('utf-8')
        except Exception as e:
            print(f"Failed to screenshot {url}: {e}")
            return None

class NewsSource:
    """Base class for all news sources"""
    def __init__(self, name, source_type):
        self.name = name
        self.source_type = source_type
        self.last_check = None
    
    async def fetch_data(self):
        """Fetch data from the source"""
        raise NotImplementedError("Subclasses must implement fetch_data()")
    
    def filter_by_date(self, articles, hours=6):
        """
        Filter articles to only include those published within `hours` hours.
         Handles both naive and timezone-aware ISO timestamps.
         Articles with no parseable date are DROPPED (not silently passed).
         Results are sorted newest-first so callers always get the freshest slice.
        """
        now_utc = datetime.now(timezone.utc)
        cutoff = hours * 3600
        kept = []
        dropped = 0

        for article in articles:
            raw_ts = article.get('timestamp', '')
            try:
                dt = datetime.fromisoformat(str(raw_ts))
                # Normalise to UTC
                if dt.tzinfo is None:
                    # Assume local naive timestamps are UTC+5:30 (IST)
                    from datetime import timedelta
                    dt = dt.replace(tzinfo=timezone.utc) - timedelta(hours=0)
                else:
                    dt = dt.astimezone(timezone.utc)
                age_seconds = (now_utc - dt).total_seconds()
                if 0 <= age_seconds <= cutoff:
                    article['_age_seconds'] = int(age_seconds)
                    kept.append(article)
                else:
                    dropped += 1
            except (ValueError, TypeError, AttributeError):
                dropped += 1   # Bad timestamp  reject

        if dropped:
            print(f"    [FRESHNESS] {dropped} articles older than {hours}h dropped, {len(kept)} kept")

        # Return newest-first
        kept.sort(key=lambda a: a.get('_age_seconds', 0))
        return kept

class GoogleRSSFeed(NewsSource):
    """Google RSS Feed data source"""
    def __init__(self, name, source_type, topic, country="IN", language="en"):
        super().__init__(name, source_type)
        self.topic = topic
        self.country = country
        self.language = language
        self.feed_url = self._build_feed_url()
    
    def _build_feed_url(self):
        import urllib.parse
        base_url = "https://www.bing.com/news/search"
        if self.topic:
            formatted_topic = urllib.parse.quote(self.topic)
            url = f"{base_url}?q={formatted_topic}&format=rss&mkt={self.language}-{self.country}"
        else:
            url = f"https://www.bing.com/news?format=rss&mkt={self.language}-{self.country}"
        return url
    
    async def fetch_data(self, limit=20, hours=6):
        results = []
        try:
            feed = await asyncio.to_thread(feedparser.parse, self.feed_url)
            for entry in feed.entries:
                timestamp = datetime.now().isoformat()
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    timestamp = datetime.fromtimestamp(time.mktime(entry.published_parsed)).isoformat()
                elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                    timestamp = datetime.fromtimestamp(time.mktime(entry.updated_parsed)).isoformat()
                
                # Extract thumbnail image from description HTML or media content
                image_url = ''
                description_text = ''
                if hasattr(entry, 'description') and entry.description:
                    try:
                        soup = BeautifulSoup(entry.description, 'html.parser')
                        img_tag = soup.find('img')
                        if img_tag and img_tag.get('src'):
                            image_url = img_tag['src']
                        description_text = soup.get_text(strip=True)
                    except Exception:
                        description_text = entry.description
                
                # Also check media_content (some RSS feeds use this)
                if not image_url and hasattr(entry, 'media_content'):
                    for media in entry.media_content:
                        if 'url' in media:
                            image_url = media['url']
                            break
                
                # Check enclosures
                if not image_url and hasattr(entry, 'enclosures'):
                    for enc in entry.enclosures:
                        if enc.get('type', '').startswith('image'):
                            image_url = enc.get('href', enc.get('url', ''))
                            break
                
                import urllib.parse
                raw_link = entry.link
                if 'url=' in raw_link:
                    try:
                        raw_link = urllib.parse.unquote(raw_link.split('url=')[1].split('&')[0])
                    except Exception:
                        pass

                results.append({
                    'title': entry.title,
                    'snippet': description_text or entry.title,
                    'link': raw_link,
                    'source': entry.get('source', {}).get('title', 'News'),
                    'source_type': self.source_type,
                    'topic': self.topic,
                    'image': image_url,
                    'timestamp': timestamp
                })
        except Exception as e:
            print(f"Error fetching Google RSS data for topic '{self.topic}': {e}")
            
        self.last_check = datetime.now()
        filtered = self.filter_by_date(results, hours)
        return filtered[:limit]


# 
# Google News RSS Scraper (news.google.com)
# 

# 
# Comprehensive topic list the agent rotates through
# Covers ALL Google News homepage categories for India
# URL: https://news.google.com/home?hl=en-IN&gl=IN&ceid=IN:en
# 

GOOGLE_NEWS_TOPICS = [
    #  Market & Indices 
    ("Nifty 50",              "Nifty 50 today"),
    ("Sensex",                "Sensex today"),
    ("Bank Nifty",            "Bank Nifty today"),
    ("SGX Nifty",             "SGX Nifty"),
    ("Nifty IT",              "Nifty IT index today"),
    ("Nifty Pharma",          "Nifty Pharma index today"),

    #  Sectors 
    ("IT Sector",             "Indian IT sector stocks TCS Infosys Wipro HCL"),
    ("Banking Sector",        "India banking sector HDFC ICICI SBI Kotak"),
    ("Pharma Sector",         "pharma stocks India Sun Pharma Cipla Dr Reddy"),
    ("Auto Sector",           "automobile stocks India Tata Motors Maruti Mahindra"),
    ("Energy Sector",         "energy stocks India Reliance ONGC NTPC Power Grid"),
    ("FMCG",                  "FMCG stocks India HUL ITC Nestle Britannia"),
    ("Infrastructure",        "infrastructure stocks India Larsen Adani"),
    ("Metals",                "metal stocks India Tata Steel Hindalco JSW"),
    ("Real Estate",           "real estate stocks India DLF Godrej Oberoi"),
    ("Defence Sector",        "defence stocks India HAL BEL Bharat Dynamics"),
    ("Telecom",               "telecom stocks India Jio Airtel Vodafone"),
    ("EV Sector",             "electric vehicle stocks India Tata Ola Ather"),
    ("Semiconductors",        "semiconductor chips India manufacturing"),
    ("Green Energy",          "renewable energy solar wind India stocks"),

    #  Economy & Policy 
    ("RBI Policy",            "RBI monetary policy interest rate India"),
    ("India GDP",             "India GDP growth economic data"),
    ("Rupee Dollar",          "Indian rupee dollar exchange rate"),
    ("Inflation India",       "India inflation CPI WPI"),
    ("Government Policy",     "India budget policy reform"),
    ("GST Revenue",           "India GST revenue collection"),
    ("India Trade",           "India exports imports trade deficit"),
    ("India Taxation",        "India income tax capital gains tax"),

    #  Institutional Activity 
    ("FII Activity",          "FII foreign institutional investors India"),
    ("DII Mutual Funds",      "DII mutual fund inflows India SIP"),
    ("Retail Investors",      "retail investors India demat accounts"),

    #  Commodities 
    ("Crude Oil",             "crude oil price impact India"),
    ("Gold Price",            "gold price India MCX"),
    ("Silver Price",          "silver price India commodity"),
    ("Copper Aluminium",      "copper aluminium prices India"),

    #  Global Impact 
    ("US Fed",                "US Federal Reserve impact India markets"),
    ("China Economy",         "China economy impact Asia markets"),
    ("Global Markets",        "global stock markets today"),
    ("US Tech Stocks",        "Nasdaq Apple NVIDIA Tesla stock"),
    ("Crypto Markets",        "Bitcoin cryptocurrency India regulation"),
    ("Japan Economy",         "Japan Nikkei Bank of Japan markets"),
    ("Europe Markets",        "European markets economy impact India"),

    #  Opportunities 
    ("IPO News",              "upcoming IPO India 2026"),
    ("Breakout Stocks",       "breakout stocks India technical analysis"),
    ("Small Mid Cap",         "small cap mid cap multibagger India"),
    ("Dividend Stocks",       "high dividend yield stocks India"),
    ("Penny Stocks",          "penny stocks India NSE BSE"),

    #  Breaking / General Market 
    ("Market Crash Rally",    "stock market crash OR rally India"),
    ("Corporate Earnings",    "quarterly results earnings India"),
    ("Block Deals",           "block deal bulk deal India NSE"),
    ("SEBI Regulations",      "SEBI new regulations India market"),
    ("Insider Trading",       "insider trading promoter buying India"),

    #  India News (Top Headline Categories) 
    ("India Politics",        "India politics government parliament"),
    ("India Elections",       "India elections results assembly"),
    ("India Infrastructure",  "India infrastructure highway metro project"),
    ("India Startups",        "India startup funding unicorn"),
    ("India Technology",      "India technology AI digital"),

    #  Geopolitics (Market-moving) 
    ("Iran Oil Crisis",       "Iran war Strait Hormuz oil India"),
    ("US China Trade",        "US China trade war tariffs India"),
    ("OPEC Oil",              "OPEC oil production cut India"),
    ("Russia Ukraine",        "Russia Ukraine war sanctions energy India"),
    ("Middle East",           "Middle East geopolitics impact India economy"),
    ("Indo Pacific",          "Indo Pacific strategy India China"),
]


class GoogleNewsScraper(NewsSource):
    """
    Scrapes the *real* Google News RSS feed.
    URL pattern:
      Top stories   https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en
      Search query  https://news.google.com/rss/search?q=<query>&hl=en-IN&gl=IN&ceid=IN:en
      Topic         https://news.google.com/rss/topics/<TOPIC_TOKEN>?hl=en-IN&gl=IN&ceid=IN:en
    """

    # Google News topic tokens scraped from live homepage:
    # https://news.google.com/home?hl=en-IN&gl=IN&ceid=IN:en
    TOPIC_TOKENS = {
        "top_stories":    None,  # no path  homepage RSS
        "india":          "CAAqJQgKIh9DQkFTRVFvSUwyMHZNRE55YXpBU0JXVnVMVWRDS0FBUAE",
        "world":          "CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx1YlY4U0JXVnVMVWRDR2dKSlRpZ0FQAQ",
        "local":          "CAAqHAgKIhZDQklTQ2pvSWJHOWpZV3hmZGpJb0FBUAE",
        "business":       "CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx6TVdZU0JXVnVMVWRDR2dKSlRpZ0FQAQ",
        "technology":     "CAAqKggKIiRDQkFTRlFvSUwyMHZNRGRqTVhZU0JXVnVMVWRDR2dKSlRpZ0FQAQ",
        "entertainment": "CAAqKggKIiRDQkFTRlFvSUwyMHZNREpxYW5RU0JXVnVMVWRDR2dKSlRpZ0FQAQ",
        "sports":         "CAAqKggKIiRDQkFTRlFvSUwyMHZNRFp1ZEdvU0JXVnVMVWRDR2dKSlRpZ0FQAQ",
        "science":        "CAAqKggKIiRDQkFTRlFvSUwyMHZNRFp0Y1RjU0JXVnVMVWRDR2dKSlRpZ0FQAQ",
        "health":         "CAAqJQgKIh9DQkFTRVFvSUwyMHZNR3QwTlRFU0JXVnVMVWRDS0FBUAE",
    }

    def __init__(self, name: str, source_type: str,
                 query: str | None = None,
                 topic_key: str | None = None,
                 hl: str = "en-IN", gl: str = "IN", ceid: str = "IN:en"):
        super().__init__(name, source_type)
        self.query = query
        self.topic_key = topic_key
        self.hl = hl
        self.gl = gl
        self.ceid = ceid
        self.feed_url = self._build_url()

    def _build_url(self) -> str:
        import urllib.parse
        base = "https://news.google.com/rss"
        params = f"hl={self.hl}&gl={self.gl}&ceid={urllib.parse.quote(self.ceid)}"

        if self.query:
            encoded_q = urllib.parse.quote(self.query)
            return f"{base}/search?q={encoded_q}&{params}"
        elif self.topic_key and self.topic_key in self.TOPIC_TOKENS and self.TOPIC_TOKENS[self.topic_key]:
            token = self.TOPIC_TOKENS[self.topic_key]
            return f"{base}/topics/{token}?{params}"
        else:
            # Top stories
            return f"{base}?{params}"

    async def fetch_data(self, limit: int = 20, hours: int = 6) -> list:
        results = []
        try:
            feed = await asyncio.to_thread(feedparser.parse, self.feed_url)
            for entry in feed.entries:
                #  Timestamp 
                timestamp = datetime.now().isoformat()
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    timestamp = datetime.fromtimestamp(time.mktime(entry.published_parsed)).isoformat()
                elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                    timestamp = datetime.fromtimestamp(time.mktime(entry.updated_parsed)).isoformat()

                #  Description / image 
                image_url = ''
                description_text = ''
                if hasattr(entry, 'description') and entry.description:
                    try:
                        soup = BeautifulSoup(entry.description, 'html.parser')
                        img_tag = soup.find('img')
                        if img_tag and img_tag.get('src'):
                            image_url = img_tag['src']
                        description_text = soup.get_text(strip=True)
                    except Exception:
                        description_text = entry.description

                # media:content fallback
                if not image_url and hasattr(entry, 'media_content'):
                    for media in entry.media_content:
                        if 'url' in media:
                            image_url = media['url']
                            break

                # Google News wraps the real URL in a redirect; try to extract it
                import urllib.parse
                raw_link = entry.link
                if 'news.google.com' in raw_link and '/articles/' in raw_link:
                    # Can't always unwrap Google redirect without following it,
                    # so keep the Google link  it still works for readers.
                    pass
                elif 'url=' in raw_link:
                    try:
                        raw_link = urllib.parse.unquote(raw_link.split('url=')[1].split('&')[0])
                    except Exception:
                        pass

                # Extract source name from title ("Headline - SourceName")
                source_name = 'Google News'
                title_text = entry.title or ''
                if ' - ' in title_text:
                    parts = title_text.rsplit(' - ', 1)
                    source_name = parts[-1].strip()
                    title_text = parts[0].strip()

                results.append({
                    'title':       title_text,
                    'snippet':     description_text or title_text,
                    'link':        raw_link,
                    'source':      source_name,
                    'source_type': self.source_type,
                    'topic':       self.query or self.topic_key or 'top_stories',
                    'image':       image_url,
                    'timestamp':   timestamp,
                })
        except Exception as e:
            print(f"Error fetching Google News RSS for '{self.query or self.topic_key}': {e}")

        self.last_check = datetime.now()
        filtered = self.filter_by_date(results, hours)
        return filtered[:limit]

class TelegramChannelScraper(NewsSource):
    """Scrapes public posts from a Telegram channel using web preview."""
    def __init__(self, name, source_type, channel_slug="CIG_telegram"):
        super().__init__(name, source_type)
        self.channel_slug = channel_slug

    async def fetch_data(self, limit=50, hours=6):
        results = []
        base_url = f"https://t.me/s/{self.channel_slug}"
        current_url = base_url
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        
        try:
            from scrapling.fetchers import Fetcher
            while len(results) < limit:
                response = await asyncio.to_thread(Fetcher.get, current_url, impersonate='chrome', timeout=10)
                if response.status != 200:
                    break
                    
                soup = BeautifulSoup(response.body, 'html.parser')
                messages = soup.find_all('div', class_='tgme_widget_message')
                if not messages:
                    break
                    
                # Process latest messages first on this page
                page_results = []
                for msg in reversed(messages):
                    if len(results) + len(page_results) >= limit:
                        break
                        
                    post_url = msg.get('data-post', '')
                    post_id = post_url.split('/')[-1] if post_url else ''
                    
                    text_div = msg.find('div', class_='tgme_widget_message_text')
                    if not text_div: continue
                    text = text_div.get_text(separator=' ', strip=True)
                    if len(text) < 10: continue
                        
                    time_wrap = msg.find('a', class_='tgme_widget_message_date')
                    timestamp = datetime.now().isoformat()
                    if time_wrap:
                        time_tag = time_wrap.find('time')
                        if time_tag and time_tag.get('datetime'):
                            timestamp = time_tag.get('datetime')
                            
                    # Extract Image if present
                    image_url = ''
                    photo_wrap = msg.find('a', class_='tgme_widget_message_photo_wrap')
                    if photo_wrap:
                        # Extract the background-image URL from style attribute
                        style = photo_wrap.get('style', '')
                        img_match = re.search(r"url\('(.+?)'\)", style)
                        if img_match:
                            image_url = img_match.group(1)

                    page_results.append({
                        'title': f"Intel Update from {self.channel_slug}",
                        'snippet': text,
                        'link': f"https://t.me/{self.channel_slug}/{post_id}" if post_id else base_url,
                        'source': f"Telegram: {self.channel_slug}",
                        'telegram_post_id': post_id,
                        'source_type': self.source_type,
                        'timestamp': timestamp,
                        'image': image_url
                    })
                
                results.extend(page_results)
                
                if len(results) >= limit:
                    break
                    
                oldest_post_url = messages[0].get('data-post', '')
                if not oldest_post_url:
                    break
                    
                oldest_id = oldest_post_url.split('/')[-1]
                if not oldest_id.isdigit():
                    break
                    
                current_url = f"{base_url}?before={oldest_id}"
                
        except Exception as e:
            print(f"Error fetching Telegram data from {current_url}: {e}")
            
        self.last_check = datetime.now()
        return self.filter_by_date(results, hours)


class GoogleTrendsScraper:
    """
    Tracks Google search interest for stocks/topics using pytrends.
    Detects unusual spikes in search volume that often precede big stock moves.
    """
    
    # Default watchlist of terms to track
    DEFAULT_KEYWORDS = [
        # Major Indian stocks
        "Reliance share price", "TCS share price", "HDFC Bank share price",
        "Infosys share price", "SBI share price", "Tata Motors share price",
        "Adani share price", "ITC share price", "Wipro share price",
        # Market indices
        "Nifty today", "Sensex today", "Bank Nifty",
        # Market events
        "stock market crash India", "IPO allotment", "RBI interest rate",
        # Sectors
        "defence stocks India", "EV stocks India", "pharma stocks India",
    ]

    def __init__(self, keywords: list[str] | None = None, geo: str = "IN"):
        self.keywords = keywords or self.DEFAULT_KEYWORDS
        self.geo = geo

    async def fetch_trending_searches(self) -> list[dict]:
        """Fetch today's trending searches in India from Google Trends."""
        results = []
        try:
            from pytrends.request import TrendReq
            pytrend = await asyncio.to_thread(TrendReq, hl='en-IN', tz=330)
            trending = await asyncio.to_thread(pytrend.trending_searches, pn='india')
            for idx, row in trending.iterrows():
                term = row[0]
                results.append({
                    "term": term,
                    "rank": idx + 1,
                    "source": "Google Trends India",
                    "timestamp": datetime.now().isoformat()
                })
        except Exception as e:
            print(f"Error fetching Google trending searches: {e}")
        return results

    async def fetch_interest(self, keywords: list[str] | None = None, timeframe: str = "now 7-d") -> list[dict]:
        """
        Fetch relative search interest for given keywords over the specified timeframe.
        Returns a list of dicts with keyword, current_interest, avg_interest, spike_ratio.
        A spike_ratio > 2.0 means search interest is 2x the 7-day average  a notable spike.
        """
        kw_list = keywords or self.keywords[:5]  # pytrends max 5 keywords per request
        results = []
        try:
            from pytrends.request import TrendReq
            pytrend = await asyncio.to_thread(TrendReq, hl='en-IN', tz=330)
            
            # Process in batches of 5
            for i in range(0, len(kw_list), 5):
                batch = kw_list[i:i+5]
                try:
                    await asyncio.to_thread(pytrend.build_payload, batch, timeframe=timeframe, geo=self.geo)
                    interest_df = await asyncio.to_thread(pytrend.interest_over_time)
                    
                    if interest_df.empty:
                        continue
                    
                    for kw in batch:
                        if kw not in interest_df.columns:
                            continue
                        series = interest_df[kw]
                        current = int(series.iloc[-1]) if len(series) > 0 else 0
                        avg = float(series.mean()) if len(series) > 0 else 1
                        spike_ratio = round(current / max(avg, 1), 2)
                        
                        results.append({
                            "keyword": kw,
                            "current_interest": current,
                            "avg_interest": round(avg, 1),
                            "spike_ratio": spike_ratio,
                            "is_spiking": spike_ratio >= 1.8,
                            "trend_direction": "UP" if current > avg else "DOWN" if current < avg * 0.7 else "STABLE",
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    await asyncio.sleep(1)  # Rate limit courtesy
                except Exception as e:
                    print(f"   Google Trends batch error: {e}")
                    
        except Exception as e:
            print(f"Error in Google Trends interest fetch: {e}")
        
        return sorted(results, key=lambda x: x.get("spike_ratio", 0), reverse=True)

    async def fetch_related_queries(self, keyword: str) -> dict:
        """Fetch rising and top related queries for a keyword  useful for discovering what retail investors are searching."""
        try:
            from pytrends.request import TrendReq
            pytrend = await asyncio.to_thread(TrendReq, hl='en-IN', tz=330)
            await asyncio.to_thread(pytrend.build_payload, [keyword], timeframe="now 7-d", geo=self.geo)
            related = await asyncio.to_thread(pytrend.related_queries)
            
            result = {"keyword": keyword, "rising": [], "top": []}
            if keyword in related:
                rising_df = related[keyword].get("rising")
                top_df = related[keyword].get("top")
                if rising_df is not None and not rising_df.empty:
                    result["rising"] = rising_df.head(10).to_dict('records')
                if top_df is not None and not top_df.empty:
                    result["top"] = top_df.head(10).to_dict('records')
            return result
        except Exception as e:
            print(f"Error fetching related queries for '{keyword}': {e}")
            return {"keyword": keyword, "rising": [], "top": []}

