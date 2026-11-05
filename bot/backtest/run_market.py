"""py -m bot.backtest.run_market --market KR|US [--dummy] → v2 사다리(L0~L6, run_v2.LADDER 그대로)를 시장 변수로 실행.
시장별로 다른 것은 로더·달력·지수·통화·비용(markets.py·costs.py)뿐. 판정은 gate.verdict(PASS/WAIT, 시장별 독립).
결과 ~/.swingbot_bt/out/report_<시장>[_dummy].txt, trades_<시장>[_dummy].csv (레포 밖).
"""
from __future__ import annotations

import argparse
import sys
import time
from dataclasses import replace

import pandas as pd

from . import data, gate, markets
from .costs import COSTS
from .engine import Params, features, market_state, signals, simulate
from .run import PERIODS, START, pct, sub
from .run_v2 import LADDER, VARIANTS, row


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", choices=list(markets.SPEC), required=True)
    ap.add_argument("--dummy", action="store_true", help="합성 데이터로 실행만 확인")
    a = ap.parse_args(argv)
    m, t0, out = a.market, time.time(), []
    say = lambda *x: (print(*x), out.append(" ".join(str(y) for y in x)))  # noqa: E731
    sp, cs = markets.SPEC[m], COSTS[m]
    D = markets.load(m, a.dummy)
    pn, idx, days, mkt_of = D["pn"], D["idx"], D["days"], D["mkt_of"]
    bias = sp["survivorship_bias"] or a.dummy
    say(f"[시장] {m} 통화 {sp['currency']} 지수 {'/'.join(sp['indices'])} 비용 {'확인' if cs['verified'] else '임시값'}({cs['source']}) 생존편향 {'있음' if bias else '없음'} {D['note']}")
    say(f"[데이터] 종목 {len(pn['close'].columns)}, 거래일 {len(days)} ({days[0]:%Y-%m-%d}~{days[-1]:%Y-%m-%d})")

    feats = {}
    def prep(rs_min):
        if rs_min not in feats:
            p = Params(rs_min=rs_min, market=m)
            f = features(pn, p)
            ms = market_state(idx, days, p.slope_min)
            feats[rs_min] = (f, ms, signals(pn, f, mkt_of, ms, p, 1.0, START))
            sg = feats[rs_min][2]
            say(f"[신호] RS{rs_min}: 장중 피봇 돌파 후보(K>=1.0) {len(sg)}건, 종가 돌파 {int(sg['close_break'].sum()) if len(sg) else 0}건")
        return feats[rs_min]

    all_trades, results = [], {}
    hdr = "단계 | 거래 | 승률 | 평균이익 | 평균손실 | 손익비 | 기댓값%(비용전) | 기댓값R | 평균보유일 | CAGR | MDD | MDD기간 | 노출도 | 청산사유 | 미체결"
    say(f"\n[1] 사다리 (시장필터 ON, 비용 후) {START}~")
    say(hdr)
    for name, kw in LADDER:
        f, ms, sigs = prep(kw["rs_min"])
        p = Params(use_filter=True, market=m, **kw)
        r, g = simulate(pn, f, sigs, ms, p, START), simulate(pn, f, sigs, ms, replace(p, costs=False), START)
        results[name] = r
        say(row(name, r, g))
        all_trades += [dict(t, run=name) for t in r.trades]

    say("\n[2] 변형 (L1~L4 각각: K=1.5 / 추격 5% / 둘 다)")
    say(hdr)
    for name, kw in LADDER[1:5]:
        f, ms, sigs = prep(kw["rs_min"])
        for v in VARIANTS:
            p = Params(use_filter=True, market=m, **{**kw, **v})
            r, g = simulate(pn, f, sigs, ms, p, START), simulate(pn, f, sigs, ms, replace(p, costs=False), START)
            vn = f"{name} {v}"
            say(row(vn, r, g))
            all_trades += [dict(t, run=vn) for t in r.trades]

    e_min = gate.EXP_MIN + (gate.BIAS_ADD if bias else 0)
    say(f"\n[3] 판정 (공통 기준: 기댓값>{pct(e_min, 1)}, MDD<={pct(gate.MDD_MAX, 0)}, 거래>={gate.N_MIN}, 최근 {gate.RECENT[0]}~{gate.RECENT[1]} 기댓값>{pct(e_min, 1)})")
    for name, r in results.items():
        v, c = gate.verdict(r, bias)
        say(f"{name}: 기댓값 {pct(c['exp'][0], 2)} {'O' if c['exp'][1] else 'X'}, MDD {pct(c['mdd'][0])} {'O' if c['mdd'][1] else 'X'}, "
            f"거래 {c['n'][0]} {'O' if c['n'][1] else 'X'}, 최근2년 기댓값 {pct(c['recent_exp'][0], 2)} {'O' if c['recent_exp'][1] else 'X'} → {v}")

    say("\n[4] 기간 분할 (사다리, 비용 후): 거래 | 승률 | 기댓값% | 기댓값R | CAGR | MDD")
    for name, r in results.items():
        for pn_, (x, y) in {**PERIODS, "최근2년(판정)": gate.RECENT}.items():
            s = sub(r, x, y)
            say(f"{name} {pn_}: {s['n']} | {pct(s.get('win'))} | {pct(s.get('exp'), 2)} | {s.get('exp_R', 0):.3f} | {pct(s['cagr'])} | {pct(s['mdd'])}")

    say("\n[5] 연도별 수익률 (사다리, 비용 후)")
    for name, r in results.items():
        rows = []
        for y in range(2015, 2027):
            prev, cur = r.equity.loc[:f"{y - 1}-12-31"], r.equity.loc[str(y)]
            if cur.empty:
                continue
            rows.append(f"{y} {pct(cur.iloc[-1] / (prev.iloc[-1] if len(prev) else r.equity.iloc[0]) - 1)}")
        say(f"{name}: " + "; ".join(rows))

    say(f"\n실행 {time.time() - t0:.0f}초")
    od = data.CACHE / "out"
    od.mkdir(parents=True, exist_ok=True)
    tag = m + ("_dummy" if a.dummy else "")
    (od / f"report_{tag}.txt").write_text("\n".join(out), encoding="utf-8")
    pd.DataFrame(all_trades).to_csv(od / f"trades_{tag}.csv", index=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
