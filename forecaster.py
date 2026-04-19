import pandas as pd
import numpy as np
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler
from datetime import datetime, timedelta

class StockForecaster:
    def __init__(self, symbol):
        # Handle Indian market suffix if missing
        if not (':' in symbol or '.' in symbol):
            self.symbol = symbol + ".NS"
        else:
            # Convert TV format (NSE:RELIANCE) to YF format (RELIANCE.NS)
            if ":" in symbol:
                exchange, ticker = symbol.split(":")
                if exchange.upper() == "NSE":
                    self.symbol = f"{ticker}.NS"
                elif exchange.upper() == "BSE":
                    self.symbol = f"{ticker}.BO"
                else:
                    self.symbol = ticker
            else:
                self.symbol = symbol

    def fetch_market_data(self, period="2y"):
        """Fetch historical data from Yahoo Finance."""
        ticker = yf.Ticker(self.symbol)
        df = ticker.history(period=period)
        if df.empty:
            return None
        
        df = df.reset_index()
        # Ensure standard column names
        df = df.rename(columns={
            'Date': 'date', 
            'Open': 'open', 
            'High': 'high', 
            'Low': 'low', 
            'Close': 'close', 
            'Volume': 'volume'
        })
        return df

    def generate_forecast(self, reference_window_size=50, forecast_length=30):
        """Perform sliding window correlation pattern matching to predict future prices."""
        df = self.fetch_market_data()
        if df is None or len(df) < (reference_window_size * 3):
            return {"error": "Insufficient data for forecasting"}

        # Extract close prices for matching
        close_prices = df['close'].values.astype(float)
        
        # Scaling for correlation (MinMax -1 to 1)
        scaler = MinMaxScaler(feature_range=(-1, 1))
        # Use a separate scaler for the matching logic
        normalized = scaler.fit_transform(close_prices.reshape(-1, 1)).flatten()

        # The 'Current' pattern we want to match
        target_pattern = normalized[-reference_window_size:]
        
        # Possible patterns in history (excluding the current one)
        # Search area: from start to (end - forecast_length - reference_window_size)
        search_area = normalized[:-forecast_length]
        
        best_correlation = -2.0
        best_match_idx = -1
        
        # Sliding window search
        for i in range(len(search_area) - reference_window_size):
            candidate = search_area[i : i + reference_window_size]
            correlation = np.corrcoef(target_pattern, candidate)[0, 1]
            
            if correlation > best_correlation:
                best_correlation = correlation
                best_match_idx = i
        
        if best_match_idx == -1:
            return {"error": "Could not find a matching pattern"}

        # The 'Future' part of the best match
        # It starts right after the matched pattern ends
        forecast_start_idx = best_match_idx + reference_window_size
        forecast_raw_pattern = close_prices[forecast_start_idx : forecast_start_idx + forecast_length]
        
        # Adjust the forecast to start from the current price
        # We look at the delta of the matched future and apply it to current price
        last_real_price = close_prices[-1]
        match_start_price = close_prices[forecast_start_idx - 1]
        
        # Percentage changes for the forecast
        forecast_series = []
        current_forecast_price = last_real_price
        
        for i in range(len(forecast_raw_pattern)):
            # Calculate daily % change from the old match
            prev_p = close_prices[forecast_start_idx + i - 1]
            curr_p = close_prices[forecast_start_idx + i]
            pct_change = (curr_p - prev_p) / prev_p
            
            current_forecast_price = current_forecast_price * (1 + pct_change)
            forecast_series.append(float(current_forecast_price))

        # Prepare dates
        last_date = df['date'].iloc[-1]
        forecast_dates = []
        curr_d = last_date
        
        while len(forecast_dates) < len(forecast_series):
            curr_d += timedelta(days=1)
            # Skip weekends (approximate business days)
            if curr_d.weekday() < 5:
                forecast_dates.append(curr_d.strftime("%Y-%m-%d"))

        # Format historical data for Plotly (last 100 days)
        hist_view = df.tail(100)
        
        return {
            "symbol": self.symbol,
            "correlation_score": float(best_correlation),
            "history": {
                "date": hist_view['date'].dt.strftime("%Y-%m-%d").tolist(),
                "open": hist_view['open'].tolist(),
                "high": hist_view['high'].tolist(),
                "low": hist_view['low'].tolist(),
                "close": hist_view['close'].tolist(),
                "volume": hist_view['volume'].tolist()
            },
            "forecast": {
                "date": forecast_dates,
                "price": forecast_series
            }
        }
