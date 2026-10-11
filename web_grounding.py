"""
web_grounding.py — Live-web grounding for LLM prompts.

Most configured providers (Groq, Mistral, Ollama, ...) cannot browse. Instead of trusting their
training data, we fetch fresh headlines/snippets ourselves (Google News RSS + DuckDuckGo HTML) and
inject them into the prompt. Callers should refuse to answer from "knowledge base" when this
returns too little data.
"""

import asyncio
import html
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus

import aiohttp

_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def _clean(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


async def google_news(query: str, limit: int = 6, when: str = "7d") -> list[dict]:
    """Recent India-edition Google News headlines for `query` (restricted to the last `when`)."""
    q = quote_plus(f"{query} when:{when}" if when else query)
    url = f"https://news.google.com/rss/search?q={q}&hl=en-IN&gl=IN&ceid=IN:en"
    items = []
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=12, headers=_UA) as resp:
                if resp.status != 200:
                    return []
                root = ET.fromstring(await resp.text())
        for item in root.findall(".//item")[:limit]:
            items.append({
                "title": _clean(item.findtext("title")),
                "source": item.findtext("source") or "Google News",
                "date": (item.findtext("pubDate") or "")[:16],
                "link": item.findtext("link") or "",
            })
    except Exception as e:
        print(f"   [WEB] google_news failed for '{query}': {e}")
    return items


async def search_duckduckgo(query: str, limit: int = 5) -> list[dict]:
    """DuckDuckGo HTML results -> [{title, snippet, link}]."""
    out = []
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post("https://html.duckduckgo.com/html/", data={"q": query},
                                    headers=_UA, timeout=12) as resp:
                if resp.status != 200:
                    return []
                page = await resp.text()
        titles = re.findall(r'<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)</a>', page,
                            re.IGNORECASE | re.DOTALL)
        snippets = re.findall(r'<a[^>]*class="result__snippet[^>]*>(.*?)</a>', page,
                              re.IGNORECASE | re.DOTALL)
        for i, (link, title) in enumerate(titles[:limit]):
            out.append({"title": _clean(title),
                        "snippet": _clean(snippets[i]) if i < len(snippets) else "",
                        "link": html.unescape(link)})
    except Exception as e:
        print(f"   [WEB] duckduckgo failed for '{query}': {e}")
    return out


async def gather_web_context(queries: list[str], news_per_query: int = 5,
                             web_per_query: int = 3) -> dict:
    """
    Run all queries concurrently and return:
      {"text": prompt-ready block, "sources": [...], "count": n_items}
    """
    news_res, web_res = await asyncio.gather(
        asyncio.gather(*[google_news(q, news_per_query) for q in queries]),
        asyncio.gather(*[search_duckduckgo(q, web_per_query) for q in queries]),
    )
    lines, sources, seen = [], [], set()
    for q, news, web in zip(queries, news_res, web_res):
        block = []
        for n in news:
            if n["title"] and n["title"] not in seen:
                seen.add(n["title"])
                block.append(f"  - [{n['source']}, {n['date']}] {n['title']}")
                sources.append({"query": q, "title": n["title"], "source": n["source"],
                                "date": n["date"], "link": n["link"]})
        for w in web:
            key = w["title"] or w["snippet"]
            if key and key not in seen:
                seen.add(key)
                block.append(f"  - [web] {w['title']}: {w['snippet'][:220]}")
                sources.append({"query": q, "title": w["title"], "source": "web",
                                "date": "", "link": w["link"]})
        if block:
            lines.append(f"Query: {q}\n" + "\n".join(block))
    return {"text": "\n\n".join(lines), "sources": sources, "count": len(sources)}
