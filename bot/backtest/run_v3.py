"""py -m bot.backtest.run_v3 → v3 사다리(2026-11-18 팀장): v2와 같은 기간·같은 사다리(run_v2.LADDER) + 책 원본 대조 정정.
결과 ~/.swingbot_bt/out/report_v3.txt, trades_v3.csv (레포 밖). 데이터는 run.py 와 같은 캐시.

v2 → v3 바뀐 것 (규칙 추가 없음, 번역 오류·집계 정정만):
  TT6 52주 저가 대비 25% → 30% (Params.tt6_low)
  본전 올리기 +1R → +3R (Params.be_r, breakeven 모드 L2~L6)
  절반 익절: 2행 → 포지션 1행 (L4·L5). 모든 숫자는 포지션 기준
  갭 하락 손절: 시가 체결(이미 v1부터), 해당 거래 수와 손절가 대비 차이를 따로 적는다
실적 거름(영업이익 25%/강세장 40%)은 백테스트에 실적 데이터가 없어 반영 안 됨(봇 scan.py 에만).
"""
from __future__ import annotations

import sys
import time
from dataclasses import replace

import pandas as pd

from . import data, gate
from .engine import Params, features, market_state, signals, simulate
from .run import PERIODS, START, pct, sub
from .run_v2 import LADDER, row


def gap_line(name, trades):
    g = [t for t in trades if t.get("gap_stop")]
    if not trades:
        return f"{name}: 거래 없음"
    cost = sum(t["gap_cost"] for t in g)
    return (f"{name}: 갭 손절 {len(g)}건 / 손절 {sum(t['why'] == '손절' for t in trades)}건 / 전체 {len(trades)}건, "
            f"손절가 대신 시가로 더 잃은 몫 평균 {pct(cost / len(g) if g else 0, 2)}(갭 거래당) · 합 {pct(cost, 1)}, "
            f"한 번 거래 기댓값 영향 {pct(cost / len(trades), 3)}p")


def main(argv=None) -> int:
    t0 = time.time()
    out = []
    say = lambda *a: (print(*a), out.append(" ".join(str(x) for x in a)))  # noqa: E731
    u = data.universe()
    idx = {k: data.index(k) for k in ("KS11", "KQ11")}
    days = idx["KS11"].index
    pn = data.panel(data.candles(list(u["code"])), days)
    mkt_of = dict(zip(u["code"], u["market"].map({"KOSPI": "KS11", "KOSDAQ": "KQ11"}).fillna("KQ11")))
    p0 = Params()
    say(f"[데이터] 종목 {len(pn['close'].columns)}, 거래일 {len(days)} ({days[0]:%Y-%m-%d}~{days[-1]:%Y-%m-%d})")
    say(f"[v3 정정] TT6 {p0.tt6_low:.0%}, 본전 +{p0.be_r:g}R, 포지션 기준 집계, 갭 손절 시가 체결")

    feats = {}
    def prep(rs_min):
        if rs_min not in feats:
            p = Params(rs_min=rs_min)
            f = features(pn, p)
            ms = market_state(idx, days, p.slope_min)
            feats[rs_min] = (f, ms, signals(pn, f, mkt_of, ms, p, 1.0, START))
            say(f"[신호] RS{rs_min}: 장중 피봇 돌파 후보(K>=1.0) {len(feats[rs_min][2])}건, 종가 돌파 {int(feats[rs_min][2]['close_break'].sum())}건")
        return feats[rs_min]

    all_trades, results = [], {}
    say(f"\n[1] 사다리 (시장필터 ON, 비용 후, 포지션 기준) {START}~")
    say("단계 | 거래 | 승률 | 평균이익 | 평균손실 | 손익비 | 기댓값%(비용전) | 기댓값R | 평균보유일 | CAGR | MDD | MDD기간 | 노출도 | 청산사유 | 미체결")
    for name, kw in LADDER:
        f, ms, sigs = prep(kw["rs_min"])
        p = Params(use_filter=True, **kw)
        r, g = simulate(pn, f, sigs, ms, p, START), simulate(pn, f, sigs, ms, replace(p, costs=False), START)
        results[name] = r
        say(row(name, r, g) + (f" | 절반익절 포함 {sum(t['tp'] for t in r.trades)}건" if kw["take_profit"] else ""))
        all_trades += [dict(t, run=name) for t in r.trades]

    say(f"\n[2] 판정 (바꾸지 않은 공통 기준: 비용·세금 뒤 기댓값>0, MDD<={pct(gate.MDD_MAX, 0)}, 거래>={gate.N_MIN}, 최근 {gate.RECENT[0]}~{gate.RECENT[1]} 기댓값>0)")
    for name, r in results.items():
        v, c = gate.verdict(r, False)
        say(f"{name}: 기댓값 {pct(c['exp'][0], 2)} {'O' if c['exp'][1] else 'X'}, MDD {pct(c['mdd'][0])} {'O' if c['mdd'][1] else 'X'}, "
            f"거래 {c['n'][0]} {'O' if c['n'][1] else 'X'}, 최근2년 기댓값 {pct(c['recent_exp'][0], 2)} {'O' if c['recent_exp'][1] else 'X'} → {v}")

    say("\n[3] 기간 분할 (비용 후): 거래 | 승률 | 기댓값% | 기댓값R | CAGR | MDD")
    for name, r in results.items():
        for pn_, (a, b) in {**PERIODS, "최근2년(판정)": gate.RECENT}.items():
            s = sub(r, a, b)
            say(f"{name} {pn_}: {s['n']} | {pct(s.get('win'))} | {pct(s.get('exp'), 2)} | {s.get('exp_R', 0):.3f} | {pct(s['cagr'])} | {pct(s['mdd'])}")

    say("\n[4] 갭 하락 손절 (시가가 손절가 아래 → 시가 체결). 차이 = (손절가 - 시가) / 진입가, 포지션 비중 가중")
    for name, r in results.items():
        say(gap_line(name, r.trades))

    say("\n[5] 연도별 수익률 (비용 후)")
    for name, r in results.items():
        rows = []
        for y in range(2015, 2027):
            prev, cur = r.equity.loc[:f"{y - 1}-12-31"], r.equity.loc[str(y)]
            if cur.empty:
                continue
            rows.append(f"{y} {pct(cur.iloc[-1] / (prev.iloc[-1] if len(prev) else r.equity.iloc[0]) - 1)}")
        say(f"{name}: " + "; ".join(rows))

    say("\n주: 장중 진입은 '고가>피봇인 날 max(시가,피봇)에 체결'로 근사(분봉 없음). 거래량 K는 하루 거래량 기준.")
    say("주: 실적 거름(DART 과거 실적)·피라미딩·3C·플랫은 백테스트에 없음. 새 후보 규칙(A~AU) 미반영.")
    say(f"\n실행 {time.time() - t0:.0f}초")
    od = data.CACHE / "out"
    od.mkdir(exist_ok=True)
    (od / "report_v3.txt").write_text("\n".join(out), encoding="utf-8")
    pd.DataFrame(all_trades).to_csv(od / "trades_v3.csv", index=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
