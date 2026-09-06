import pandas as pd
import numpy as np
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler
from datetime import datetime, timedelta
from angel_one import AngelOneClient

def calculate_atr_trail(df, period=10, multiplier=2.0):
    """Calculate ATR Trailing Stop on the DataFrame, matching the logic of the research section."""
    col_map = {col.lower(): col for col in df.columns}
    high_col = col_map.get('high', 'High')
    low_col = col_map.get('low', 'Low')
    close_col = col_map.get('close', 'Close')
    
    high = df[high_col]
    low = df[low_col]
    close = df[close_col]
    
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1.0/period, adjust=False).mean()
    nLoss = multiplier * atr
    trail = np.zeros(len(df))
    bull = np.ones(len(df), dtype=bool)
    
    if len(df) > 0:
        trail[0] = close.iloc[0] - nLoss.iloc[0]
        bull[0] = True
        
    for i in range(1, len(df)):
        current_close = close.iloc[i]
        current_nLoss = nLoss.iloc[i]
        prev_trail = trail[i-1]
        prev_bull = bull[i-1]
        if prev_bull:
            if current_close > prev_trail:
                trail[i] = max(prev_trail, current_close - current_nLoss)
                bull[i] = True
            else:
                trail[i] = current_close + current_nLoss
                bull[i] = False
        else:
            if current_close < prev_trail:
                trail[i] = min(prev_trail, current_close + current_nLoss)
                bull[i] = False
            else:
                trail[i] = current_close - current_nLoss
                bull[i] = True
    return pd.DataFrame({'trail': trail, 'bull': bull}, index=df.index)

def calculate_adx(df, period=14):
    """Calculate ADX along with Plus and Minus Directional Indicators (DI+, DI-)."""
    col_map = {col.lower(): col for col in df.columns}
    high_col = col_map.get('high', 'High')
    low_col = col_map.get('low', 'Low')
    close_col = col_map.get('close', 'Close')
    
    high = df[high_col]
    low = df[low_col]
    close = df[close_col]
    
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    
    up_move = high.diff()
    down_move = -low.diff()
    
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    
    alpha = 1.0 / period
    tr_smoothed = tr.ewm(alpha=alpha, adjust=False).mean()
    plus_dm_smoothed = pd.Series(plus_dm, index=df.index).ewm(alpha=alpha, adjust=False).mean()
    minus_dm_smoothed = pd.Series(minus_dm, index=df.index).ewm(alpha=alpha, adjust=False).mean()
    
    plus_di = 100 * (plus_dm_smoothed / tr_smoothed)
    minus_di = 100 * (minus_dm_smoothed / tr_smoothed)
    
    plus_di = plus_di.fillna(0)
    minus_di = minus_di.fillna(0)
    
    di_sum = plus_di + minus_di
    di_diff = (plus_di - minus_di).abs()
    dx = 100 * (di_diff / np.where(di_sum == 0, 1.0, di_sum))
    adx = dx.ewm(alpha=alpha, adjust=False).mean()
    
    return pd.DataFrame({
        'adx': adx,
        'plus_di': plus_di,
        'minus_di': minus_di
    }, index=df.index)

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
        """Fetch historical data from Yahoo Finance and merge live Angel One data."""
        ticker = yf.Ticker(self.symbol)
        df = ticker.history(period=period, timeout=10)
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
        df = df.dropna(subset=['close'])

        # Angel One Live Data Merge
        try:
            client = AngelOneClient()
            if client.is_configured():
                if self.symbol.endswith('.NS'):
                    search_sym = "NSE:" + self.symbol.replace('.NS', '')
                elif self.symbol.endswith('.BO'):
                    search_sym = "BSE:" + self.symbol.replace('.BO', '')
                else:
                    search_sym = self.symbol
                
                live_data = client.fetch_live_quote(search_sym)
                if live_data:
                    new_date = pd.to_datetime(datetime.now().strftime('%Y-%m-%d'))
                    if pd.api.types.is_datetime64tz_dtype(df['date']):
                        new_date = new_date.tz_localize(df['date'].dt.tz)
                        
                    new_row = pd.DataFrame([{
                        'date': new_date,
                        'open': float(live_data.get('open', 0)),
                        'high': float(live_data.get('high', 0)),
                        'low': float(live_data.get('low', 0)),
                        'close': float(live_data.get('close', 0) or live_data.get('ltp', 0)),
                        'volume': float(live_data.get('tradeVolume', 0))
                    }])
                    
                    last_date = pd.to_datetime(df['date'].iloc[-1]).strftime('%Y-%m-%d')
                    today_date = datetime.now().strftime('%Y-%m-%d')
                    
                    if last_date == today_date:
                        df.iloc[-1, df.columns.get_loc('open')] = new_row['open'][0]
                        df.iloc[-1, df.columns.get_loc('high')] = new_row['high'][0]
                        df.iloc[-1, df.columns.get_loc('low')] = new_row['low'][0]
                        df.iloc[-1, df.columns.get_loc('close')] = new_row['close'][0]
                        df.iloc[-1, df.columns.get_loc('volume')] = new_row['volume'][0]
                    else:
                        df = pd.concat([df, new_row], ignore_index=True)
                        
                    print(f"Angel One: Merged live quote for {search_sym} -> LTP {live_data.get('ltp')}")
        except Exception as e:
            print(f"Angel One merge failed (using YFinance only): {e}")

        return df

    def generate_backtest(self, df, reference_window_size=50, forecast_length=30):
        """Run a backtest by generating a forecast from 30 business days ago and comparing with actual performance."""
        if len(df) < (reference_window_size + forecast_length * 2):
            return None
            
        # The backtest point is forecast_length days before the end of the dataset
        backtest_end_idx = len(df) - forecast_length
        backtest_df = df.iloc[:backtest_end_idx]
        
        # Get actual prices for comparison
        actual_prices = df['close'].iloc[backtest_end_idx : backtest_end_idx + forecast_length].values.astype(float)
        actual_dates = df['date'].iloc[backtest_end_idx : backtest_end_idx + forecast_length].dt.strftime("%Y-%m-%d").tolist()
        
        # Run pattern matching on backtest_df
        close_prices = backtest_df['close'].values.astype(float)
        scaler = MinMaxScaler(feature_range=(-1, 1))
        normalized = scaler.fit_transform(close_prices.reshape(-1, 1)).flatten()
        
        target_pattern = normalized[-reference_window_size:]
        search_area = normalized[:-forecast_length]
        
        best_correlation = -2.0
        best_match_idx = -1
        
        for i in range(len(search_area) - reference_window_size):
            candidate = search_area[i : i + reference_window_size]
            correlation = np.corrcoef(target_pattern, candidate)[0, 1]
            if correlation > best_correlation:
                best_correlation = correlation
                best_match_idx = i
                
        if best_match_idx == -1:
            return None
            
        forecast_start_idx = best_match_idx + reference_window_size
        forecast_raw_pattern = close_prices[forecast_start_idx : forecast_start_idx + forecast_length]
        
        last_real_price = close_prices[-1]
        
        # Project forecast
        backtest_forecast_series = []
        current_forecast_price = last_real_price
        for i in range(len(forecast_raw_pattern)):
            prev_p = close_prices[forecast_start_idx + i - 1]
            curr_p = close_prices[forecast_start_idx + i]
            pct_change = (curr_p - prev_p) / prev_p
            current_forecast_price = current_forecast_price * (1 + pct_change)
            backtest_forecast_series.append(float(current_forecast_price))
            
        # Calculate directional accuracy
        actual_pct = (actual_prices[-1] - last_real_price) / last_real_price
        predicted_pct = (backtest_forecast_series[-1] - last_real_price) / last_real_price
        direction_match = (actual_pct * predicted_pct) > 0
        
        # Pearson correlation
        val_corr = np.corrcoef(actual_prices, backtest_forecast_series)[0, 1]
        if np.isnan(val_corr):
            val_corr = 0.0
            
        return {
            "dates": actual_dates,
            "prices": backtest_forecast_series,
            "actual_prices": actual_prices.tolist(),
            "start_date": backtest_df['date'].iloc[-1].strftime("%Y-%m-%d"),
            "start_price": float(last_real_price),
            "correlation": float(val_corr),
            "direction_match": bool(direction_match),
            "accuracy_score": float(best_correlation)
        }

    def generate_forecast(self, reference_window_size=50, forecast_length=30):
        """Perform sliding window correlation pattern matching to predict future prices, including stops, ADX and backtests."""
        df = self.fetch_market_data()
        if df is None or len(df) < (reference_window_size * 3):
            return {"error": "Insufficient data for forecasting"}

        # Extract close prices for matching
        close_prices = df['close'].values.astype(float)
        
        # Scaling for correlation (MinMax -1 to 1)
        scaler = MinMaxScaler(feature_range=(-1, 1))
        normalized = scaler.fit_transform(close_prices.reshape(-1, 1)).flatten()

        # The 'Current' pattern we want to match
        target_pattern = normalized[-reference_window_size:]
        
        # Possible patterns in history (excluding the current one)
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
        forecast_start_idx = best_match_idx + reference_window_size
        forecast_raw_pattern = close_prices[forecast_start_idx : forecast_start_idx + forecast_length]
        
        # Adjust the forecast to start from the current price
        last_real_price = close_prices[-1]
        
        forecast_series = []
        current_forecast_price = last_real_price
        
        for i in range(len(forecast_raw_pattern)):
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

        # Calculate ADX, DI+, DI-
        adx_df = calculate_adx(df)
        df['adx'] = adx_df['adx']
        df['plus_di'] = adx_df['plus_di']
        df['minus_di'] = adx_df['minus_di']
        
        # Calculate ATR Trailing Stop
        atr_trail_df = calculate_atr_trail(df)
        df['atr_trail'] = atr_trail_df['trail']
        df['atr_trail_bull'] = atr_trail_df['bull']

        # Generate backtest
        backtest_data = self.generate_backtest(df, reference_window_size, forecast_length)

        # Format historical data for Plotly (last 150 days)
        hist_view = df.tail(150)
        
        def clean_series(series):
            return [None if pd.isna(x) else float(x) for x in series]

        def clean_bool_series(series):
            return [None if pd.isna(x) else bool(x) for x in series]
        
        return {
            "symbol": self.symbol,
            "correlation_score": float(best_correlation),
            "history": {
                "date": hist_view['date'].dt.strftime("%Y-%m-%d").tolist(),
                "open": clean_series(hist_view['open']),
                "high": clean_series(hist_view['high']),
                "low": clean_series(hist_view['low']),
                "close": clean_series(hist_view['close']),
                "volume": clean_series(hist_view['volume']),
                "atr_trail": clean_series(hist_view['atr_trail']),
                "atr_trail_bull": clean_bool_series(hist_view['atr_trail_bull']),
                "adx": clean_series(hist_view['adx']),
                "plus_di": clean_series(hist_view['plus_di']),
                "minus_di": clean_series(hist_view['minus_di']),
            },
            "forecast": {
                "date": forecast_dates,
                "price": forecast_series
            },
            "backtest": backtest_data
        }
