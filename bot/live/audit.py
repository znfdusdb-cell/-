"""연습 주문서 위반 검사: 최근 주문서 30장을 규칙표와 대조해 위반 0인지 출력.

    python3 -m bot.live.audit                          # sb_orders_log source='practice' 최근 30장
    python3 -m bot.live.audit --file ~/.swingbot/replay_orders.jsonl
종료 코드: 위반 0 이면 0, 있으면 1.
"""
from __future__ import annotations

import argparse
import json
import sys

from .exits import MA_DAYS
from .loop import CHASE, RR_MIN, STOP_PCT, VOL_FRAC, size

TOL = 0.011  # 가격 반올림 허용 (numeric(14,2))


def check(o: dict) -> list[str]:
    n = json.loads(o["note"]) if isinstance(o.get("note"), str) else (o.get("note") or {})
    px, bad = float(o["price"]), []
    if o["side"] == "buy":
        if o.get("rule_id") != "EN-1":
            bad.append(f"EN-1 아닌 근거 {o.get('rule_id')}")
        pv = n.get("pivot", float("inf"))
        if not (float(n.get("trigger", px)) > pv and px >= pv):
            bad.append(f"EN-1 돌파 아님: 확인가 {n.get('trigger', px)}·체결가 {px} / 피봇 {n.get('pivot')}")
        if px > n.get("pivot", 0) * (1 + CHASE) + TOL:
            bad.append(f"EN-2 추격: {px} > 피봇 x 1.03")
        if n.get("vol_ref", 0) < n.get("vol50", float("inf")) * VOL_FRAC:
            bad.append(f"EN-1 거래량 {n.get('vol_ref')} < 50일 평균 {n.get('vol50')} x 0.5")
        if n.get("blockers"):
            bad.append("sb_can_buy=false 인데 매수: " + "; ".join(n["blockers"]))
        if o.get("stop_price") is None or abs(float(o["stop_price"]) - px * (1 - STOP_PCT)) > TOL:
            bad.append(f"EX-1 손절선 {o.get('stop_price')} ≠ 체결가 x 0.94")
        if n.get("rr") is None or n["rr"] < RR_MIN:
            bad.append(f"RR-1 손익비 {n.get('rr')} < {RR_MIN}")
        want = size(float(n.get("balance") or 0), px)
        if o["qty"] != want or o.get("planned_qty") != o["qty"]:
            bad.append(f"SZ-1/EN-8 수량 {o['qty']} (계획 {o.get('planned_qty')}) ≠ 계산 {want}")
    elif o.get("rule_id") == "EX-1":
        if n.get("stop") is None or px > float(n["stop"]) + TOL:
            bad.append(f"EX-1 매도가 {px} > 손절선 {n.get('stop')}")
    elif o.get("rule_id") == "EX-5":        # 종가 퇴출: 전 거래일 종가 판정 → 다음 장 매도
        x = n.get("exit") or {}
        ok = x.get("ma20_days", 0) >= MA_DAYS or (x.get("box_low") and float(x.get("close", 0)) < float(x["box_low"]))
        if x.get("rule") != "EX-5" or not ok:
            bad.append(f"EX-5 근거 없음: 20일선 {x.get('ma20_days')}일·종가 {x.get('close')}·박스 하단 {x.get('box_low')}")
        if not x.get("as_of") or str(o["ts"])[:10] <= x["as_of"]:
            bad.append(f"EX-5 판정일 {x.get('as_of')} 다음 장이 아닌 {str(o['ts'])[:10]} 매도")
        if n.get("stop") is not None and px <= float(n["stop"]) - TOL:
            bad.append(f"EX-4 우선순위: 손절선 {n['stop']} 아래 {px} 인데 EX-1 아닌 EX-5")
    elif o.get("rule_id") == "UV-3":
        if (n.get("exit") or {}).get("rule") != "UV-3":
            bad.append("UV-3 매도인데 퇴출 승인 표시 없음")
    else:
        bad.append(f"매도 근거 {o.get('rule_id')} (연습 매도는 EX-1·EX-5·UV-3)")
    return bad


def report(orders: list[dict]) -> int:
    v = 0
    print("시각 | 종목 | 매수/매도 | 규칙 | 가격 | 수량 | 위반")
    for o in orders:
        bad = check(o)
        v += len(bad)
        print(f"{o['ts']} | {o['code']} | {o['side']} | {o.get('rule_id')} | {float(o['price']):,.0f} | {o['qty']} | {'; '.join(bad) or '0'}")
    print(f"주문서 {len(orders)}장 (매수 {sum(o['side'] == 'buy' for o in orders)}, 매도 {sum(o['side'] == 'sell' for o in orders)}), 위반 {v}건")
    return 0 if v == 0 else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("-n", type=int, default=30)
    a = ap.parse_args(argv)
    if a.file:
        with open(a.file, encoding="utf-8") as f:
            orders = [json.loads(x) for x in f if x.strip()][-a.n:]
    else:
        from ..config import load_env
        from ..supa import Supa
        env = load_env()
        orders = Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"]).select(
            "sb_orders_log", f"select=*&source=eq.practice&order=ts.desc&limit={a.n}")[::-1]
    return report(orders)


if __name__ == "__main__":
    sys.exit(main())
