"""
Nvidia Vision Agent  autonomous chart analysis using NVIDIA NIM.
Uses configurable models via llm_providers abstraction.
Default: z-ai/glm-5.2 (OpenAI-compatible, supports vision)
"""
import os
import json
import re
import asyncio
from datetime import datetime
from dotenv import load_dotenv
import aiohttp

load_dotenv()

def get_market_context_for_agent() -> str:
    try:
        import database as db
        context_parts = []
        
        # 1. Geopolitical Events / Live News Map
        geo_events = db.get_geo_events(limit=5)
        if geo_events:
            context_parts.append("### RECENT LIVE GEOPOLITICAL / MARKET EVENTS:")
            for ev in geo_events:
                headline = ev.get('headline', 'No Title')
                summary = ev.get('summary', '')
                city = ev.get('city', '')
                country = ev.get('country', '')
                ts = ev.get('timestamp', '')[:16].replace('T', ' ')
                context_parts.append(f"- [{ts}] {headline} ({city}, {country}): {summary}")
                
        # 2. Latest Indian Market Tracker
        mkt_intel = db.get_intelligence("indian_market_tracker")
        if mkt_intel and "summary" in mkt_intel:
            context_parts.append("### INDIAN MARKET STATUS:")
            context_parts.append(mkt_intel["summary"])
        elif mkt_intel and "news_items" in mkt_intel:
            context_parts.append("### INDIAN MARKET HEADLINES:")
            for item in mkt_intel["news_items"][:5]:
                context_parts.append(f"- {item.get('title', '')} ({item.get('snippet', '')[:100]}...)")
                
        # 3. Market Opportunities Found
        opp_intel = db.get_intelligence("opportunity_finder")
        if opp_intel and "opportunities" in opp_intel:
            context_parts.append("### MARKET OPPORTUNITIES FOUND:")
            for opp in opp_intel["opportunities"][:3]:
                context_parts.append(f"- {opp.get('symbol', 'N/A')}: {opp.get('sentiment', '')} - {opp.get('trigger', '')}")
                
        if not context_parts:
            return "No real-time market data in DB."
            
        return "\n".join(context_parts)
    except Exception as e:
        print(f"Error compiling market context: {e}")
        return "Unable to fetch live market context."

class MistralVisionAgent:
    """Autonomous chart analyst powered by configurable LLM provider."""

    def __init__(self):
        self.model = os.getenv("VISION_MODEL", "z-ai/glm-5.2")
        self._provider = None

    async def _get_provider(self):
        if self._provider is None:
            from llm_providers import get_llm_provider
            self._provider = get_llm_provider()
        return self._provider
    
    async def _call_provider(self, payload: dict) -> dict:
        from llm_analyzer import call_mistral_raw
        return await call_mistral_raw(payload)

    async def analyze_chart_screenshot(
        self,
        image_base64: str,
        symbol: str,
        news_context: str = "",
        media_type: str = "image/png"
    ) -> dict:
        """
        Send a chart screenshot to LLM provider and return structured analysis.
        """
        # Convert image to JPEG to guarantee compatibility
        try:
            import base64
            from io import BytesIO
            from PIL import Image
            
            # Remove data URI prefix if it exists
            clean_b64 = image_base64
            if "," in clean_b64:
                clean_b64 = clean_b64.split(",", 1)[1]
                
            img_bytes = base64.b64decode(clean_b64)
            im = Image.open(BytesIO(img_bytes))
            im = im.convert('RGB')
            im.thumbnail((800, 800))
            buf = BytesIO()
            im.save(buf, format='JPEG', quality=80)
            jpeg_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            print(f"Image conversion failed: {e}")
            jpeg_b64 = image_base64.split(",", 1)[-1] if "," in image_base64 else image_base64

        system_prompt = "You are a helpful technical analyst that outputs valid JSON only. Respond with ONLY valid JSON, no markdown fences, no extra text."
        
        prompt = f"""You are an elite autonomous technical analyst with 20+ years of experience in price action, 
Elliott Wave theory, Fibonacci levels, volume analysis, VWAP, candlestick patterns, and chart structure.

You are analyzing a TradingView chart screenshot for: {symbol}

{f'Recent news context (use to inform bias if relevant):{chr(10)}{news_context}' if news_context else ''}

Analyze the chart deeply and provide a JSON response with this EXACT structure:
{{
    "bias": "LONG" | "SHORT" | "NEUTRAL",
    "trend": {{
        "direction": "UPTREND" | "DOWNTREND" | "SIDEWAYS",
        "strength": "STRONG" | "MODERATE" | "WEAK",
        "description": "1-2 sentences on trend structure"
    }},
    "key_levels": {{
        "support": ["level1", "level2"],
        "resistance": ["level1", "level2"]
    }},
    "patterns": ["Pattern name 1", "Pattern name 2"],
    "candlestick": "Latest candlestick pattern visible",
    "volume_analysis": "1 sentence on volume behavior",
    "vwap_position": "ABOVE" | "BELOW" | "AT" | "NOT_VISIBLE",
    "entry_zone": "Price range for entry",
    "stop_loss": "Suggested stop-loss level",
    "target_1": "First price target",
    "target_2": "Second price target",
    "risk_reward": "e.g. 1:2.5",
    "commentary": "2-3 sentences of professional trading commentary",
    "confidence": "HIGH" | "MEDIUM" | "LOW"
}}

All price levels should use actual values visible on the chart's Y-axis."""

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{jpeg_b64}",
                            },
                        },
                    ],
                }
            ],
            "temperature": 0.2,
            "max_tokens": 2048
        }

        try:
            res_data = await self._call_provider(payload)
            if not res_data or not res_data.get("choices"):
                return self._error_response(symbol, "Empty response from provider")
                
            raw_text = res_data["choices"][0]["message"]["content"].strip()

            # Strip markdown fences if present
            raw_text = re.sub(r'^```(?:json)?\s*', '', raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r'\s*```$', '', raw_text, flags=re.MULTILINE)
            raw_text = raw_text.strip()

            # Check if this is an injected provider error (e.g. "[mistral] Error:")
            if raw_text.strip().startswith("[") and "Error:" in raw_text:
                return self._error_response(symbol, raw_text)

            analysis = json.loads(raw_text)
            analysis["symbol"] = symbol
            analysis["analyzed_at"] = datetime.utcnow().isoformat()
            analysis["source"] = self.model
            return analysis

        except json.JSONDecodeError as e:
            raw = raw_text if 'raw_text' in dir() else "N/A"
            return self._error_response(symbol, f"Response parse error: {str(e)}\nRaw Response: {raw[:200]}")
        except Exception as e:
            print(f"Vision Agent exception: {e}")
            import traceback
            traceback.print_exc()
            return self._error_response(symbol, str(e))

    async def analyze_web_screenshot(self, image_base64: str) -> dict:
        """
        Send a web screenshot to LLM provider to summarize the news layout and headline gravity.
        """
        try:
            import base64
            from io import BytesIO
            from PIL import Image
            
            clean_b64 = image_base64
            if "," in clean_b64:
                clean_b64 = clean_b64.split(",", 1)[1]
                
            img_bytes = base64.b64decode(clean_b64)
            im = Image.open(BytesIO(img_bytes)).convert('RGB')
            im.thumbnail((800, 800))
            buf = BytesIO()
            im.save(buf, format='JPEG', quality=80)
            jpeg_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            jpeg_b64 = image_base64.split(",", 1)[-1] if "," in image_base64 else image_base64

        system_prompt = "You are an elite visual web analyst. Analyze the provided screenshot of a specific news website. Output plain text ONLY with no markdown."
        prompt = "Look at this screenshot of a news site. Summarize the single most prominent headline and story visible. State the impact this might have on global markets in 1 sentence. Make the response highly concise (max 3 sentences)."
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{jpeg_b64}",
                            },
                        },
                    ],
                }
            ],
            "temperature": 0.2,
            "max_tokens": 1024
        }

        try:
            res_data = await self._call_provider(payload)
            if not res_data or not res_data.get("choices"):
                return {"error": "Empty response from provider"}
            raw_text = res_data["choices"][0]["message"]["content"].strip()
            return {"summary": raw_text}
        except Exception as e:
            return {"error": str(e)}

    async def chat(self, user_message: str, image_base64: str = "", history: list = None) -> str:
        """
        Generic conversational multimodal chat with configurable LLM, injected with live market news/context.
        """
        market_context = get_market_context_for_agent()
        system_prompt = (
            f"You are an elite trading assistant powered by {self.model}. Be concise, highly analytical, and helpful.\n"
            "Below is the current real-time market news and geopolitical situation from our database. "
            "Use this context to inform your responses, biases, and analysis.\n\n"
            f"{market_context}"
        )

        messages = [
            {"role": "system", "content": system_prompt}
        ]

        if history:
            for msg in history:
                messages.append({"role": msg["role"], "content": msg["content"]})

        content_arr = []
        if user_message:
            content_arr.append({"type": "text", "text": user_message})
        
        if image_base64:
            try:
                import base64
                from io import BytesIO
                from PIL import Image
                
                clean_b64 = image_base64
                if "," in clean_b64:
                    clean_b64 = clean_b64.split(",", 1)[1]
                    
                img_bytes = base64.b64decode(clean_b64)
                im = Image.open(BytesIO(img_bytes)).convert('RGB')
                im.thumbnail((800, 800))
                buf = BytesIO()
                im.save(buf, format='JPEG', quality=80)
                jpeg_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                
                content_arr.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{jpeg_b64}",
                    },
                })
            except Exception as e:
                print(f"Image chat conversion failed: {e}")
                clean_enc = image_base64.split(",", 1)[-1] if "," in image_base64 else image_base64
                content_arr.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{clean_enc}",
                    },
                })
        
        if not user_message and image_base64:
            content_arr.insert(0, {"type": "text", "text": "Analyze this image."})

        if content_arr:
            messages.append({
                "role": "user",
                "content": content_arr if len(content_arr) > 1 or (content_arr and content_arr[0]["type"] == "image_url") else content_arr[0]["text"]
            })

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": 2048
        }

        try:
            res_data = await self._call_provider(payload)
            if not res_data or not res_data.get("choices"):
                return "Error: Empty response from provider"
            
            msg_obj = res_data["choices"][0]["message"]
            raw_text = msg_obj.get("content")
            if isinstance(raw_text, list):
                raw_text = " ".join([b.get("text", "") for b in raw_text if isinstance(b, dict)])
            elif raw_text is None:
                raw_text = ""
            raw_text = str(raw_text).strip()
            
            reasoning = msg_obj.get("reasoning_details")
            if reasoning:
                reasoning = str(reasoning).strip()
                raw_text = f"💭 **Reasoning**:\n{reasoning}\n\n{raw_text}"
            
            # If provider failed and returned an error string AND we sent an image, fallback to text only
            if (raw_text.startswith("[") and ("Error:" in raw_text or "All retries exhausted" in raw_text)) and image_base64:
                print("Image payload failed, falling back to text-only chat...")
                # Try again without the image
                fallback_payload = payload.copy()
                fallback_payload["messages"][-1]["content"] = user_message or "Analyze this image."
                
                res_data_fallback = await self._call_provider(fallback_payload)
                if res_data_fallback and res_data_fallback.get("choices"):
                    fb_msg = res_data_fallback["choices"][0]["message"]
                    fb_text = fb_msg.get("content")
                    if isinstance(fb_text, list):
                        fb_text = " ".join([b.get("text", "") for b in fb_text if isinstance(b, dict)])
                    elif fb_text is None:
                        fb_text = ""
                    fb_text = str(fb_text).strip()
                    
                    fb_reasoning = fb_msg.get("reasoning_details")
                    if fb_reasoning:
                        fb_reasoning = str(fb_reasoning).strip()
                        fb_text = f"💭 **Reasoning**:\n{fb_reasoning}\n\n{fb_text}"
                        
                    if not (fb_text.startswith("[") and "Error:" in fb_text):
                        return f"(Note: The active AI model rejected the image, so I am answering based on text only.)\n\n{fb_text}"
            
            return raw_text
        except Exception as e:
            print(f"Chat Agent exception: {e}")
            return f"Error communicating with LLM provider: {e}"

    def _error_response(self, symbol: str, error: str) -> dict:
        return {
            "symbol": symbol,
            "bias": "NEUTRAL",
            "trend": {"direction": "SIDEWAYS", "strength": "WEAK", "description": "Analysis unavailable."},
            "key_levels": {"support": [], "resistance": []},
            "patterns": [],
            "candlestick": "",
            "volume_analysis": "N/A",
            "vwap_position": "NOT_VISIBLE",
            "entry_zone": "N/A",
            "stop_loss": "N/A",
            "target_1": "N/A",
            "target_2": "",
            "risk_reward": "N/A",
            "commentary": f" Vision analysis failed: {error}",
            "confidence": "LOW",
            "analyzed_at": datetime.utcnow().isoformat(),
            "source": self.model,
            "error": error
        }
