"""연습 모드 장중 루프 (팀장 지시서 2026-11-05 일감 A). 주문 함수 없음 — 주문서를 '기록'만 한다.

    python3 -m bot.live.loop                                   # 오늘 09:00~15:30 KST 현재가 폴링 → sb_orders_log(source='practice')
    python3 -m bot.live.loop --replay 2026-05-01..2026-10-31   # 일봉 근사 재생 → ~/.swingbot/replay_orders.jsonl → audit

판정(확정본 규칙 번호를 주문서 rule_id·note 에 남긴다):
  EN-1 체결가 > 피봇 AND 11:00 기준 누적 거래량 ≥ 50일 평균 일거래량 x 0.5
  EN-2 체결가 ≤ 피봇 x 1.03 (추격 금지)
  sb_can_buy(code, price) = true (UV-1·UV-5·FN-1·CD-1·MF-1·EN-7, DB 관문)
  SZ-1 수량 = 잔고 x 1.25% ÷ (체결가 x 6%) 내림, RR-1 손익비 2:1 미만이면 기록 안 함
  EX-1 보유 종목 체결가 ≤ 손절선 → 매도 주문서(장중 즉시), EX-3 +1R 도달 → 손절선을 매수가로 올린 기록
20일선 3일·2R 절반 익절은 종가 기준이라 bot.daily 몫이다(여기 없음).
웹소켓(H0STCNT0)은 표준 라이브러리에 없어 쓰지 않는다. 폴링만, 호출 간격은 kis.MIN_INTERVAL(초당 약 12건).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import date, datetime, timedelta, timezone

from ..config import HOME

KST = timezone(timedelta(hours=9))
CHASE = 0.03          # EN-2
VOL_FRAC = 0.5        # EN-1
VOL_CUTOFF = "11:00"  # EN-1 개장 2시간
RISK_PCT = 0.0125     # SZ-1 (지시서 숫자)
STOP_PCT = 0.06       # EX-1
TARGET_R = 2.0        # RR-1 목표가 = 진입가 + 2R
RR_MIN = 2.0          # RR-1
MAX_WATCH = 40        # KIS 실시간 등록 한도
OPEN, CLOSE, POLL_S = "09:00", "15:30", 5.0
POS_FILE = HOME / "practice_positions.json"
EVENTS_FILE = HOME / "practice_events.jsonl"
ALERT_FILE = HOME / "live.alert"
REPLAY_FILE = HOME / "replay_orders.jsonl"
RULE_TEXT = {"EN-1": "피봇 장중 돌파 + 거래량", "EX-1": "손절 -6% 장중 발동"}


def size(balance: float, price: float) -> int:
    """SZ-1: 거래 리스크 1.25%, 손절폭 6%. 잔고를 넘지 않게."""
    if balance <= 0 or price <= 0:
        return 0
    return max(0, min(math.floor(balance * RISK_PCT / (price * STOP_PCT)), math.floor(balance / price)))


def entry_check(w: dict, price: float, vol_ref: int, hhmm: str, balance: float, gate=None, trigger=None) -> tuple[str, str, dict]:
    """('order'|'wait'|'skip', 규칙·사유, 근거 숫자). wait = 오늘 다시 본다, skip = 오늘 끝.
    trigger = 피봇을 넘었는지 보는 가격(장중은 체결가 그대로, 재생은 일봉 고가 — 체결은 max(시가, 피봇))."""
    pv, v50 = float(w["pivot"]), float(w["vol50"] or 0)
    trigger = price if trigger is None else trigger
    n = {"price": price, "trigger": trigger, "pivot": pv, "chase_max": round(pv * (1 + CHASE), 2), "vol50": v50, "vol_ref": vol_ref,
         "vol_need": round(v50 * VOL_FRAC), "vol_cutoff": VOL_CUTOFF, "time": hhmm, "balance": balance}
    if trigger <= pv or price < pv:
        return "wait", "EN-1 피봇 미돌파", n
    if price > pv * (1 + CHASE):
        return "wait", "EN-2 추격 금지 (피봇 x 1.03 초과)", n
    if v50 <= 0 or vol_ref < v50 * VOL_FRAC:
        return ("wait" if hhmm < VOL_CUTOFF else "skip"), f"EN-1 거래량 {'대기' if hhmm < VOL_CUTOFF else '미달'} ({VOL_CUTOFF} 기준)", n
    n["blockers"] = list(gate(w["code"], price)) if gate else []
    if n["blockers"]:
        return "skip", "sb_can_buy=false: " + "; ".join(n["blockers"]), n
    stop, target = round(price * (1 - STOP_PCT), 2), round(price * (1 + TARGET_R * STOP_PCT), 2)
    n.update(stop=stop, target=target, rr=round((target - price) / (price - stop), 3), qty=size(balance, price))
    if n["rr"] < RR_MIN:
        return "skip", f"RR-1 손익비 {n['rr']} < {RR_MIN}", n
    if n["qty"] <= 0:
        return "skip", "SZ-1 수량 0 (잔고 부족)", n
    return "order", "EN-1", n


def holding_check(p: dict, price: float, hhmm: str) -> tuple[str, dict] | None:
    """보유 종목: EX-1 손절(우선) → EX-3 +1R 본전. 결과 없으면 None."""
    n = {"price": price, "entry": p["entry"], "stop": p["stop"], "initial_stop": p["initial_stop"], "time": hhmm}
    if price <= p["stop"]:
        return "EX-1", n
    if not p.get("be") and price >= p["entry"] + (p["entry"] - p["initial_stop"]):
        return "EX-3", n
    return None


def order_row(ts: str, code: str, side: str, rule: str, n: dict, qty: int) -> dict:
    return {"ts": ts, "code": code, "side": side, "qty": qty, "planned_qty": qty, "price": n["price"], "source": "practice",
            "rule_id": rule, "rule_text": RULE_TEXT[rule], "is_violation": False, "stop_price": n.get("stop"),
            "target_price": n.get("target"), "account_balance_at": n.get("balance"), "note": json.dumps(n, ensure_ascii=False)}


class Book:
    """연습 보유 장부. 주문서는 sink 로, 손절선 이동(EX-3)·판정 기록은 events 로."""
    def __init__(self, positions: dict, sink, events=None):
        self.pos, self.sink, self.events = positions, sink, events if events is not None else []

    def buy(self, ts, code, n):
        self.sink(order_row(ts, code, "buy", "EN-1", n, n["qty"]))
        self.pos[code] = {"entry": n["price"], "qty": n["qty"], "stop": n["stop"], "initial_stop": n["stop"], "be": False, "opened": ts}

    def on_price(self, ts, code, price, hhmm) -> str | None:
        r = holding_check(self.pos[code], price, hhmm)
        if not r:
            return None
        rule, n = r
        if rule == "EX-1":
            self.sink(order_row(ts, code, "sell", "EX-1", n, self.pos.pop(code)["qty"]))
        else:
            self.pos[code].update(stop=self.pos[code]["entry"], be=True)
            self.events.append({"ts": ts, "code": code, "rule": "EX-3", "stop_from": n["stop"], "stop_to": n["entry"], **n})
        return rule


# ---------------------------------------------------------------- 재생 (일봉 근사)
def replay(candles: dict[str, list[dict]], d0: str, d1: str, capital: float) -> tuple[list[dict], list[dict], dict]:
    """과거 일봉으로 근사 재생. 고가 > 피봇이면 max(시가, 피봇) 체결, 거래량은 그날 전체(11:00 누적 대신), sb_can_buy 미적용.
    감시 목록은 전날까지 일봉으로 setups.compute 가 2단계+피봇을 낸 종목."""
    from ..setups import compute
    orders, cash = [], [capital]

    def sink(o):
        cash[0] += (-1 if o["side"] == "buy" else 1) * o["qty"] * o["price"]
        orders.append(o)
    book = Book({}, sink)
    stat = {"days": 0, "signals": 0, "skips": {}}
    days = sorted({c["date"] for cs in candles.values() for c in cs if d0 <= c["date"] <= d1})
    idx = {k: {c["date"]: i for i, c in enumerate(cs)} for k, cs in candles.items()}
    for d in days:
        stat["days"] += 1
        for code, cs in candles.items():
            i = idx[code].get(d)
            if i is None or i < 60:
                continue
            bar, ts = cs[i], f"{d}T15:30:00+09:00"
            if code in book.pos:
                for k in ("open", "low", "high"):     # 시가(갭이면 시가 체결) → 저가(손절 우선, 손절선 체결) → 고가(+1R)
                    if code in book.pos:
                        px = book.pos[code]["stop"] if k == "low" and bar["low"] <= book.pos[code]["stop"] else bar[k]
                        book.on_price(ts, code, px, "근사")
                continue
            hist = [dict(c) for c in cs[max(0, i - 400):i]]
            s = compute(code, hist)
            if not s or not s["pivot"] or bar["high"] <= s["pivot"]:
                continue
            stat["signals"] += 1
            w = {"code": code, "pivot": s["pivot"], "vol50": sum(c["volume"] for c in cs[i - 50:i]) / 50}
            fill = max(bar["open"], s["pivot"])
            eq = cash[0] + sum(p["qty"] * bar["close"] for p in book.pos.values())
            v, why, n = entry_check(w, fill, bar["volume"], VOL_CUTOFF, eq, trigger=bar["high"])
            if v == "order" and n["qty"] * fill > cash[0]:
                v, why = "skip", "현금 부족"
            if v == "order":
                n["approx"] = "재생 근사: 일봉 고가>피봇 → max(시가,피봇) 체결, 거래량=하루 전체, sb_can_buy 미적용"
                book.buy(ts, code, n)
                if bar["low"] <= book.pos[code]["stop"]:               # 진입일 손절(보수적)
                    book.on_price(ts, code, book.pos[code]["stop"], "근사")
            else:
                stat["skips"][why.split(" (")[0]] = stat["skips"].get(why.split(" (")[0], 0) + 1
    stat["open_positions"] = len(book.pos)
    return orders, book.events, stat


# ---------------------------------------------------------------- 장중
def now_kst() -> datetime:
    return datetime.now(KST)


def alert(msg: str) -> None:
    line = f"{now_kst():%Y-%m-%d %H:%M} 연습 루프: {msg}"
    print("ALERT", line, file=sys.stderr)
    with open(ALERT_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_watchlist(db, today: date) -> list[dict]:
    rows = db.select("sb_watchlist", f"select=as_of,code,pivot,stop,vol50,reason&as_of=lt.{today}&order=as_of.desc&limit={MAX_WATCH}")
    return [r for r in rows if r["as_of"] == rows[0]["as_of"] and r["pivot"]] if rows else []


def balance_of(db) -> float:
    r = db.select("sb_balance_snapshots", "select=total_value,cash&account=eq.kis_bot&code=is.null&order=as_of.desc&limit=1")
    return float((r[0].get("total_value") or r[0].get("cash") or 0)) if r else 0.0


def run_live() -> int:
    from ..config import load_env
    from ..kis import Kis, KisError
    from ..supa import Supa
    env = load_env()
    kis, db = Kis(env["KIS_APP_KEY"], env["KIS_APP_SECRET"]), Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])
    today = now_kst().date()
    if today.weekday() >= 5 or db.select("sb_holidays", f"select=day&day=eq.{today}"):
        print(f"{today} 휴장, 종료")
        return 0
    wl = {w["code"]: w for w in load_watchlist(db, today)}
    balance = balance_of(db)
    positions = json.loads(POS_FILE.read_text(encoding="utf-8")) if POS_FILE.exists() else {}

    def save():
        POS_FILE.write_text(json.dumps(positions, ensure_ascii=False), encoding="utf-8")

    def sink(o):
        db.insert("sb_orders_log", [o])
        print("주문서", o["side"], o["code"], o["qty"], o["price"], o["rule_id"])
    book = Book(positions, sink)
    codes = (list(positions) + [c for c in wl if c not in positions])[:MAX_WATCH]
    print(f"===== {now_kst():%Y-%m-%d %H:%M} 연습 루프: 감시 {len(wl)} + 연습 보유 {len(positions)}, 잔고 {balance:,.0f} =====")
    if not balance:
        print("SZ-1: 봇 계좌 잔고 스냅샷 없음 → 진입 주문서 기록 불가 (손절 감시는 계속)")
    vol_pre, done, last_why, fails = {}, set(), {}, 0
    while (hhmm := f"{now_kst():%H:%M}") < CLOSE:
        if hhmm < OPEN:
            time.sleep(10)
            continue
        for code in codes:
            try:
                q = kis.price(code)
            except (KisError, OSError) as e:
                fails += 1
                print(f"{code} 현재가 실패: {e}")
                if fails in (20, 200):
                    alert(f"현재가 조회 실패 {fails}회 (마지막 {code}: {e})")
                continue
            if q["price"] <= 0:
                continue
            ts, hhmm = now_kst().isoformat(timespec="seconds"), f"{now_kst():%H:%M}"
            if code in positions:
                if (rule := book.on_price(ts, code, q["price"], hhmm)):
                    print(f"{code} {rule}", json.dumps(book.events[-1] if rule == "EX-3" else {}, ensure_ascii=False))
                    if rule == "EX-3":
                        with open(EVENTS_FILE, "a", encoding="utf-8") as f:
                            f.write(json.dumps(book.events[-1], ensure_ascii=False) + "\n")
                    save()
                continue
            if code not in wl or code in done or not balance:
                continue
            if hhmm < VOL_CUTOFF:
                vol_pre[code] = q["volume"]       # 11:00 기준 = 11:00 전 마지막 조회값(보수적)
            ref = q["volume"] if hhmm < VOL_CUTOFF else vol_pre.get(code, 0)

            def gate(c, p):
                return [] if db.rpc("sb_can_buy", {"p_code": c, "p_price": p}) else db.rpc("sb_buy_blockers", {"p_code": c, "p_price": p})
            v, why, n = entry_check(wl[code], q["price"], ref, hhmm, balance, gate)
            if v == "order":
                book.buy(ts, code, n)
                save()
                done.add(code)
            elif v == "skip" or why != last_why.get(code):
                print(f"{hhmm} {code} {why} {json.dumps(n, ensure_ascii=False)}")
                last_why[code] = why
                if v == "skip":
                    done.add(code)
        time.sleep(POLL_S)
    print(f"===== {now_kst():%H:%M} 종료: 연습 보유 {len(positions)}, 조회 실패 {fails} =====")
    return 0


def load_replay_candles(all_codes: bool) -> dict[str, list[dict]]:
    """VPS 캐시(cache.db) 일봉. 기본은 sb_stocks 유니버스·보유 종목, --all 이면 캐시 전 종목."""
    from ..cache import db as cdb, get_candles
    con = cdb()
    if all_codes:
        codes = [r[0] for r in con.execute("select distinct code from candles")]
    else:
        from ..config import load_env
        from ..supa import Supa
        env = load_env()
        codes = [s["code"] for s in Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"]).select(
            "sb_stocks", "select=code&stage=in.(universe,holding)&is_seed=eq.false")]
    return {c: get_candles(con, c, 1000) for c in codes}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--replay", help="YYYY-MM-DD..YYYY-MM-DD")
    ap.add_argument("--capital", type=float, default=1e8, help="재생 시작 잔고 (백테스트 Params.capital 과 같은 1억)")
    ap.add_argument("--all", action="store_true", help="재생: 캐시 전 종목")
    a = ap.parse_args(argv)
    if not a.replay:
        try:
            return run_live()
        except Exception as e:
            alert(f"중단: {e}")
            raise
    d0, d1 = a.replay.split("..")
    orders, events, stat = replay(load_replay_candles(a.all), d0, d1, a.capital)
    with open(REPLAY_FILE, "w", encoding="utf-8") as f:
        for o in orders:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
    print(f"재생 {d0}..{d1} (근사: 일봉 고가>피봇 → max(시가,피봇) 체결, 거래량=하루 전체, sb_can_buy 미적용)")
    print(f"거래일 {stat['days']}, 돌파 신호 {stat['signals']}, 주문서 {len(orders)} (매수 {sum(o['side'] == 'buy' for o in orders)}), "
          f"EX-3 {len(events)}, 미진입 {stat['skips']}, 남은 보유 {stat['open_positions']} → {REPLAY_FILE}")
    from .audit import report
    return report(orders[-30:])


if __name__ == "__main__":
    sys.exit(main())
