"""
llm_providers.py — Unified LLM provider abstraction for Artillegence AI.
Supports: Mistral, Ollama (local), Groq, Google Gemini, NVIDIA NIM.
All providers return a Mistral-compatible response dict:
    {"choices": [{"message": {"content": "..."}}]}
"""

import os
import json
import asyncio
import random
import aiohttp
from abc import ABC, abstractmethod
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

_openrouter_semaphore = asyncio.Semaphore(1)

class LLMProvider(ABC):
    """Base class for all LLM providers."""
    
    def __init__(self):
        self.provider_name = "base"
    
    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        response_format: dict | None = None,
        retries: int = 5,
    ) -> dict | None:
        """Return Mistral-compatible response dict or None on failure."""
        ...
    
    def _error_response(self, error_msg: str) -> dict:
        return {"choices": [{"message": {"content": f"[{self.provider_name}] Error: {error_msg}"}}]}
    
    async def _sleep_backoff(self, attempt: int, base: float = 2.0):
        wait = base * (attempt + 1) + random.uniform(0.5, 2.0)
        await asyncio.sleep(wait)


class MistralProvider(LLMProvider):
    MODEL_MAP = {
        "mistral-large-latest": "mistral-large-latest",
        "mistral-small": "mistral-small-latest",
        "open-mixtral-8x7b": "open-mixtral-8x7b",
    }
    def __init__(self):
        super().__init__()
        self.provider_name = "mistral"
        self.api_key = os.getenv("MISTRAL_API_KEY", "")
        self.api_url = "https://api.mistral.ai/v1/chat/completions"
        self.default_model = "mistral-large-latest"
    
    def _resolve_model(self, model: str | None) -> str:
        if model and model in self.MODEL_MAP:
            return self.MODEL_MAP[model]
        return model or self.default_model
    
    async def chat(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        if not self.api_key:
            return self._error_response("MISTRAL_API_KEY missing")
        
        resolved_model = self._resolve_model(model)
        payload = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if response_format:
            payload["response_format"] = response_format
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        for attempt in range(retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        self.api_url, headers=headers, json=payload, timeout=60
                    ) as resp:
                        if resp.status == 200:
                            return await resp.json()
                        elif resp.status == 429:
                            print(f"   [MISTRAL] Rate limited (429). Retry {attempt+1}/{retries}")
                            await self._sleep_backoff(attempt)
                            continue
                        elif resp.status == 401:
                            return self._error_response("401 Unauthorized — invalid API key")
                        else:
                            text = await resp.text()
                            print(f"   [MISTRAL] Error {resp.status}: {text[:200]}")
                            await self._sleep_backoff(attempt)
            except Exception as e:
                print(f"   [MISTRAL] Exception: {e}")
                await self._sleep_backoff(attempt)
        
        return self._error_response("All retries exhausted")


class GroqProvider(LLMProvider):
    MODEL_MAP = {
        "mistral-large-latest": "qwen/qwen3.8-27b",
        "mistral-small": "allam-2-7b",
        "default": "qwen/qwen3.8-27b",
    }
    """
    Groq cloud inference — ultra-fast (300+ tokens/sec), generous free tier.
    Free tier: 30 req/min, 14,400 req/day.
    Recommended models: llama-3.1-70b-versatile, mixtral-8x7b-32768
    """
    def __init__(self):
        super().__init__()
        self.provider_name = "groq"
        self.api_key = os.getenv("GROQ_API_KEY", "")
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        self.default_model = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    
    def _resolve_model(self, model: str | None) -> str:
        if model and model in self.MODEL_MAP:
            return self.MODEL_MAP[model]
        return model or self.default_model
    
    async def chat(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        if not self.api_key:
            return self._error_response("GROQ_API_KEY missing")
        
        resolved_model = self._resolve_model(model)
        payload = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if response_format:
            payload["response_format"] = response_format
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        for attempt in range(retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        self.api_url, headers=headers, json=payload, timeout=60
                    ) as resp:
                        if resp.status == 200:
                            return await resp.json()
                        elif resp.status == 429:
                            print(f"   [GROQ] Rate limited (429). Retry {attempt+1}/{retries}")
                            await self._sleep_backoff(attempt, base=5.0)
                            continue
                        else:
                            text = await resp.text()
                            print(f"   [GROQ] Error {resp.status}: {text[:200]}")
                            await self._sleep_backoff(attempt)
            except Exception as e:
                print(f"   [GROQ] Exception: {e}")
                await self._sleep_backoff(attempt)
        
        return self._error_response("All Groq retries exhausted")

    async def chat_stream(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None):
        if not self.api_key:
            yield self._error_response("GROQ_API_KEY missing")
            return
            
        resolved_model = self._resolve_model(model)
        payload = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        if max_tokens: payload["max_tokens"] = max_tokens
        if response_format: payload["response_format"] = response_format
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, headers=headers, json=payload, timeout=60) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        yield {"error": f"Groq Error {resp.status}: {text}"}
                        return
                        
                    async for line in resp.content:
                        line = line.decode('utf-8').strip()
                        if line.startswith('data: '):
                            data_str = line[6:]
                            if data_str == '[DONE]':
                                break
                            try:
                                yield json.loads(data_str)
                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            yield {"error": str(e)}


class OpenRouterProvider(LLMProvider):
    # nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free was decommissioned by Nvidia (404)
    # Current working alternatives (tested 2026-08-13):
    #   nvidia/nemotron-3-super-120b-a12b:free   — best quality
    #   nvidia/nemotron-3.5-lightning:free        — fastest
    MODEL_MAP = {
        "mistral-large-latest": "nvidia/nemotron-3-super-120b-a12b:free",
        "mistral-small": "nvidia/nemotron-3.5-lightning:free",
        "default": "nvidia/nemotron-3-super-120b-a12b:free",
    }
    
    def __init__(self):
        super().__init__()
        self.provider_name = "openrouter"
        self.api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        self.default_model = "nvidia/nemotron-3-super-120b-a12b:free"
    
    def _resolve_model(self, model: str | None) -> str:
        if model and model in self.MODEL_MAP:
            return self.MODEL_MAP[model]
        return model or self.default_model
    
    async def chat(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        if not self.api_key:
            return self._error_response("OPENROUTER_API_KEY missing")
        
        resolved_model = self._resolve_model(model)
        payload = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
        }
        
        # Enable reasoning for models that support it
        if "reasoning" in resolved_model or "super" in resolved_model:
            payload["reasoning"] = {"enabled": True}
            
        if max_tokens:
            payload["max_tokens"] = max_tokens
            
        # Optional: handle JSON format hint if requested
        if response_format and response_format.get("type") == "json_object":
            if not payload["messages"] or payload["messages"][0]["role"] != "system":
                payload["messages"].insert(0, {"role": "system", "content": "IMPORTANT: Respond ONLY with valid JSON."})
            else:
                payload["messages"][0]["content"] += " IMPORTANT: Respond ONLY with valid JSON."
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        for attempt in range(retries):
            try:
                import aiohttp
                async with _openrouter_semaphore:
                    async with aiohttp.ClientSession() as session:
                        async with session.post(
                            self.api_url, headers=headers, json=payload, timeout=60
                        ) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                content_val = data['choices'][0]['message'].get('content', '')
                                reasoning_val = data['choices'][0]['message'].get('reasoning_details')
                                
                                msg_dict = {"role": "assistant", "content": content_val}
                                if reasoning_val:
                                    msg_dict["reasoning_details"] = reasoning_val
                                    
                                return {"choices": [{"message": msg_dict}]}
                            elif resp.status == 429:
                                print(f"   [OPENROUTER] Rate limited. Retry {attempt+1}/{retries}")
                                await self._sleep_backoff(attempt)
                                continue
                            else:
                                text = await resp.text()
                                print(f"   [OPENROUTER] Error {resp.status}: {text[:200]}")
                                await self._sleep_backoff(attempt)
            except Exception as e:
                print(f"   [OPENROUTER] Exception: {e}")
                await self._sleep_backoff(attempt)
        
        return self._error_response("All retries exhausted")

    async def chat_stream(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        if not self.api_key:
            yield {"error": "OPENROUTER_API_KEY missing"}
            return
            
        resolved_model = self._resolve_model(model)
        payload = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
            "stream": True
        }
        
        if "reasoning" in resolved_model or "super" in resolved_model:
            payload["reasoning"] = {"enabled": True}
            
        if max_tokens:
            payload["max_tokens"] = max_tokens
            
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        
        for attempt in range(retries):
            try:
                timeout = aiohttp.ClientTimeout(total=90)
                async with _openrouter_semaphore:
                    async with aiohttp.ClientSession(timeout=timeout) as session:
                        async with session.post(self.api_url, headers=headers, json=payload) as resp:
                            if resp.status == 200:
                                async for line in resp.content:
                                    line = line.decode('utf-8', errors='replace').strip()
                                    if line.startswith("data: ") and line != "data: [DONE]":
                                        data_str = line[6:]
                                        try:
                                            chunk = json.loads(data_str)
                                            yield chunk
                                        except Exception:
                                            pass
                                return
                            elif resp.status == 429:
                                with open("stream_debug.log", "a") as f: f.write(f"Rate limited 429 on attempt {attempt+1}\n")
                                await self._sleep_backoff(attempt)
                                continue
                            else:
                                text = await resp.text()
                                with open("stream_debug.log", "a") as f: f.write(f"Error {resp.status}: {text[:300]}\n")
                                yield {"error": f"Error {resp.status}: {text[:200]}"}
                                return
            except Exception as e:
                import traceback
                with open("stream_debug.log", "a") as f: f.write(f"Exception {attempt+1}/{retries}: {type(e).__name__}: {e}\n{traceback.format_exc()}\n")
                if attempt < retries - 1:
                    await self._sleep_backoff(attempt)
        yield {"error": "All retries exhausted"}



class GeminiProvider(LLMProvider):
    def __init__(self):
        super().__init__()
        self.provider_name = "gemini"
        self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        self.default_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=self.api_key)
        return self._client
        
    def _resolve_model(self, model: str | None) -> str:
        # Ignore models meant for mistral or openrouter and default to Gemini
        if model and ("mistral" in model or "omni" in model):
            return self.default_model
        return model or self.default_model

    async def chat(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        if not self.api_key:
            return self._error_response("GEMINI_API_KEY missing")
            
        client = self._get_client()
        resolved_model = self._resolve_model(model)
        
        # Convert mistral-format messages to google-genai format
        from google.genai import types
        gemini_messages = []
        for msg in messages:
            role = "user" if msg["role"] in ["user", "system"] else "model"
            gemini_messages.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))
            
        config = types.GenerateContentConfig(temperature=temperature)
        if response_format and response_format.get("type") == "json_object":
            config.response_mime_type = "application/json"
            
        for attempt in range(retries):
            try:
                resp = await client.aio.models.generate_content(
                    model=resolved_model,
                    contents=gemini_messages,
                    config=config
                )
                return {"choices": [{"message": {"content": resp.text}}]}
            except Exception as e:
                err_str = str(e)
                if "429" in err_str or "quota" in err_str.lower():
                    print(f"   [GEMINI] Quota/Rate limit: {err_str[:100]}")
                    if attempt == retries - 1:
                        return self._error_response("All Gemini retries exhausted due to quota.")
                print(f"   [GEMINI] Error: {err_str[:100]}")
                await self._sleep_backoff(attempt)
                
        return self._error_response("All Gemini retries exhausted")

    async def chat_stream(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        if not self.api_key:
            yield {"error": "GEMINI_API_KEY missing"}
            return
            
        client = self._get_client()
        resolved_model = self._resolve_model(model)
        
        from google.genai import types
        gemini_messages = []
        for msg in messages:
            role = "user" if msg["role"] in ["user", "system"] else "model"
            gemini_messages.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))
            
        config = types.GenerateContentConfig(temperature=temperature)
        if response_format and response_format.get("type") == "json_object":
            config.response_mime_type = "application/json"
            
        try:
            response_stream = await client.aio.models.generate_content_stream(
                model=resolved_model,
                contents=gemini_messages,
                config=config
            )
            async for chunk in response_stream:
                if chunk.text:
                    yield {"choices": [{"delta": {"content": chunk.text}}]}
        except Exception as e:
            yield {"error": str(e)}
class OllamaProvider(LLMProvider):
    def __init__(self):
        super().__init__()
        import ollama
        self.provider_name = "ollama"
        self.client = ollama.AsyncClient(host=os.getenv("OLLAMA_API_URL", "http://localhost:11434"))
        self.default_model = "ornith"
    
    async def chat(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        resolved_model = model or self.default_model
        
        options = {"temperature": temperature}
        if max_tokens:
            options["num_predict"] = max_tokens
            
        kwargs = {
            "model": resolved_model,
            "messages": messages,
            "options": options,
            "stream": False
        }
        
        if response_format and response_format.get("type") == "json_object":
            kwargs["format"] = "json"

        for attempt in range(retries):
            try:
                response = await self.client.chat(**kwargs)
                return {
                    "choices": [
                        {
                            "message": {
                                "content": response.message.content
                            }
                        }
                    ]
                }
            except Exception as e:
                if attempt == retries - 1:
                    return self._error_response(f"Ollama API Error: {e}")
                await self._sleep_backoff(attempt)
        
        return self._error_response("Max retries exceeded for Ollama")

    async def chat_stream(self, messages, model=None, temperature=0.7, max_tokens=None):
        resolved_model = model or self.default_model
        
        options = {"temperature": temperature}
        if max_tokens:
            options["num_predict"] = max_tokens
            
        kwargs = {
            "model": resolved_model,
            "messages": messages,
            "options": options,
            "stream": True
        }

        try:
            async for chunk in await self.client.chat(**kwargs):
                if chunk.message and chunk.message.content:
                    yield {"choices": [{"delta": {"content": chunk.message.content}}]}
        except Exception as e:
            yield {"error": f"Ollama Connection Error: {str(e)}"}

class LMStudioProvider(LLMProvider):
    def __init__(self):
        super().__init__()
        self.provider_name = "lmstudio"
        self.api_url = os.getenv("LMSTUDIO_API_URL", "http://localhost:1234/v1/chat/completions")
        self.default_model = "local-model"
    
    async def chat(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        resolved_model = model or self.default_model
        
        payload = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
            "stream": False
        }
        
        if max_tokens:
            payload["max_tokens"] = max_tokens
            
        if response_format and response_format.get("type") == "json_object":
            payload["response_format"] = {"type": "json_object"}

        headers = {"Content-Type": "application/json"}

        for attempt in range(retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(self.api_url, json=payload, headers=headers, timeout=120) as resp:
                        if resp.status == 200:
                            return await resp.json()
                        else:
                            error_text = await resp.text()
                            if attempt == retries - 1:
                                return self._error_response(f"LM Studio API Error {resp.status}: {error_text}")
                            await self._sleep_backoff(attempt)
            except Exception as e:
                if attempt == retries - 1:
                    return self._error_response(f"Connection error to LM Studio at {self.api_url}: {e}")
                await self._sleep_backoff(attempt)
        
        return self._error_response("Max retries exceeded for LM Studio")

    async def chat_stream(self, messages, model=None, temperature=0.7, max_tokens=None):
        resolved_model = model or self.default_model
        
        payload = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
            "stream": True
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        headers = {"Content-Type": "application/json"}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, json=payload, headers=headers, timeout=120) as resp:
                    if resp.status != 200:
                        yield {"error": f"LM Studio Error {resp.status}"}
                        return
                    
                    async for line in resp.content:
                        line = line.decode('utf-8').strip()
                        if not line or line == "data: [DONE]":
                            continue
                        if line.startswith("data: "):
                            try:
                                data = json.loads(line[6:])
                                if "choices" in data and len(data["choices"]) > 0:
                                    delta = data["choices"][0].get("delta", {})
                                    if "content" in delta:
                                        yield {"choices": [{"delta": {"content": delta["content"]}}]}
                            except json.JSONDecodeError:
                                continue
        except Exception as e:
            yield {"error": f"LM Studio Connection Error: {str(e)}"}

class FallbackProvider(LLMProvider):
    """
    Smart fallback: tries Gemini first, instantly switches to Groq when
    Gemini hits a quota or rate-limit error. No retries wasted on quota.
    """
    def __init__(self):
        super().__init__()
        self.provider_name = "gemini_fallback"
        self._primary = GeminiProvider()
        self._fallback = GroqProvider()
        self._quota_exhausted = False   # flip to True when Gemini quota hits

    @property
    def default_model(self):
        return self._primary.default_model

    async def chat(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None, retries=5):
        # If Gemini quota already known exhausted, go straight to Groq
        if not self._quota_exhausted:
            try:
                result = await self._primary.chat(
                    messages, model=model, temperature=temperature,
                    max_tokens=max_tokens, response_format=response_format, retries=2
                )
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                # If Gemini returned an exhausted error, fall through to Groq
                if "All Gemini retries exhausted" not in content:
                    return result
                print("   [FALLBACK] Gemini quota exhausted — switching to Groq")
                self._quota_exhausted = True
            except Exception as e:
                print(f"   [FALLBACK] Gemini error, switching to Groq: {e}")
                self._quota_exhausted = True

        print("   [FALLBACK] Using Groq")
        return await self._fallback.chat(
            messages, model=model, temperature=temperature,
            max_tokens=max_tokens, response_format=response_format, retries=retries
        )

    async def chat_stream(self, messages, model=None, temperature=0.7, max_tokens=None, response_format=None):
        if not self._quota_exhausted:
            failed = False
            async for chunk in self._primary.chat_stream(messages, model, temperature, max_tokens, response_format):
                if "error" in chunk:
                    failed = True
                    break
                yield chunk
            if not failed:
                return
            self._quota_exhausted = True
            
        async for chunk in self._fallback.chat_stream(messages, model, temperature, max_tokens, response_format):
            yield chunk


def get_llm_provider() -> LLMProvider:
    """
    Factory: select provider based on LLM_PROVIDER env var.
    Options:
      gemini_with_fallback (default) — Gemini first, auto-falls back to Groq on quota
      gemini  — Gemini only
      groq    — Groq only (Llama-3.1-70B, no daily token limit)
      mistral — Mistral only
      ollama  — Local Ollama
    """
    provider_name = os.getenv("LLM_PROVIDER", "gemini_with_fallback").lower().strip()

    providers = {
        "gemini_with_fallback": FallbackProvider,
        "gemini":  GeminiProvider,
        "groq":    GroqProvider,
        "mistral": MistralProvider,
        "openrouter": OpenRouterProvider,
        "ollama": OllamaProvider,
        "lmstudio": LMStudioProvider,
    }

    provider_cls = providers.get(provider_name)
    if not provider_cls:
        print(f"   [LLM] Unknown provider '{provider_name}', using gemini_with_fallback")
        provider_cls = FallbackProvider

    provider = provider_cls()
    print(f"   [LLM] Using provider: {provider.provider_name} (model: {getattr(provider, 'default_model', 'N/A')})")


    return provider
