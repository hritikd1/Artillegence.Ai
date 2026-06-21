"""
database.py  Artillegence AI Central Database Layer
Replaces all ad-hoc JSON file reads/writes with atomic SQLite operations.
Tables:
  - intelligence_cache   : latest output per agent (replaces *.json files)
  - geo_events           : persistent geo-tagged events (survives restarts)
  - signal_log           : AI signal accuracy tracking (replaces signal_log.json)
  - agent_memory         : rolling context summaries per agent (new  #5)
"""

import sqlite3
import json
import os
from datetime import datetime
from contextlib import contextmanager
from typing import Optional

# Database path: check for Render persistent disk mount point (/data)
if os.path.exists("/data"):
    DB_PATH = "/data/artillegence.db"
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "artillegence.db")

#  Connection helper 

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # allow concurrent readers
    conn.execute("PRAGMA synchronous=NORMAL") # balance safety vs speed
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


#  Schema Init 

def init_db():
    """Create all tables if they don't exist. Safe to call on every startup."""
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS intelligence_cache (
                agent       TEXT PRIMARY KEY,
                data        TEXT NOT NULL,          -- JSON blob
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS geo_events (
                id          TEXT PRIMARY KEY,
                data        TEXT NOT NULL,          -- JSON blob for single event
                severity    TEXT DEFAULT 'low',
                timestamp   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS signal_log (
                id          TEXT PRIMARY KEY,
                agent       TEXT NOT NULL,
                signal_type TEXT,
                target      TEXT,
                direction   TEXT,
                confidence  TEXT,
                reasoning   TEXT,
                timestamp   TEXT NOT NULL,
                outcome     TEXT,
                actual_move TEXT,
                verified_at TEXT,
                correct     INTEGER                 -- NULL=pending, 1=correct, 0=wrong
            );

            CREATE TABLE IF NOT EXISTS agent_memory (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                agent       TEXT NOT NULL,
                summary     TEXT NOT NULL,
                recorded_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS custom_sources (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                url         TEXT UNIQUE NOT NULL,
                source_type TEXT NOT NULL, -- 'telegram' or 'website'
                added_by    TEXT,
                added_at    TEXT NOT NULL,
                last_scanned TEXT,
                is_active   INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS user_custom_searches (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                query       TEXT UNIQUE NOT NULL,
                added_by    TEXT,
                added_at    TEXT NOT NULL,
                last_run    TEXT,
                is_active   INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS stock_research (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol      TEXT NOT NULL,
                status      TEXT NOT NULL,
                logs        TEXT NOT NULL,
                screenshots TEXT NOT NULL,
                report      TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_memory_agent ON agent_memory(agent);
            CREATE INDEX IF NOT EXISTS idx_geo_ts       ON geo_events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_signal_agent ON signal_log(agent);
            CREATE INDEX IF NOT EXISTS idx_custom_active ON custom_sources(is_active);
            CREATE INDEX IF NOT EXISTS idx_research_symbol ON stock_research(symbol);
        """)
        # Clean up legacy chartlink entries
        conn.execute("DELETE FROM custom_sources WHERE url LIKE '%chartlink%'")
        conn.execute("DELETE FROM user_custom_searches WHERE query LIKE '%chartlink%'")
        conn.execute("DELETE FROM geo_events WHERE data LIKE '%chartlink%'")
    print("[DB] Artillegence database initialised at", DB_PATH)


#  Intelligence Cache 

def save_intelligence(agent: str, data: dict):
    """Upsert the latest data for an agent."""
    payload = json.dumps(data, default=str)
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO intelligence_cache(agent, data, updated_at)
               VALUES(?, ?, ?)
               ON CONFLICT(agent) DO UPDATE SET
                   data       = excluded.data,
                   updated_at = excluded.updated_at""",
            (agent, payload, datetime.now().isoformat())
        )


def get_intelligence(agent: str) -> Optional[dict]:
    """Return the latest cached data for an agent, or None."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT data FROM intelligence_cache WHERE agent = ?", (agent,)
        ).fetchone()
    if row:
        try:
            return json.loads(row["data"])
        except Exception:
            return None
    return None


def get_all_intelligence() -> dict:
    """Return all cached agent outputs keyed by agent name."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT agent, data, updated_at FROM intelligence_cache"
        ).fetchall()
    result = {}
    for row in rows:
        try:
            result[row["agent"]] = {
                "data": json.loads(row["data"]),
                "updated_at": row["updated_at"]
            }
        except Exception:
            pass
    return result


#  Geo Events 

def save_geo_events(events: list):
    """Upsert a batch of geo events. Keeps the 200 most recent."""
    with get_conn() as conn:
        for ev in events:
            conn.execute(
                """INSERT INTO geo_events(id, data, severity, timestamp)
                   VALUES(?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                       data      = excluded.data,
                       severity  = excluded.severity,
                       timestamp = excluded.timestamp""",
                (
                    ev["id"],
                    json.dumps(ev, default=str),
                    ev.get("severity", "low"),
                    ev.get("timestamp", datetime.now().isoformat())
                )
            )
        # Prune to 200 most recent
        conn.execute("""
            DELETE FROM geo_events WHERE id NOT IN (
                SELECT id FROM geo_events ORDER BY timestamp DESC LIMIT 200
            )
        """)


def get_geo_events(limit: int = 200) -> list:
    """Return geo events ordered by timestamp descending."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT data FROM geo_events ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
    result = []
    for row in rows:
        try:
            result.append(json.loads(row["data"]))
        except Exception:
            pass
    return result


#  Signal Log 

def log_signal(agent: str, signal_type: str, target: str,
               direction: str, confidence: str, reasoning: str = ""):
    """Record a new AI-generated signal."""
    import uuid
    sid = f"sig-{uuid.uuid4().hex[:8]}"
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO signal_log
               (id, agent, signal_type, target, direction, confidence, reasoning, timestamp)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?)""",
            (sid, agent, signal_type, target, direction, confidence,
             reasoning[:300], datetime.now().isoformat())
        )


def get_signal_scorecard() -> dict:
    """Calculate overall signal accuracy from the DB."""
    with get_conn() as conn:
        all_signals = [dict(r) for r in conn.execute(
            "SELECT * FROM signal_log ORDER BY timestamp DESC"
        ).fetchall()]

    verified = [s for s in all_signals if s.get("correct") is not None]
    total    = len(verified)
    correct  = sum(1 for s in verified if s["correct"])

    by_agent: dict = {}
    for s in verified:
        ag = s["agent"]
        by_agent.setdefault(ag, {"total": 0, "correct": 0})
        by_agent[ag]["total"] += 1
        if s["correct"]:
            by_agent[ag]["correct"] += 1

    return {
        "total_signals":        len(all_signals),
        "verified_signals":     total,
        "correct_signals":      correct,
        "accuracy_pct":         round((correct / total) * 100, 1) if total > 0 else 0,
        "pending_verification": len(all_signals) - total,
        "by_agent": {
            ag: {
                "total":        d["total"],
                "correct":      d["correct"],
                "accuracy_pct": round((d["correct"] / d["total"]) * 100, 1) if d["total"] > 0 else 0,
            }
            for ag, d in by_agent.items()
        },
        "recent_signals": all_signals[:10],
        "last_updated":   datetime.now().isoformat(),
    }


#  Agent Memory (#5) 

def append_agent_memory(agent: str, summary: str):
    """Add a cycle summary to agent memory. Keeps only the last 10 per agent."""
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO agent_memory(agent, summary, recorded_at) VALUES(?, ?, ?)",
            (agent, summary[:1500], datetime.now().isoformat())
        )
        # Prune: keep only latest 10 rows per agent
        conn.execute("""
            DELETE FROM agent_memory
            WHERE agent = ?
              AND id NOT IN (
                  SELECT id FROM agent_memory
                  WHERE agent = ?
                  ORDER BY recorded_at DESC
                  LIMIT 10
              )
        """, (agent, agent))


def get_agent_memory(agent: str, limit: int = 4) -> list:
    """Return the last `limit` summaries for an agent, oldest-first."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT summary FROM agent_memory
               WHERE agent = ?
               ORDER BY recorded_at DESC
               LIMIT ?""",
            (agent, limit)
        ).fetchall()
    return [r["summary"] for r in reversed(rows)]


def build_memory_context(agent: str) -> str:
    """Build a formatted memory context block to prepend to Mistral prompts."""
    memories = get_agent_memory(agent, limit=4)
    if not memories:
        return ""
    lines = "\n---\n".join(memories)
    return (
        "\n\n=== YOUR LAST FEW CYCLE SUMMARIES (for trend awareness) ===\n"
        f"{lines}\n"
        "=== END OF MEMORY  use only the headlines below for NEW analysis ===\n"
    )


def save_custom_source(url: str, source_type: str, added_by: str = "Admin"):
    """Save a user-added custom source (Telegram or Web)."""
    # Clean URL: strip whitespace and trailing slashes
    url = url.strip().rstrip('/')
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO custom_sources(url, source_type, added_by, added_at)
               VALUES(?, ?, ?, ?)
               ON CONFLICT(url) DO UPDATE SET is_active = 1""",
            (url, source_type, added_by, datetime.now().isoformat())
        )

def get_active_custom_sources(source_type: Optional[str] = None):
    """Retrieve all active custom monitoring sources."""
    with get_conn() as conn:
        if source_type:
            cur = conn.execute("SELECT * FROM custom_sources WHERE source_type = ? AND is_active = 1", (source_type,))
        else:
            cur = conn.execute("SELECT * FROM custom_sources WHERE is_active = 1")
        return [dict(row) for row in cur.fetchall()]

def mark_source_scanned(url: str):
    """Update the last_scanned timestamp for a source."""
    with get_conn() as conn:
        conn.execute("UPDATE custom_sources SET last_scanned = ? WHERE url = ?", (datetime.now().isoformat(), url))

#  User Custom Searches 

def save_user_custom_search(query: str, added_by: str = "User"):
    """Save a user-added custom search query for automated monitoring."""
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO user_custom_searches(query, added_by, added_at)
               VALUES(?, ?, ?)
               ON CONFLICT(query) DO UPDATE SET is_active = 1""",
            (query.strip(), added_by, datetime.now().isoformat())
        )

def get_active_user_custom_searches():
    """Retrieve all active user custom searches for the monitoring loop."""
    with get_conn() as conn:
        cur = conn.execute("SELECT * FROM user_custom_searches WHERE is_active = 1")
        return [dict(row) for row in cur.fetchall()]

def mark_custom_search_run(query: str):
    """Update the last_run timestamp for a custom search."""
    with get_conn() as conn:
        conn.execute("UPDATE user_custom_searches SET last_run = ? WHERE query = ?", (datetime.now().isoformat(), query))


#  Stock Research CRUD Operations 

def create_research_session(symbol: str) -> int:
    """Create a new pending research session and return its database ID."""
    now = datetime.now().isoformat()
    with get_conn() as conn:
        cursor = conn.execute(
            """INSERT INTO stock_research(symbol, status, logs, screenshots, report, created_at, updated_at)
               VALUES(?, 'pending', '[]', '[]', NULL, ?, ?)""",
            (symbol.upper().strip(), now, now)
        )
        return cursor.lastrowid

def update_research_session(session_id: int, status: str, logs: list, screenshots: list, report: Optional[dict] = None):
    """Update the status, logs, screenshots list, and final report of a research session."""
    now = datetime.now().isoformat()
    logs_json = json.dumps(logs)
    screenshots_json = json.dumps(screenshots)
    report_json = json.dumps(report) if report else None
    
    with get_conn() as conn:
        conn.execute(
            """UPDATE stock_research
               SET status = ?, logs = ?, screenshots = ?, report = ?, updated_at = ?
               WHERE id = ?""",
            (status, logs_json, screenshots_json, report_json, now, session_id)
        )

def get_research_session(session_id: int) -> Optional[dict]:
    """Retrieve details of a single research session."""
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM stock_research WHERE id = ?", (session_id,)).fetchone()
    if row:
        d = dict(row)
        try:
            d["logs"] = json.loads(d["logs"])
        except Exception:
            d["logs"] = []
        try:
            d["screenshots"] = json.loads(d["screenshots"])
        except Exception:
            d["screenshots"] = []
        try:
            d["report"] = json.loads(d["report"]) if d["report"] else None
        except Exception:
            d["report"] = None
        return d
    return None

def get_all_research_sessions() -> list:
    """Retrieve summaries of all past research sessions, ordered newest-first."""
    with get_conn() as conn:
        # We fetch only metadata and final report summary for the list view (exclude large screenshots)
        cur = conn.execute(
            """SELECT id, symbol, status, created_at, updated_at
               FROM stock_research
               ORDER BY id DESC"""
        )
        return [dict(row) for row in cur.fetchall()]


#  Bootstrap on import 
init_db()
