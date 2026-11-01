"""py -m bot.backtest.run → 격자 8벌(K 4개 x 시장필터 ON/OFF) 실행, 결과는 ~/.swingbot_bt/out/report.txt (레포 밖)."""
from __future__ import annotations

import sys
import time
from dataclasses import replace

import pandas as pd

from . import data
from .engine import Params, features, market_state, mdd, signals, simulate, stats

KS = (1.25, 1.5, 2.0, 3.0)
START = "2015-01-02"
PERIODS = {"학습 2015~2020": ("2015-01-01", "2020-12-31"), "검증 2021~2025": ("2021-01-01", "2025-12-31"), "2026(봉인)": ("2026-01-01", "2026-12-31")}


def pct(x, d=1):
    return "-" if x is None or pd.isna(x) else f"{x * 100:.{d}f}%"


def sub(res, a, b):
    eq, ex = res.equity[a:b], res.exposure[a:b]
    tr = [t for t in res.trades if pd.Timestamp(a) <= t["entry"] <= pd.Timestamp(b)]
    return stats(tr, eq, ex)


def verdict(s):
    e, m, c = s.get("exp", 0) > 0, s["mdd"] >= -0.15, 0.20 <= s["cagr"] <= 0.30
    return f"기댓값>0 {'O' if e else 'X'}, MDD<=15% {'O' if m else 'X'}, 연 20~30% {'O' if c else 'X'}({pct(s['cagr'])}) → {'통과' if e and m and c else '탈락'}"


def main(argv=None) -> int:
    t0 = time.time()
    out = []
    say = lambda *a: (print(*a), out.append(" ".join(str(x) for x in a)))  # noqa: E731
    u = data.universe()
    idx = {k: data.index(k) for k in ("KS11", "KQ11")}
    days = idx["KS11"].index
    dd = data.candles(list(u["code"]))
    integ = data.integrity(dd, days)
    say(f"[데이터] 종목 {integ['stocks']}개(목록 {len(u)}, 상폐 {u['delisted'].notna().sum()}), 거래일 {len(days)} ({days[0]:%Y-%m-%d}~{days[-1]:%Y-%m-%d})")
    say(f"[무결성] 결측일 있는 종목 {len(integ['missing_days'])}개 / 결측일 합 {sum(integ['missing_days'].values())}")
    say(f"[무결성] 거래량 0일 있는 종목 {len(integ['zero_volume_days'])}개 / 합 {sum(integ['zero_volume_days'].values())}")
    say(f"[무결성] ±30% 초과 종가 점프 {len(integ['jumps_30pct'])}건. 앞 40건: " + ", ".join(f"{c} {d} {r:+}%" for c, d, r in integ["jumps_30pct"][:40]))
    pn = data.panel(dd, days)
    mkt_of = dict(zip(u["code"], u["market"].map({"KOSPI": "KS11", "KOSDAQ": "KQ11"}).fillna("KQ11")))
    p = Params()
    f = features(pn, p)
    ms = market_state(idx, days, p.slope_min)
    sigs = signals(pn, f, mkt_of, ms, p, min(KS), START)
    say(f"[신호] 후보(K>=1.25) {len(sigs)}건, 계산 {time.time() - t0:.0f}초")
    st = ms.loc[START:, "state"].value_counts()
    say("[시장필터 일수 2015~] " + ", ".join(f"{k} {v}일" for k, v in st.items()) + " (VKOSPI 미반영, 레버리지 ETF 항목 없음)")

    runs = {}
    for K in KS:
        for flt in (True, False):
            pp = replace(p, K=K, use_filter=flt)
            runs[(K, flt)] = (simulate(pn, f, sigs, ms, pp, START), simulate(pn, f, sigs, ms, replace(pp, costs=False), START))
    say("\n[1] 전체 2015-01-02~2026-10-30 (비용 후. 괄호 = 비용 전)")
    say("K | 필터 | 거래 | 승률 | 평균이익 | 평균손실 | 손익비 | 기댓값% | 기댓값R | 최대연속손절 | 평균보유일 | CAGR | MDD | MDD기간 | 노출도")
    for (K, flt), (r, g) in runs.items():
        s, sg = stats(r.trades, r.equity, r.exposure), stats(g.trades, g.equity, g.exposure)
        say(f"{K} | {'ON' if flt else 'OFF'} | {s['n']} | {pct(s.get('win'))} | {pct(s.get('avg_win'), 2)} | {pct(s.get('avg_loss'), 2)} | {s.get('payoff', 0):.2f} | "
            f"{pct(s.get('exp'), 2)} ({pct(sg.get('exp'), 2)}) | {s.get('exp_R', 0):.3f} ({sg.get('exp_R', 0):.3f}) | {s.get('max_stop_run', 0)} | {s.get('hold', 0):.1f} | "
            f"{pct(s['cagr'])} ({pct(sg['cagr'])}) | {pct(s['mdd'])} ({pct(sg['mdd'])}) | {s['mdd_period']} | {pct(s['exposure'])}")
    say("\n[2] 통과 판정(전체 기간, 비용 후)")
    for (K, flt), (r, _) in runs.items():
        say(f"K={K} 필터 {'ON' if flt else 'OFF'}: " + verdict(stats(r.trades, r.equity)))
    say("\n[3] 기간 분할 (비용 후): 거래 | 승률 | 기댓값% | 기댓값R | CAGR | MDD")
    for (K, flt), (r, _) in runs.items():
        for name, (a, b) in PERIODS.items():
            s = sub(r, a, b)
            say(f"K={K} {'ON' if flt else 'OFF'} {name}: {s['n']} | {pct(s.get('win'))} | {pct(s.get('exp'), 2)} | {s.get('exp_R', 0):.3f} | {pct(s['cagr'])} | {pct(s['mdd'])}")
    say("\n[4] 연도별 (비용 후): 연도 연수익률 / MDD / 거래 / 승률 / 기댓값%")
    for (K, flt), (r, _) in runs.items():
        rows = []
        for y in range(2015, 2027):
            s = sub(r, f"{y}-01-01", f"{y}-12-31")
            prev = r.equity.loc[:f"{y - 1}-12-31"]
            ret = r.equity.loc[str(y)].iloc[-1] / (prev.iloc[-1] if len(prev) else p.capital) - 1
            rows.append(f"{y} {pct(ret)}/{pct(s['mdd'])}/{s['n']}/{pct(s.get('win'), 0)}/{pct(s.get('exp'), 2)}")
        say(f"K={K} {'ON' if flt else 'OFF'}: " + "; ".join(rows))
    say("\n[5] 미체결 사유별 건수 (비용 후 실행)")
    for (K, flt), (r, _) in runs.items():
        say(f"K={K} {'ON' if flt else 'OFF'}: " + ", ".join(f"{k} {v}" for k, v in r.unfilled.most_common()))
    say("\n[6] 매수후보유 (지수, 비용·배당 없음): 구간 CAGR / MDD(기간)")
    for k, nm in (("KS11", "코스피"), ("KQ11", "코스닥")):
        for name, (a, b) in {"전체": (START, "2026-10-30"), **PERIODS}.items():
            c = idx[k]["close"][a:b]
            yrs = (c.index[-1] - c.index[0]).days / 365.25
            m = mdd(c)
            say(f"{nm} {name}: {pct((c.iloc[-1] / c.iloc[0]) ** (1 / yrs) - 1)} / {pct(m[0])} ({m[1]})")
    say("\n[7] 2026-07-13~08-21 일별 시장필터 (종가 / 200일선 / 200일선 21일 기울기 → 상태)")
    for d, x in ms.loc["2026-07-13":"2026-08-21"].iterrows():
        say(f"{d:%m-%d} 코스피 {x.KS11_close:,.0f}/{x.KS11_ma200:,.0f}/{x.KS11_slope * 100:+.2f}% 코스닥 {x.KQ11_close:,.0f}/{x.KQ11_ma200:,.0f}/{x.KQ11_slope * 100:+.2f}% → {x.state}")
    say(f"\n실행 {time.time() - t0:.0f}초")
    od = data.CACHE / "out"
    od.mkdir(exist_ok=True)
    (od / "report.txt").write_text("\n".join(out), encoding="utf-8")
    pd.DataFrame([dict(t, K=K, filter=flt) for (K, flt), (r, _) in runs.items() for t in r.trades]).to_csv(od / "trades.csv", index=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
