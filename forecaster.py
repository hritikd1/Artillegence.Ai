import pandas as pd
import numpy as np
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler
from datetime import datetime, timedelta
from angel_one import AngelOneClient
import database

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
        self.raw_symbol = symbol
        self.symbol = database.normalize_symbol(symbol)


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

    def get_or_learn_window_size(self, df, forecast_length=30):
        """Query database for learned optimal window size or evaluate candidate windows dynamically."""
        profile = database.get_stock_profile(self.symbol)
        if profile and profile.get("optimal_window_size"):
            return profile["optimal_window_size"]

        # Dynamic Candidate Evaluation across [20, 30, 45, 60, 90]
        candidates = [20, 30, 45, 60, 90]
        best_window = 45
        best_score = -2.0
        
        close_prices = df['close'].values.astype(float)
        scaler = MinMaxScaler(feature_range=(-1, 1))
        normalized = scaler.fit_transform(close_prices.reshape(-1, 1)).flatten()

        for win in candidates:
            if len(normalized) < (win * 2 + forecast_length):
                continue
            target = normalized[-win:]
            search = normalized[:-forecast_length]
            max_corr = -2.0
            for i in range(len(search) - win):
                c = search[i : i + win]
                corr = np.corrcoef(target, c)[0, 1]
                if not np.isnan(corr) and corr > max_corr:
                    max_corr = corr
            if max_corr > best_score:
                best_score = max_corr
                best_window = win

        # Compute stock-specific real backtest hit-rate & MAPE metrics across 5 historical checkpoints
        hit_rate = 70.0
        mape_error = 4.5
        try:
            direction_hits = 0
            mape_errors = []
            step = max(1, (len(close_prices) - best_window - forecast_length) // 5)
            checkpoints = list(range(best_window + forecast_length, len(close_prices) - forecast_length, step))[:5]
            eval_count = 0
            
            for idx in checkpoints:
                hist_c = close_prices[:idx]
                actual = close_prices[idx : idx + forecast_length]
                if len(actual) < forecast_length: continue
                
                norm = scaler.fit_transform(hist_c.reshape(-1, 1)).flatten()
                t_pat = norm[-best_window:]
                s_area = norm[:-forecast_length]
                
                b_c = -2.0
                b_i = -1
                for i in range(len(s_area) - best_window):
                    cand = s_area[i : i + best_window]
                    c = np.corrcoef(t_pat, cand)[0, 1]
                    if not np.isnan(c) and c > b_c:
                        b_c = c
                        b_i = i
                if b_i != -1:
                    f_start = b_i + best_window
                    f_raw = hist_c[f_start : f_start + forecast_length]
                    start_p = hist_c[-1]
                    f_pred = []
                    curr_p = start_p
                    for i in range(len(f_raw)):
                        pct = (f_raw[i] - hist_c[f_start + i - 1]) / hist_c[f_start + i - 1]
                        curr_p = curr_p * (1 + pct)
                        f_pred.append(curr_p)
                    
                    act_dir = actual[-1] - start_p
                    pred_dir = f_pred[-1] - start_p
                    if (act_dir * pred_dir) >= 0:
                        direction_hits += 1
                    err = abs(actual[-1] - f_pred[-1]) / actual[-1] * 100.0
                    mape_errors.append(err)
                    eval_count += 1
            if eval_count > 0:
                hit_rate = round((direction_hits / eval_count) * 100.0, 1)
                mape_error = round(float(np.mean(mape_errors)), 2)
        except Exception as e_calc:
            print(f"Metrics calc error for {self.symbol}: {e_calc}")

        # Save initial learned profile to DB
        database.save_or_update_stock_profile(
            symbol=self.symbol,
            optimal_window_size=best_window,
            directional_accuracy_pct=hit_rate,
            mean_absolute_error_pct=mape_error,
            sample_count=5,
            trend_bias_weight=1.0
        )
        return best_window

    def generate_forecast(self, reference_window_size=None, forecast_length=30):
        """Perform K-Nearest pattern matching to project mean ensemble price + 80% confidence interval bands & log for learning."""
        df = self.fetch_market_data()
        if df is None or len(df) < 120:
            return {"error": "Insufficient data for forecasting"}

        if reference_window_size is None:
            reference_window_size = self.get_or_learn_window_size(df, forecast_length)

        close_prices = df['close'].values.astype(float)
        scaler = MinMaxScaler(feature_range=(-1, 1))
        normalized = scaler.fit_transform(close_prices.reshape(-1, 1)).flatten()

        target_pattern = normalized[-reference_window_size:]
        search_area = normalized[:-forecast_length]
        
        candidates = []
        for i in range(len(search_area) - reference_window_size):
            candidate = search_area[i : i + reference_window_size]
            correlation = np.corrcoef(target_pattern, candidate)[0, 1]
            if not np.isnan(correlation) and correlation > 0.35:
                candidates.append((correlation, i))

        if not candidates:
            # Fallback to single max correlation match if threshold too strict
            best_corr = -2.0
            best_i = -1
            for i in range(len(search_area) - reference_window_size):
                c = search_area[i : i + reference_window_size]
                corr = np.corrcoef(target_pattern, c)[0, 1]
                if not np.isnan(corr) and corr > best_corr:
                    best_corr = corr
                    best_i = i
            if best_i != -1:
                candidates.append((best_corr, best_i))

        if not candidates:
            return {"error": "Could not find a matching pattern"}

        # Sort candidate matches by correlation descending & take Top K (K=5)
        candidates.sort(key=lambda x: x[0], reverse=True)
        
        # Deduplicate overlapping match indices (at least reference_window_size // 2 apart)
        k_matches = []
        for corr, idx in candidates:
            if not any(abs(idx - prev_idx) < (reference_window_size // 2) for _, prev_idx in k_matches):
                k_matches.append((corr, idx))
                if len(k_matches) >= 5:
                    break

        last_real_price = float(close_prices[-1])
        ensemble_trajectories = []
        weights = []

        for corr, match_idx in k_matches:
            forecast_start_idx = match_idx + reference_window_size
            forecast_raw_pattern = close_prices[forecast_start_idx : forecast_start_idx + forecast_length]
            
            traj = []
            curr_p = last_real_price
            for i in range(len(forecast_raw_pattern)):
                prev_p = close_prices[forecast_start_idx + i - 1]
                p = close_prices[forecast_start_idx + i]
                pct_change = (p - prev_p) / prev_p
                curr_p = curr_p * (1 + pct_change)
                traj.append(float(curr_p))
            
            if len(traj) == forecast_length:
                ensemble_trajectories.append(traj)
                weights.append(max(0.01, corr ** 2))

        # Compute Correlation-Weighted Mean Ensemble & 80% Confidence Interval Shading
        traj_matrix = np.array(ensemble_trajectories) # shape (K, forecast_length)
        weights_arr = np.array(weights).reshape(-1, 1)
        weights_norm = weights_arr / np.sum(weights_arr)
        
        mean_forecast = np.sum(traj_matrix * weights_norm, axis=0)
        std_forecast = np.std(traj_matrix, axis=0)
        
        upper_ci = mean_forecast + 1.28 * std_forecast
        lower_ci = mean_forecast - 1.28 * std_forecast

        # Format Forecast Business Dates
        last_date = df['date'].iloc[-1]
        forecast_dates = []
        curr_d = last_date
        while len(forecast_dates) < forecast_length:
            curr_d += timedelta(days=1)
            if curr_d.weekday() < 5:
                forecast_dates.append(curr_d.strftime("%Y-%m-%d"))

        # Calculate Technical Indicators
        adx_df = calculate_adx(df)
        df['adx'] = adx_df['adx']
        df['plus_di'] = adx_df['plus_di']
        df['minus_di'] = adx_df['minus_di']
        
        atr_trail_df = calculate_atr_trail(df)
        df['atr_trail'] = atr_trail_df['trail']
        df['atr_trail_bull'] = atr_trail_df['bull']

        # Generate backtest
        backtest_data = self.generate_backtest(df, reference_window_size, forecast_length)

        # Log prediction to DB for continuous self-learning evaluation
        top_corr = k_matches[0][0]
        p_5d = float(mean_forecast[min(4, forecast_length - 1)])
        p_10d = float(mean_forecast[min(9, forecast_length - 1)])
        p_30d = float(mean_forecast[-1])
        
        target_5d = forecast_dates[min(4, len(forecast_dates) - 1)]
        target_10d = forecast_dates[min(9, len(forecast_dates) - 1)]
        target_30d = forecast_dates[-1]
        
        predicted_dir = "BULLISH" if p_30d > last_real_price * 1.005 else ("BEARISH" if p_30d < last_real_price * 0.995 else "NEUTRAL")
        
        try:
            database.save_forecast_log(
                symbol=self.symbol,
                forecast_date=last_date.strftime("%Y-%m-%d"),
                target_date_5d=target_5d,
                target_date_10d=target_10d,
                target_date_30d=target_30d,
                predicted_price_5d=p_5d,
                predicted_price_10d=p_10d,
                predicted_price_30d=p_30d,
                predicted_direction=predicted_dir,
                window_size_used=reference_window_size,
                correlation_score=float(top_corr)
            )
        except Exception as e_log:
            print(f"Forecast log warning: {e_log}")

        # Fetch symbol learned stats from DB
        learned_stats = database.get_forecast_stats_for_symbol(self.symbol)

        hist_view = df.tail(150)
        def clean_series(series): return [None if pd.isna(x) else float(x) for x in series]
        def clean_bool_series(series): return [None if pd.isna(x) else bool(x) for x in series]

        return {
            "symbol": self.symbol,
            "correlation_score": float(top_corr),
            "learned_profile": learned_stats,
            "ensemble_clusters_count": len(k_matches),
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
                "price": [float(x) for x in mean_forecast],
                "upper_ci": [float(x) for x in upper_ci],
                "lower_ci": [float(x) for x in lower_ci]
            },
            "backtest": backtest_data
        }
