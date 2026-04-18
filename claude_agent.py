"""
Groq Vision Agent  autonomous chart analysis using Groq's official API.
Uses 'meta-llama/llama-4-scout-17b-16e-instruct' for image understanding of TradingView chart screenshots.
"""
import os
import json
import re
import asyncio
from datetime import datetime
from dotenv import load_dotenv

from groq import AsyncGroq

load_dotenv()

# We look for GROQ_API_KEY in the environment
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

class MistralVisionAgent:
    """Autonomous chart analyst powered by Groq and Llama 4 Scout."""

    def __init__(self):
        self.api_key = GROQ_API_KEY
        self.model = "meta-llama/llama-4-scout-17b-16e-instruct"
        
        if self.api_key:
            # We use AsyncGroq so we don't block the FastAPI event loop
            self.client = AsyncGroq(api_key=self.api_key)
        else:
            self.client = None

    async def analyze_chart_screenshot(
        self,
        image_base64: str,
        symbol: str,
        news_context: str = "",
        media_type: str = "image/png"
    ) -> dict:
        """
        Send a chart screenshot to Groq Native Vision and return structured analysis.
        """
        if not self.client:
            return self._error_response(
                symbol, 
                "Missing GROQ_API_KEY. Please add it to your .env file."
            )

        # Convert image to JPEG to guarantee compatibility with Groq Llama 4 Scout.
        # Transparent PNGs or large base64s often trigger 'invalid image data' errors.
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
            buf = BytesIO()
            im.save(buf, format='JPEG')
            jpeg_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            print(f"Image conversion failed: {e}")
            # fallback to original clean base64 if PIL fails
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

        try:
            chat_completion = await self.client.chat.completions.create(
                messages=[
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
                model=self.model,
                temperature=0.2,
                max_tokens=1024,
            )
            raw_text = chat_completion.choices[0].message.content.strip()

            # Strip markdown fences if present
            raw_text = re.sub(r'^```(?:json)?\s*', '', raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r'\s*```$', '', raw_text, flags=re.MULTILINE)
            raw_text = raw_text.strip()

            analysis = json.loads(raw_text)
            analysis["symbol"] = symbol
            analysis["analyzed_at"] = datetime.utcnow().isoformat()
            analysis["source"] = self.model
            return analysis

        except json.JSONDecodeError as e:
            # Fallback if the model didn't output strict JSON
            return self._error_response(symbol, f"Response parse error: {str(e)}\nRaw Response: {raw_text[:200]}")
        except Exception as e:
            print(f"Vision Agent exception: {e}")
            import traceback
            traceback.print_exc()
            return self._error_response(symbol, str(e))

    async def analyze_web_screenshot(self, image_base64: str) -> dict:
        """
        Send a web screenshot to Groq native vision to summarize the news layout and headline gravity.
        """
        if not self.client:
            return {"error": "Missing GROQ_API_KEY"}

        try:
            import base64
            from io import BytesIO
            from PIL import Image
            
            clean_b64 = image_base64
            if "," in clean_b64:
                clean_b64 = clean_b64.split(",", 1)[1]
                
            img_bytes = base64.b64decode(clean_b64)
            im = Image.open(BytesIO(img_bytes)).convert('RGB')
            buf = BytesIO()
            im.save(buf, format='JPEG')
            jpeg_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            jpeg_b64 = image_base64.split(",", 1)[-1] if "," in image_base64 else image_base64

        system_prompt = "You are an elite visual web analyst. Analyze the provided screenshot of a specific news website. Output plain text ONLY with no markdown."
        prompt = "Look at this screenshot of a news site. Summarize the single most prominent headline and story visible. State the impact this might have on global markets in 1 sentence. Make the response highly concise (max 3 sentences)."
        
        try:
            chat_completion = await self.client.chat.completions.create(
                messages=[
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
                model=self.model,
                temperature=0.2,
                max_tokens=600,
            )
            raw_text = chat_completion.choices[0].message.content.strip()
            return {"summary": raw_text}
        except Exception as e:
            return {"error": str(e)}

    async def chat(self, user_message: str, image_base64: str = "", history: list = None) -> str:
        """
        Generic conversational multimodal chat with Groq.
        """
        if not self.client:
            return "Error: Missing GROQ_API_KEY."

        messages = [
            {"role": "system", "content": "You are an elite trading assistant powered by Llama 4 Scout. Be concise, highly analytical, and helpful."}
        ]

        if history:
            for msg in history:
                messages.append({"role": msg["role"], "content": msg["content"]})

        content_arr = []
        if user_message:
            content_arr.append({"type": "text", "text": user_message})
        
        if image_base64:
            # Clean and convert to JPEG for Groq
            try:
                import base64
                from io import BytesIO
                from PIL import Image
                
                clean_b64 = image_base64
                if "," in clean_b64:
                    clean_b64 = clean_b64.split(",", 1)[1]
                    
                img_bytes = base64.b64decode(clean_b64)
                im = Image.open(BytesIO(img_bytes)).convert('RGB')
                buf = BytesIO()
                im.save(buf, format='JPEG')
                jpeg_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                
                content_arr.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{jpeg_b64}",
                    },
                })
            except Exception as e:
                print(f"Image chat conversion failed: {e}")
                # Fallback
                clean_enc = image_base64.split(",", 1)[-1] if "," in image_base64 else image_base64
                content_arr.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{clean_enc}",
                    },
                })
        
        # If no explicit message and there's an image, give a default prompt
        if not user_message and image_base64:
            content_arr.insert(0, {"type": "text", "text": "Analyze this image."})

        messages.append({
            "role": "user",
            "content": content_arr
        })

        try:
            chat_completion = await self.client.chat.completions.create(
                messages=messages,
                model=self.model,
                temperature=0.4,
                max_tokens=2048,
            )
            return chat_completion.choices[0].message.content.strip()
        except Exception as e:
            print(f"Chat Agent exception: {e}")
            return f"Error communicating with Groq: {e}"

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
