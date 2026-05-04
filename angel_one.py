import os
import time
import requests
import pyotp
import urllib.parse
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

ANGEL_API_KEY = os.getenv("ANGEL_API_KEY", "")
ANGEL_CLIENT_CODE = os.getenv("ANGEL_CLIENT_CODE", "")
ANGEL_PIN = os.getenv("ANGEL_PIN", "")
ANGEL_TOTP_SECRET = os.getenv("ANGEL_TOTP_SECRET", "")

class AngelOneClient:
    def __init__(self):
        self.base_url = "https://apiconnect.angelone.in"
        self.api_key = ANGEL_API_KEY
        self.client_code = ANGEL_CLIENT_CODE
        self.pin = ANGEL_PIN
        self.totp_secret = ANGEL_TOTP_SECRET
        
        self.auth_token = None
        self.feed_token = None
        self.refresh_token = None
        self.token_expiry = 0
        
        # Scrip mapping: symbol string to token ID
        self.scrip_map = {}
        
    def _get_headers(self, require_auth=True):
        headers = {
            'X-PrivateKey': self.api_key,
            'Accept': 'application/json',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '127.0.0.1',
            'X-MACAddress': '00:00:00:00:00:00',
            'X-UserType': 'USER',
            'Content-Type': 'application/json'
        }
        if require_auth and self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'
        return headers

    def is_configured(self):
        return all([self.api_key, self.client_code, self.pin, self.totp_secret])

    def login(self):
        if not self.is_configured():
            print("Angel One Client not configured. Missing credentials.")
            return False
            
        try:
            totp = pyotp.TOTP(self.totp_secret).now()
            
            payload = {
                "clientcode": self.client_code,
                "password": self.pin,
                "totp": totp
            }
            
            response = requests.post(
                f"{self.base_url}/rest/auth/angelbroking/user/v1/loginByPassword",
                json=payload,
                headers=self._get_headers(require_auth=False)
            )
            data = response.json()
            
            if data.get("status") and data.get("data"):
                auth_data = data["data"]
                self.auth_token = auth_data.get("jwtToken")
                self.refresh_token = auth_data.get("refreshToken")
                self.feed_token = auth_data.get("feedToken")
                
                # Assume token lasts for ~1 hour, refresh slightly before
                self.token_expiry = time.time() + 3000 
                return True
            else:
                print(f"Angel One Login failed: {data.get('message')}")
                return False
                
        except Exception as e:
            print(f"Error during Angel One login: {e}")
            return False

    def ensure_authenticated(self):
        if not self.auth_token or time.time() > self.token_expiry:
            return self.login()
        return True

    def load_scrip_master(self):
        """Download and cache the scrip master JSON from Angel One to map symbols to tokens."""
        if self.scrip_map:
            return True
            
        cache_file = "scrip_master.json"
        
        # Download if doesn't exist
        if not os.path.exists(cache_file):
            print("Downloading Angel One Scrip Master JSON...")
            try:
                response = requests.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json")
                with open(cache_file, "wb") as f:
                    f.write(response.content)
            except Exception as e:
                print(f"Failed to download Scrip Master: {e}")
                return False
        
        # Load and parse into map
        try:
            import json
            with open(cache_file, "r") as f:
                scrip_data = json.load(f)
                
            for item in scrip_data:
                # E.g. RELIANCE-EQ in NSE
                if item.get("exch_seg") in ["NSE", "BSE"]:
                    sym = item.get("symbol", "")
                    tok = item.get("token", "")
                    
                    # Store standard string maps (e.g. "RELIANCE-EQ" -> "2885")
                    self.scrip_map[f"{item['exch_seg']}:{sym}"] = tok
                    
                    # Also map just the base symbol to EQ for convenience (e.g. "NSE:RELIANCE")
                    if sym.endswith("-EQ"):
                        base = sym[:-3]
                        self.scrip_map[f"{item['exch_seg']}:{base}"] = tok
            return True
        except Exception as e:
            print(f"Error loading scrip master: {e}")
            return False

    def get_token_for_symbol(self, full_symbol):
        """Map standard symbol (e.g., NSE:RELIANCE) to Angel token."""
        # Check standard map
        if full_symbol in self.scrip_map:
            return self.scrip_map[full_symbol]
        
        # If passed without exchange prefix but contains .NS, format to NSE:SYMBOL
        if ".NS" in full_symbol:
            base = full_symbol.replace(".NS", "")
            return self.scrip_map.get(f"NSE:{base}")
        elif ".BO" in full_symbol:
            base = full_symbol.replace(".BO", "")
            return self.scrip_map.get(f"BSE:{base}")
            
        # Try finding without exchange
        base_sym = full_symbol
        if ":" in full_symbol:
            base_sym = full_symbol.split(":")[1]
            
        return self.scrip_map.get(f"NSE:{base_sym}") or self.scrip_map.get(f"BSE:{base_sym}")

    def get_exchange_for_symbol(self, full_symbol):
        if full_symbol.startswith("BSE:") or ".BO" in full_symbol:
            return "BSE"
        return "NSE"

    def fetch_live_quote(self, symbol):
        """Fetch the Live Market Quote for a symbol."""
        if not self.ensure_authenticated():
            return None
            
        if not self.load_scrip_master():
            return None
            
        token = self.get_token_for_symbol(symbol)
        exchange = self.get_exchange_for_symbol(symbol)
        
        if not token:
            print(f"Angel One: Could not find token for symbol {symbol}")
            return None
            
        payload = {
            "mode": "OHLC",
            "exchangeTokens": {
                exchange: [token]
            }
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/rest/secure/angelbroking/market/v1/quote/",
                json=payload,
                headers=self._get_headers()
            )
            data = response.json()
            
            if data.get("status") and data.get("data") and data["data"].get("fetched"):
                return data["data"]["fetched"][0]
            else:
                print(f"Angel One Quote Error: {data.get('message')} / {data.get('errorcode')}")
                return None
                
        except Exception as e:
            print(f"Angel One fetch error: {e}")
            return None
