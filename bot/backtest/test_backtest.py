"""py -m pytest -q bot/backtest — 네트워크 없이 합성 데이터로 룩어헤드·갭 손절·추격 금지 확인."""
import numpy as np
import pandas as pd

from bot.backtest import engine as E


def path(*legs):
    xs = [legs[0]]
    for target, n in zip(legs[1::2], legs[2::2]):
        xs += list(np.linspace(xs[-1], target, n + 1)[1:])
    return np.array(xs)


def vcp_series():
    return path(50, 100, 200, 80, 15, 96, 15, 86.4, 10, 95, 10, 90.25, 8, 93, 6)   # 20% → 10% → 5% 수축


def test_vcp_pivot_found_and_fixed_at_t_minus_1():
    c = vcp_series()
    days = pd.bdate_range("2020-01-01", periods=len(c))
    p = E.Params()
    pv = E.vcp_pivot(c[-252:], c[-252:], days[-252:], p)
    assert pv is not None and abs(pv - 95) < 1e-6
    # t일에 큰 돌파 봉이 와도 t-1까지 창으로 구한 피봇은 같다
    c2 = np.append(c, 120.0)
    assert E.vcp_pivot(c2[-253:-1], c2[-253:-1], days[-252:], p) == pv
    assert E.vcp_pivot(c[-252:], c[-252:], days[-252:], E.Params(shrink=0.4)) is None   # 수축비 0.5 > 0.4


def panel(o, h, lo, c, v=None):
    days = pd.bdate_range("2021-01-01", periods=len(c))
    f = lambda x: pd.DataFrame({"000010": np.asarray(x, float)}, index=days)  # noqa: E731
    pn = {"open": f(o), "high": f(h), "low": f(lo), "close": f(c), "volume": f(v if v is not None else [1000] * len(c))}
    pn["halt"] = pn["volume"] <= 0
    return pn, days


def test_signals_use_window_ending_t_minus_1(monkeypatch):
    n = 300
    c = np.linspace(50, 100, n)
    pn, days = panel(c, c, c, c, [1000] * (n - 1) + [5000])
    f = {"elig": pn["close"] > 0, "vavg50": pn["volume"].rolling(50).mean().shift(1), "rs": pn["close"] * 0 + 90, "ma50": pn["close"]}
    ms = pd.DataFrame({"KS11_close": c}, index=days)
    seen = []

    def fake(h, lo, d, p):
        seen.append((d[-1], h[-1]))
        return h[-1]
    monkeypatch.setattr(E, "vcp_pivot", fake)
    s = E.signals(pn, f, {"000010": "KS11"}, ms, E.Params(), 1.25, days[0])
    assert seen and seen[-1][0] == days[-2] and seen[-1][1] == c[-2]
    assert list(s["t"]) == [n - 1]


def sim(o, h, lo, c, pivot=100.0):
    pn, days = panel(o, h, lo, c)
    f = {"ma20": pn["close"] * 0}
    ms = pd.DataFrame({"state": ["trade"] * len(c)}, index=days)
    sigs = pd.DataFrame([(1, 0, pivot, 3.0, 90)], columns=["t", "j", "pivot", "vr", "rs"])
    return E.simulate(pn, f, sigs, ms, E.Params(costs=False), days[1])


def test_gap_down_stop_fills_at_open():
    # t=1 신호 → t=2 시가 101 체결, 종가 102로 손절 95.88 → t=3 시가 90 갭하락 → 손절가가 아니라 시가 90 체결
    r = sim([100, 100, 101, 90, 90], [101, 101, 103, 91, 91], [99, 99, 100, 88, 88], [100, 101, 102, 89, 89])
    assert len(r.trades) == 1
    t = r.trades[0]
    assert t["why"] == "손절" and t["entry_px"] == 101 and t["exit_px"] == 90


def test_intraday_stop_fills_at_stop_price():
    r = sim([100, 100, 101, 100, 100], [101, 101, 103, 101, 101], [99, 99, 100, 94, 94], [100, 101, 102, 95, 95])
    assert r.trades[0]["exit_px"] == 102 * 0.94   # 진입일 종가로 갱신된 손절선(T-A)


def test_chase_and_gap_down_cancelled():
    r = sim([100, 100, 103.5, 104, 104], [101, 101, 105, 105, 105], [99, 99, 103, 103, 103], [100, 101, 104, 104, 104])
    assert not r.trades and r.unfilled["추격금지"] == 1
    r = sim([100, 100, 99, 99, 99], [101, 101, 100, 100, 100], [99, 99, 98, 98, 98], [100, 101, 99, 99, 99])
    assert not r.trades and r.unfilled["갭다운"] == 1
