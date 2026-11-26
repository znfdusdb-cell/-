"""내일 감시 목록 → sb_watchlist. bot.daily 가 일봉·셋업 뒤에 부른다(16:20).
연습 범위(회장 결정 11/18): 레이더·검토·유니버스·보유 종목 중 setups.py 가 2단계+피봇을 낸 종목.
연습은 넓게 돌려 규칙대로 움직이는지 보고, 실전(현금)은 그중 검증된 종목을 팀장이 이유와 함께 올려 회장이 유니버스 승인한 것만.
정렬: 보유 → 유니버스 → 나머지, 같은 묶음 안에서는 종가가 피봇에 가까운 순, 최대 40개."""
from __future__ import annotations

from .loop import MAX_WATCH, STOP_PCT

RANK = {"holding": 0, "universe": 1, "review": 2, "radar": 3}


def build(db) -> list[dict]:
    stocks = {s["code"]: s for s in db.select("sb_stocks", "select=code,name,stage&stage=in.(radar,review,universe,holding)&is_seed=eq.false")}
    if not stocks:
        return []
    latest = {}
    for r in db.select("sb_setups", f"select=code,as_of,pivot,cbox_low&data_source=eq.bot&code=in.({','.join(stocks)})&order=as_of.desc"):
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
                     "box_low": float(s["cbox_low"]) if s.get("cbox_low") else None,   # 진입 때 포지션에 저장 → 종가 이탈이면 EX-5
                     "reason": f"{stocks[code]['stage']} · 2단계+피봇 · 종가 {close:,.0f} → 피봇까지 {gap:+.1f}%",
                     "_k": (RANK.get(stocks[code]["stage"], 9), abs(gap))})
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
        try:
            db.upsert("sb_watchlist", rows, "as_of,code")
        except RuntimeError as e:     # 11/27 마이그레이션(box_low) 적용 전
            print("box_low 없이 저장:", e)
            db.upsert("sb_watchlist", [{k: v for k, v in r.items() if k != "box_low"} for r in rows], "as_of,code")
    print(f"감시 목록 {len(rows)}종목 저장")
    return 0


if __name__ == "__main__":
    main()
