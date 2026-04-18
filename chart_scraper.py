"""
Chart Scraper  uses Playwright to capture high-quality screenshots of TradingView charts.
This bypasses CORS and CSS limitations of client-side capture (html2canvas).
"""
import asyncio
import base64
import os
import time
from playwright.async_api import async_playwright

class ChartScraper:
    def __init__(self):
        self.browser = None
        self.context = None

    async def get_chart_screenshot(self, symbol: str, width: int = 1200, height: int = 800) -> str:
        """
        Navigates to TradingView embed, captures a screenshot, and returns base64.
        
        Args:
            symbol: Symbol e.g. "NSE:RELIANCE"
            width: Viewport width
            height: Viewport height
            
        Returns:
            Base64 encoded PNG string (without prefix)
        """
        # Clean symbol for URL
        clean_symbol = symbol.replace(" ", "")
        url = f"https://s.tradingview.com/widgetembed/?symbol={clean_symbol}&theme=dark&interval=D&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=[]&hideideas=1"
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=2 # Retina quality for better AI analysis
            )
            page = await context.new_page()
            
            try:
                # Use load instead of networkidle because TradingView has endless tracking/ad requests
                await page.goto(url, wait_until="load", timeout=30000)
                
                # Wait for the chart to stabilize (let candle data load)
                await asyncio.sleep(4) 

                # Take screenshot of the chart area (which is almost the whole page in embed view)
                screenshot_bytes = await page.screenshot(type="png", full_page=False)
                
                # Convert to base64
                encoded = base64.b64encode(screenshot_bytes).decode('utf-8')
                return encoded
                
            except Exception as e:
                print(f"ChartScraper ERROR for {symbol}: {e}")
                return "" # Return empty string on failure
            finally:
                await browser.close()
        
        return "" # Final fallback

# Singleton instance
scraper = ChartScraper()
