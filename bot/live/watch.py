"""내일 감시 목록 → sb_watchlist. bot.daily 가 일봉·셋업 뒤에 부른다(16:20).
유니버스·보유 종목 중 setups.py 가 2단계+피봇을 낸 종목(피봇이 있으면 2단계), 보유 먼저 → 종가가 피봇에 가까운 순, 최대 40개."""
from __future__ import annotations

from .loop import MAX_WATCH, STOP_PCT


def build(db) -> list[dict]:
    stocks = {s["code"]: s for s in db.select("sb_stocks", "select=code,name,stage&stage=in.(universe,holding)&is_seed=eq.false")}
    if not stocks:
        return []
    latest = {}
    for r in db.select("sb_setups", f"select=code,as_of,pivot&data_source=eq.bot&code=in.({','.join(stocks)})&order=as_of.desc"):
        latest.setdefault(r["code"], r)
    rows = []
    for code, s in latest.items():
        if not s.get("pivot"):
            continue
        c = db.select("sb_candles", f"select=date,close,volume&code=eq.{code}&source=neq.seed&order=date.desc&limit=50")
        if len(c) < 50 or c[0]["date"] != s["as_of"]:
            continue
        pv, close = float(s["pivot"]), float(c[0]["close"])
        gap = (pv / close - 1) * 100
        rows.append({"as_of": s["as_of"], "code": code, "pivot": pv, "stop": round(pv * (1 - STOP_PCT), 2),
                     "vol50": round(sum(int(x["volume"]) for x in c) / 50),
                     "reason": f"{stocks[code]['stage']} · 2단계+피봇 · 종가 {close:,.0f} → 피봇까지 {gap:+.1f}%",
                     "_k": (stocks[code]["stage"] != "holding", abs(gap))})
    rows = sorted(rows, key=lambda r: r["_k"])[:MAX_WATCH]
    for r in rows:
        r.pop("_k")
    return rows


def main() -> int:
    from ..config import load_env
    from ..supa import Supa
    env = load_env()
    db = Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])
    rows = build(db)
    for as_of in {r["as_of"] for r in rows}:
        db.delete("sb_watchlist", f"as_of=eq.{as_of}")
    if rows:
        db.upsert("sb_watchlist", rows, "as_of,code")
    print(f"감시 목록 {len(rows)}종목 저장")
    return 0
