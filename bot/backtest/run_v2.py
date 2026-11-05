"""py -m bot.backtest.run_v2 → v2 사다리: 규칙을 한 번에 하나씩 책·확정본 쪽으로 바꿔 가며 효과를 가른다.
결과 ~/.swingbot_bt/out/report_v2.txt, trades_v2.csv (레포 밖). 데이터는 run.py 와 같은 캐시.

사다리 (시장필터 ON 고정, 손절 -6% 고정):
  L0 v1 그대로           : 종가 돌파→다음날 시가, K=1.5, 종가x0.94 트레일, 20일선 1일, 익절 없음, RS70
  L1 진입만 책대로        : 장중 돌파 즉시(max(시가,피봇)), K=1.0(개장 2시간 50% ≈ 하루 100%)
  L2 + 손절 책대로        : 트레일 제거, -6% 고정 → +1R 뒤 본전(EX-3)
  L3 + 20일선 3일 연속    : 진입 근거 붕괴 = 3일(확정본)
  L4 + 2:1 절반 익절      : RR-1
  L5 + RS 90              : 선별 강화(책: 70, 가능하면 90)
  L6 = L3 + RS 90 (익절 없이)
변형 범위: L1~L4 각각 K=1.0 / 1.5, 추격 허용 3% / 5%.
"""
from __future__ import annotations

import sys
import time
from dataclasses import replace

import pandas as pd

from . import data
from .engine import Params, features, market_state, signals, simulate, stats
from .run import PERIODS, START, pct, sub, verdict

LADDER = [
    ("L0 v1 그대로",            dict(entry_mode="next_open", K=1.5, stop_mode="trail94",   ma20_days=1, take_profit=False, rs_min=70)),
    ("L1 +진입 장중",           dict(entry_mode="intraday",  K=1.0, stop_mode="trail94",   ma20_days=1, take_profit=False, rs_min=70)),
    ("L2 +손절 본전고정",       dict(entry_mode="intraday",  K=1.0, stop_mode="breakeven", ma20_days=1, take_profit=False, rs_min=70)),
    ("L3 +20일선 3일",          dict(entry_mode="intraday",  K=1.0, stop_mode="breakeven", ma20_days=3, take_profit=False, rs_min=70)),
    ("L4 +익절 2:1 절반",       dict(entry_mode="intraday",  K=1.0, stop_mode="breakeven", ma20_days=3, take_profit=True,  rs_min=70)),
    ("L5 +RS90",                dict(entry_mode="intraday",  K=1.0, stop_mode="breakeven", ma20_days=3, take_profit=True,  rs_min=90)),
    ("L6 L3+RS90",              dict(entry_mode="intraday",  K=1.0, stop_mode="breakeven", ma20_days=3, take_profit=False, rs_min=90)),
]
VARIANTS = [dict(K=1.5), dict(chase=0.05), dict(K=1.5, chase=0.05)]


def row(name, r, g):
    s, sg = stats(r.trades, r.equity, r.exposure), stats(g.trades, g.equity, g.exposure)
    whys = pd.Series([t["why"] for t in r.trades]).value_counts().to_dict() if r.trades else {}
    return (f"{name} | {s['n']} | {pct(s.get('win'))} | {pct(s.get('avg_win'), 2)} | {pct(s.get('avg_loss'), 2)} | {s.get('payoff', 0):.2f} | "
            f"{pct(s.get('exp'), 2)} ({pct(sg.get('exp'), 2)}) | {s.get('exp_R', 0):.3f} | {s.get('hold', 0):.1f} | "
            f"{pct(s['cagr'])} | {pct(s['mdd'])} | {s['mdd_period']} | {pct(s['exposure'])} | 청산 {whys} | 미체결 {dict(r.unfilled.most_common(4))}")


def main(argv=None) -> int:
    t0 = time.time()
    out = []
    say = lambda *a: (print(*a), out.append(" ".join(str(x) for x in a)))  # noqa: E731
    u = data.universe()
    idx = {k: data.index(k) for k in ("KS11", "KQ11")}
    days = idx["KS11"].index
    dd = data.candles(list(u["code"]))
    pn = data.panel(dd, days)
    mkt_of = dict(zip(u["code"], u["market"].map({"KOSPI": "KS11", "KOSDAQ": "KQ11"}).fillna("KQ11")))
    say(f"[데이터] 종목 {len(pn['close'].columns)}, 거래일 {len(days)} ({days[0]:%Y-%m-%d}~{days[-1]:%Y-%m-%d})")

    feats, sig_cache = {}, {}
    def prep(rs_min):
        if rs_min not in feats:
            p = Params(rs_min=rs_min)
            f = features(pn, p)
            ms = market_state(idx, days, p.slope_min)
            feats[rs_min] = (f, ms, signals(pn, f, mkt_of, ms, p, 1.0, START))
            say(f"[신호] RS{rs_min}: 장중 피봇 돌파 후보(K>=1.0) {len(feats[rs_min][2])}건, 종가 돌파 {int(feats[rs_min][2]['close_break'].sum())}건")
        return feats[rs_min]

    all_trades = []
    hdr = "단계 | 거래 | 승률 | 평균이익 | 평균손실 | 손익비 | 기댓값%(비용전) | 기댓값R | 평균보유일 | CAGR | MDD | MDD기간 | 노출도 | 청산사유 | 미체결"
    say("\n[1] 사다리 (시장필터 ON, 비용 후) 2015-01-02~")
    say(hdr)
    results = {}
    for name, kw in LADDER:
        f, ms, sigs = prep(kw["rs_min"])
        p = Params(use_filter=True, **kw)
        r, g = simulate(pn, f, sigs, ms, p, START), simulate(pn, f, sigs, ms, replace(p, costs=False), START)
        results[name] = r
        say(row(name, r, g))
        all_trades += [dict(t, run=name) for t in r.trades]

    say("\n[2] 변형 (L1~L4 각각: K=1.5 / 추격 5% / 둘 다)")
    say(hdr)
    for name, kw in LADDER[1:5]:
        f, ms, sigs = prep(kw["rs_min"])
        for v in VARIANTS:
            p = Params(use_filter=True, **{**kw, **v})
            r, g = simulate(pn, f, sigs, ms, p, START), simulate(pn, f, sigs, ms, replace(p, costs=False), START)
            vn = f"{name} {v}"
            say(row(vn, r, g))
            all_trades += [dict(t, run=vn) for t in r.trades]

    say("\n[3] 통과 판정 (사다리, 전체 기간, 비용 후)")
    for name, r in results.items():
        say(f"{name}: " + verdict(stats(r.trades, r.equity)))

    say("\n[4] 기간 분할 (사다리, 비용 후): 거래 | 승률 | 기댓값% | 기댓값R | CAGR | MDD")
    for name, r in results.items():
        for pn_, (a, b) in PERIODS.items():
            s = sub(r, a, b)
            say(f"{name} {pn_}: {s['n']} | {pct(s.get('win'))} | {pct(s.get('exp'), 2)} | {s.get('exp_R', 0):.3f} | {pct(s['cagr'])} | {pct(s['mdd'])}")

    say("\n[5] 연도별 수익률 (사다리, 비용 후)")
    for name, r in results.items():
        rows = []
        for y in range(2015, 2027):
            prev = r.equity.loc[:f"{y - 1}-12-31"]
            cur = r.equity.loc[str(y)]
            if cur.empty:
                continue
            rows.append(f"{y} {pct(cur.iloc[-1] / (prev.iloc[-1] if len(prev) else r.equity.iloc[0]) - 1)}")
            # noqa
        say(f"{name}: " + "; ".join(rows))

    say(f"\n주: 장중 진입은 '고가>피봇인 날 max(시가,피봇)에 체결'로 근사(분봉 없음). 거래량 K는 하루 거래량 기준(책의 '개장 2시간 50%'를 하루 100%로 번역).")
    say("주: 익절 절반은 거래 2행으로 집계(frac 열). 쿨다운은 장중 모드에서 '전날 손절이면 오늘 신규 없음'. 실적 거름(DART)·피라미딩·3C·플랫은 아직 없음.")
    say(f"\n실행 {time.time() - t0:.0f}초")
    od = data.CACHE / "out"
    od.mkdir(exist_ok=True)
    (od / "report_v2.txt").write_text("\n".join(out), encoding="utf-8")
    pd.DataFrame(all_trades).to_csv(od / "trades_v2.csv", index=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
