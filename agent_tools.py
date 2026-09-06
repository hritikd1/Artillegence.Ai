import subprocess
import os
import json
import tempfile
import asyncio
from typing import Dict, Any

def execute_python(code: str) -> str:
    """Executes arbitrary python code in a temporary file and returns stdout/stderr."""
    # Write code to temp file
    fd, path = tempfile.mkstemp(suffix=".py")
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(code)
        
        # Execute it
        result = subprocess.run(["python", path], capture_output=True, text=True, timeout=60)
        
        output = ""
        if result.stdout:
            output += f"STDOUT:\n{result.stdout}\n"
        if result.stderr:
            output += f"STDERR:\n{result.stderr}\n"
        if not output:
            output = "Code executed successfully with no output."
        return output
    except subprocess.TimeoutExpired:
        return "Error: Execution timed out after 60 seconds."
    except Exception as e:
        return f"Error executing python: {e}"
    finally:
        try:
            os.remove(path)
        except:
            pass

async def search_web(query: str) -> str:
    from agents import search_duckduckgo
    try:
        results = await search_duckduckgo(query, limit=5)
        if not results:
            return "No web results found."
        text_out = "\n".join([f"- {r['title']}: {r['snippet']} ({r['link']})" for r in results])
        return text_out
    except Exception as e:
        return f"Web search error: {e}"

async def get_stock_news(symbol: str) -> str:
    from llm_analyzer import LLMAnalyzer
    analyzer = LLMAnalyzer()
    try:
        news = await analyzer._scrape_news_for_symbol(symbol)
        if not news:
            return "No recent news found for this stock."
        return "\n".join([f"- [{n['source']}] {n['title']} ({n['pub_date']})" for n in news])
    except Exception as e:
        return f"Error fetching news: {e}"

async def get_technical_data(symbol: str) -> str:
    import yfinance as yf
    import pandas as pd
    import numpy as np
    
    try:
        # Use pandas_ta if available, otherwise manual basic stats
        # but the request asked for ADX, di, RSI. Let's do a simple calculation or write code to execute
        
        ticker = symbol.split(":")[-1] if ":" in symbol else symbol
        yf_ticker = f"{ticker}.NS" if symbol.startswith('NSE:') and not ticker.endswith('.NS') else ticker
        
        stock = await asyncio.to_thread(yf.Ticker, yf_ticker)
        hist = await asyncio.to_thread(stock.history, period="6mo")
        
        if hist.empty:
            return f"No price data found for {yf_ticker}"
        
        close = hist['Close']
        latest_price = close.iloc[-1]
        
        # Calculate RSI (14)
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        current_rsi = rsi.iloc[-1]
        
        # Calculate TR (True Range)
        high = hist['High']
        low = hist['Low']
        tr1 = high - low
        tr2 = (high - close.shift(1)).abs()
        tr3 = (low - close.shift(1)).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        
        # Calculate Directional Movement
        up_move = high - high.shift(1)
        down_move = low.shift(1) - low
        
        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0)
        
        plus_dm_series = pd.Series(plus_dm, index=hist.index)
        minus_dm_series = pd.Series(minus_dm, index=hist.index)
        
        atr14 = tr.ewm(alpha=1/14, adjust=False).mean()
        plus_di14 = 100 * (plus_dm_series.ewm(alpha=1/14, adjust=False).mean() / atr14)
        minus_di14 = 100 * (minus_dm_series.ewm(alpha=1/14, adjust=False).mean() / atr14)
        
        dx = 100 * (abs(plus_di14 - minus_di14) / (plus_di14 + minus_di14))
        adx14 = dx.ewm(alpha=1/14, adjust=False).mean()
        
        current_plus_di = plus_di14.iloc[-1]
        current_minus_di = minus_di14.iloc[-1]
        current_adx = adx14.iloc[-1]
        
        return f"""
        Symbol: {symbol}
        Latest Price: {latest_price:.2f}
        RSI (14): {current_rsi:.2f}
        +DI (14): {current_plus_di:.2f}
        -DI (14): {current_minus_di:.2f}
        ADX (14): {current_adx:.2f}
        
        Context:
        - ADX > 25 indicates a strong trend.
        - +DI > -DI means bullish trend direction.
        - RSI > 70 is overbought, < 30 is oversold.
        """
    except Exception as e:
        return f"Error calculating technical data: {e}"

async def execute_tool(tool_call: dict) -> str:
    name = tool_call.get("tool")
    args = tool_call.get("args", {})
    
    if name == "execute_python":
        return execute_python(args.get("code", ""))
    elif name == "search_web":
        return await search_web(args.get("query", ""))
    elif name == "get_stock_news":
        return await get_stock_news(args.get("symbol", ""))
    elif name == "get_technical_data":
        return await get_technical_data(args.get("symbol", ""))
    else:
        return f"Tool {name} not found."
