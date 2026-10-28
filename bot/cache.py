"""VPS 로컬 캐시(sqlite, ~/.swingbot/cache.db). 전 종목 일봉·DART 실적은 여기에만 두고 Supabase엔 안 넣는다(무료 한도 보호)."""
from __future__ import annotations

import json
import sqlite3
import time

from .config import HOME


def db() -> sqlite3.Connection:
    HOME.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(HOME / "cache.db")
    con.executescript("""
    create table if not exists candles (code text, date text, open real, high real, low real, close real, volume integer, primary key (code, date));
    create table if not exists kv (k text primary key, v text, at real);
    """)
    return con


def kv_get(con, k: str, max_age_s: float | None = None):
    r = con.execute("select v, at from kv where k=?", (k,)).fetchone()
    if not r or (max_age_s is not None and time.time() - r[1] > max_age_s):
        return None
    return json.loads(r[0])


def kv_set(con, k: str, v) -> None:
    con.execute("insert or replace into kv values (?,?,?)", (k, json.dumps(v, ensure_ascii=False), time.time()))
    con.commit()


def put_candles(con, rows: list[dict]) -> None:
    con.executemany("insert or replace into candles values (?,?,?,?,?,?,?)",
                    [(r["code"], r["date"], r["open"], r["high"], r["low"], r["close"], r["volume"]) for r in rows])
    con.commit()


def get_candles(con, code: str, limit: int = 400) -> list[dict]:
    rows = con.execute("select date, open, high, low, close, volume from candles where code=? order by date desc limit ?", (code, limit)).fetchall()
    return [{"date": d, "open": o, "high": h, "low": l, "close": c, "volume": v} for d, o, h, l, c, v in reversed(rows)]


def last_date(con, code: str):
    r = con.execute("select max(date), count(*) from candles where code=?", (code,)).fetchone()
    return r[0], r[1]


def prune(con, keep_from: str) -> None:
    con.execute("delete from candles where date < ?", (keep_from,))
    con.commit()
