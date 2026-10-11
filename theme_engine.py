"""
theme_engine.py — Theme-driven stock discovery for Artillegence AI.

Pipeline:
  1. THEMES   : LLM (via llm_analyzer.call_mistral_raw) proposes market themes for the
                next ~6 months using today's date, an event calendar (festivals, budget,
                results seasons, elections) and recent geopolitical headlines from the DB.
  2. STOCKS   : The LLM maps each theme to NSE tickers (validated against yfinance).
  3. TECHNICAL: Wilder ADX / +DI / -DI are computed for every ticker and checked for
                "+DI crossing above 30" (or already above 30) with ADX trend strength.
  4. RANK     : Stocks that pass are ranked and returned grouped by theme.

NOTE: the theme/stock mapping is LLM-generated and must be treated as a research
watch-list, not as trade advice. Fundamentals (quarterly NP etc.) are NOT checked here.
"""

import asyncio
import json
import os
import re
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf

_CACHE_FILE = os.path.join("scratch", "theme_cache.json")

# +DI threshold and look-back for a "fresh" cross
DI_THRESHOLD = 30.0
CROSS_LOOKBACK_DAYS = 5
ADX_MIN = 20.0

# Minimum live web items required before the LLM is allowed to answer (no knowledge-base-only answers)
MIN_WEB_ITEMS = 8

# Used only if the LLM is unavailable / returns garbage.
FALLBACK_THEMES = [
    {
        "theme": "Festive demand (Dhanteras / Diwali / wedding season)",
        "rationale": "Gold, jewellery, consumer durables, autos and retail see seasonal demand.",
        "window": "Oct 2026 - Feb 2027",
        "tickers": ["TITAN.NS", "KALYANKJIL.NS", "SENCO.NS", "MUTHOOTFIN.NS", "MANAPPURAM.NS",
                    "TRENT.NS", "MARUTI.NS", "M&M.NS", "DIXON.NS", "HAVELLS.NS"],
    },
    {
        "theme": "Defence & geopolitical tension",
        "rationale": "War / border tension supports defence orders and indigenisation.",
        "window": "Next 6 months",
        "tickers": ["HAL.NS", "BEL.NS", "BDL.NS", "MAZDOCK.NS", "COCHINSHIP.NS",
                    "SOLARINDS.NS", "DATAPATTNS.NS", "ASTRAMICRO.NS"],
    },
    {
        "theme": "Electronics / semiconductor build-out (ECMS)",
        "rationale": "Policy-backed component manufacturing; earnings inflections in EMS names.",
        "window": "Next 6 months",
        "tickers": ["KAYNES.NS", "SYRMA.NS", "DIXON.NS", "AVALON.NS", "AMBER.NS", "CYIENTDLM.NS"],
    },
    {
        "theme": "Power, transmission & data-center capex",
        "rationale": "Grid expansion, HVDC, storage and AI data-center power demand.",
        "window": "Next 6 months",
        "tickers": ["MTARTECH.NS", "POLYCAB.NS", "KEI.NS", "ABB.NS", "SIEMENS.NS",
                    "CGPOWER.NS", "POWERINDIA.NS", "THERMAX.NS"],
    },
]


# ----------------------------------------------------------------------------
# 1. Technicals — proper Wilder ADX / +DI / -DI
# ----------------------------------------------------------------------------
def compute_adx_di(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Return DataFrame with columns plus_di, minus_di, adx (Wilder smoothing)."""
    high, low, close = df["High"], df["Low"], df["Close"]

    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    tr = pd.concat(
        [high - low, (high - close.shift(1)).abs(), (low - close.shift(1)).abs()], axis=1
    ).max(axis=1)

    alpha = 1.0 / period
    tr_s = tr.ewm(alpha=alpha, adjust=False).mean()
    plus_s = pd.Series(plus_dm, index=df.index).ewm(alpha=alpha, adjust=False).mean()
    minus_s = pd.Series(minus_dm, index=df.index).ewm(alpha=alpha, adjust=False).mean()

    plus_di = 100 * plus_s / tr_s
    minus_di = 100 * minus_s / tr_s
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(alpha=alpha, adjust=False).mean()

    return pd.DataFrame({"plus_di": plus_di, "minus_di": minus_di, "adx": adx})


def evaluate_signal(df: pd.DataFrame) -> dict | None:
    """
    Classify the latest technical state of one stock.
    status:
      CROSSED_30  — +DI moved from <30 to >=30 within the last CROSS_LOOKBACK_DAYS sessions
      ABOVE_30    — +DI already >= 30 (no fresh cross)
      NEAR_30     — +DI between 25 and 30 and rising (watch-list)
    """
    df = df.dropna(subset=["High", "Low", "Close"])
    if len(df) < 60:  # need warm-up for Wilder smoothing
        return None

    ind = compute_adx_di(df)
    plus, minus, adx = ind["plus_di"], ind["minus_di"], ind["adx"]
    p, m, a = float(plus.iloc[-1]), float(minus.iloc[-1]), float(adx.iloc[-1])
    if np.isnan(p) or np.isnan(a):
        return None

    crossed_days_ago = None
    for k in range(CROSS_LOOKBACK_DAYS):
        i = len(plus) - 1 - k
        if i < 1:
            break
        if plus.iloc[i] >= DI_THRESHOLD and plus.iloc[i - 1] < DI_THRESHOLD:
            crossed_days_ago = k
            break

    rising = float(plus.iloc[-1]) > float(plus.iloc[-4])
    if crossed_days_ago is not None and p >= DI_THRESHOLD:
        status = "CROSSED_30"
    elif p >= DI_THRESHOLD:
        status = "ABOVE_30"
    elif 25 <= p < DI_THRESHOLD and rising:
        status = "NEAR_30"
    else:
        return None

    close = df["Close"]
    ema20 = close.ewm(span=20, adjust=False).mean()
    high_52w = float(close.tail(252).max())
    last = float(close.iloc[-1])

    # Score: fresh cross > already above > near; bonus for trend strength and +DI dominance
    score = {"CROSSED_30": 60, "ABOVE_30": 40, "NEAR_30": 20}[status]
    score += min(max(a - ADX_MIN, 0), 30)          # up to +30 for ADX
    score += min(max(p - m, 0), 20) / 2            # up to +10 for +DI > -DI
    score += 5 if last > float(ema20.iloc[-1]) else 0
    score += 5 if last >= 0.9 * high_52w else 0

    return {
        "status": status,
        "plus_di": round(p, 2),
        "minus_di": round(m, 2),
        "adx": round(a, 2),
        "adx_rising": bool(adx.iloc[-1] > adx.iloc[-4]),
        "crossed_days_ago": crossed_days_ago,
        "price": round(last, 2),
        "above_ema20": bool(last > float(ema20.iloc[-1])),
        "pct_from_52w_high": round((last / high_52w - 1) * 100, 1),
        "score": round(score, 1),
    }


def _scan_technicals(tickers: list[str]) -> dict[str, dict]:
    """Blocking: download 1y of daily data and evaluate every ticker."""
    tickers = sorted(set(tickers))
    if not tickers:
        return {}
    data = yf.download(
        tickers, period="1y", interval="1d", group_by="ticker",
        progress=False, auto_adjust=False, threads=True,
    )
    out = {}
    for t in tickers:
        try:
            df = data[t].copy() if len(tickers) > 1 else data.copy()
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            res = evaluate_signal(df)
            if res:
                out[t] = res
        except Exception as e:
            print(f"   [THEME] technical scan failed for {t}: {e}")
    return out


# ----------------------------------------------------------------------------
# 2. Themes via LLM
# ----------------------------------------------------------------------------
def _event_calendar(today: date) -> str:
    """Seed calendar so the LLM does not forget recurring Indian-market catalysts."""
    return (
        "- Dhanteras / Diwali (early-mid Nov 2026) -> gold, jewellery, consumer durables, autos, retail\n"
        "- Wedding season (Nov 2026 - Feb 2027) -> jewellery, apparel, hospitality, gold loans\n"
        "- Q2 FY27 results (Oct-Nov 2026), Q3 FY27 (Jan-Feb 2027), Q4 FY27 (Apr-May 2027)\n"
        "- Union Budget (1 Feb 2027) -> capex, defence, rail, infra, ECMS/semiconductor allocations\n"
        "- State elections early 2027 -> rural / populist spending, cement, PSU banks\n"
        "- Rabi sowing / winter demand -> fertilisers, agri inputs, power demand\n"
        "- Summer ramp (Mar-Apr 2027) -> ACs, coolers, cables, power, beverages\n"
        "- Ongoing: geopolitical conflicts / war risk -> defence, gold, oil & gas, shipping\n"
        "- Structural: semiconductors/electronics (ECMS), AI data-center power, hydrogen, "
        "transmission/HVDC, CDMO/pharma capacity"
    )


def _recent_headlines(limit: int = 15) -> str:
    """Pull latest geopolitical events collected by the platform (best effort)."""
    try:
        import database as db
        events = db.get_geo_events(limit=limit)
    except Exception:
        return "None available."
    lines = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        text = next((str(ev[k]) for k in ("headline", "title", "event", "description", "summary")
                     if ev.get(k)), None)
        if text:
            lines.append(f"- {text[:200]}")
    return "\n".join(lines) or "None available."


def _extract_json(text: str):
    text = re.sub(r"```(?:json)?", "", text or "").strip()
    start = min([i for i in (text.find("{"), text.find("[")) if i != -1], default=-1)
    if start == -1:
        raise ValueError("no JSON found")
    end = max(text.rfind("}"), text.rfind("]"))
    return json.loads(text[start:end + 1])


def _clean_ticker(t: str) -> str | None:
    t = str(t).strip().upper().replace(" ", "")
    if not t:
        return None
    if t.endswith(".BO"):
        return t
    return t if t.endswith(".NS") else f"{t}.NS"


async def generate_themes(extra_context: str = "", horizon_months: int = 6) -> dict:
    """Ask the LLM for market themes over the next `horizon_months` and candidate NSE tickers."""
    from llm_analyzer import call_mistral_raw
    from web_grounding import gather_web_context

    today = date.today()
    end = today + timedelta(days=30 * horizon_months)

    # --- Live web grounding: the LLM must never answer from its training data alone ---
    month_year = today.strftime("%B %Y")
    queries = [
        f"India stock market outlook {month_year}",
        f"war geopolitical tension impact Indian markets {month_year}",
        f"Diwali Dhanteras {today.year} gold demand stocks",
        f"gold price India {month_year}",
        f"crude oil price India stocks {month_year}",
        f"best performing sectors India Nifty {month_year}",
        f"Q2 FY27 earnings preview India sectors",
        f"India government policy capex defence semiconductor power {today.year}",
    ]
    if extra_context:
        queries.append(extra_context)
    web = await gather_web_context(queries)
    if web["count"] < MIN_WEB_ITEMS:
        print(f"   [THEME] Only {web['count']} live web items fetched (<{MIN_WEB_ITEMS}); "
              "refusing to query LLM without internet data. Using fallback themes.")
        return {"source": "fallback_no_web", "generated_at": datetime.now().isoformat(),
                "themes": FALLBACK_THEMES, "web_sources": web["sources"]}

    system_prompt = f"""Today's date is {today.strftime('%A, %d %B %Y')}.
You are a senior Indian equity strategist doing THEMATIC research.
IMPORTANT: your training data is OUT OF DATE. Base every statement about current events (war,
prices, policy, results, sector moves) ONLY on the LIVE WEB RESULTS provided below. If the web
results do not support a theme, do not include it. The event calendar is only a seed of recurring
catalysts.
Identify the 5-7 strongest market themes likely to drive Indian stocks between
{today.isoformat()} and {end.isoformat()}. Consider: current geopolitical situation (war, sanctions,
oil), upcoming festivals (Diwali, Dhanteras, wedding season), budget and policy, results seasons,
government capex / PLI / ECMS, and global capex cycles (AI, semiconductors, power).
Prefer themes where policy or large-customer demand creates EARNINGS INFLECTIONS in small/mid caps
(quarterly profit approaching earlier annual profit) — like Kaynes, MTAR, Syrma, Linde India did.

For each theme list 6-10 liquid NSE-listed stocks that are direct beneficiaries (use exact NSE
symbols, e.g. TITAN, KAYNES, HAL). Do NOT invent symbols.

Return ONLY valid JSON, no commentary:
{{"themes":[{{"theme":"...","rationale":"1-2 sentences citing the web evidence",
"window":"e.g. Oct 2026 - Jan 2027",
"confidence":"Low|Medium|High","tickers":["SYMBOL","SYMBOL"]}}]}}"""

    user_message = (
        f"LIVE WEB RESULTS (fetched {datetime.now().strftime('%Y-%m-%d %H:%M')}):\n{web['text']}\n\n"
        f"Event calendar:\n{_event_calendar(today)}\n\n"
        f"Recent geopolitical / market headlines from our monitors:\n{_recent_headlines()}\n\n"
        f"Extra context from user: {extra_context or 'None'}"
    )

    payload = {
        "model": "mistral-large-latest",
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    }
    try:
        resp = await call_mistral_raw(payload)
        if not resp or "error" in resp or "choices" not in resp:
            raise RuntimeError(f"LLM unavailable: {resp}")
        content = resp["choices"][0]["message"]["content"]
        if re.match(r"^\[[a-z_]+\] Error", content or ""):
            raise RuntimeError(f"LLM provider error: {content[:150]}")
        parsed = _extract_json(content)
        themes = parsed["themes"] if isinstance(parsed, dict) else parsed
        cleaned = []
        for th in themes:
            tickers = [c for c in (_clean_ticker(x) for x in th.get("tickers", [])) if c]
            if th.get("theme") and tickers:
                cleaned.append({
                    "theme": th["theme"],
                    "rationale": th.get("rationale", ""),
                    "window": th.get("window", ""),
                    "confidence": th.get("confidence", "Medium"),
                    "tickers": list(dict.fromkeys(tickers)),
                })
        if cleaned:
            return {"source": "llm", "generated_at": datetime.now().isoformat(), "themes": cleaned,
                    "web_sources": web["sources"]}
        raise ValueError("LLM returned no usable themes")
    except Exception as e:
        print(f"   [THEME] LLM theme generation failed ({e}); using fallback themes.")
        return {"source": "fallback", "generated_at": datetime.now().isoformat(),
                "themes": FALLBACK_THEMES, "web_sources": web["sources"]}


def _load_cache() -> dict | None:
    try:
        with open(_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("date") == str(date.today()) and data.get("themes_payload"):
            return data["themes_payload"]
    except Exception:
        pass
    return None


def _save_cache(payload: dict):
    try:
        os.makedirs(os.path.dirname(_CACHE_FILE), exist_ok=True)
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"date": str(date.today()), "themes_payload": payload}, f)
    except Exception as e:
        print(f"   [THEME] cache write failed: {e}")


# ----------------------------------------------------------------------------
# 3. Orchestration
# ----------------------------------------------------------------------------
async def run_theme_scan(force_refresh: bool = False, extra_context: str = "",
                         horizon_months: int = 6, include_near: bool = True) -> dict:
    """Themes -> tickers -> ADX/+DI filter -> ranked result grouped by theme."""
    payload = None if (force_refresh or extra_context) else _load_cache()
    if payload is None:
        payload = await generate_themes(extra_context, horizon_months)
        if payload["source"] == "llm" and not extra_context:
            _save_cache(payload)

    all_tickers = [t for th in payload["themes"] for t in th["tickers"]]
    signals = await asyncio.to_thread(_scan_technicals, all_tickers)

    themes_out, flat = [], {}
    for th in payload["themes"]:
        hits = []
        for t in th["tickers"]:
            sig = signals.get(t)
            if not sig or (sig["status"] == "NEAR_30" and not include_near):
                continue
            rec = {"symbol": t, "name": t.replace(".NS", "").replace(".BO", ""), **sig}
            hits.append(rec)
            # a stock may appear under several themes; keep it once and list its themes
            flat.setdefault(t, {**rec, "themes": []})["themes"].append(th["theme"])
        hits.sort(key=lambda r: r["score"], reverse=True)
        themes_out.append({**{k: th[k] for k in ("theme", "rationale", "window", "confidence")
                              if k in th},
                           "tickers_scanned": len(th["tickers"]), "matches": hits})

    ranked = sorted(flat.values(), key=lambda r: r["score"], reverse=True)

    return {
        "status": "success",
        "theme_source": payload["source"],
        "web_sources": payload.get("web_sources", []),
        "generated_at": payload["generated_at"],
        "criteria": {
            "plus_di_threshold": DI_THRESHOLD,
            "fresh_cross_lookback_days": CROSS_LOOKBACK_DAYS,
            "statuses": ["CROSSED_30", "ABOVE_30", "NEAR_30"],
        },
        "themes": themes_out,
        "top_picks": ranked[:15],
        "disclaimer": "LLM-generated research watch-list; verify fundamentals before acting.",
    }


if __name__ == "__main__":
    result = asyncio.run(run_theme_scan(force_refresh=True))
    print(json.dumps(result, indent=2))
