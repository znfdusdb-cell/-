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


def sim2(o, h, lo, c, t_sig, pivot=100.0, **kw):
    pn, days = panel(o, h, lo, c)
    f = {"ma20": pn["close"] * 0 + kw.pop("ma20", 0)}
    ms = pd.DataFrame({"state": ["trade"] * len(c)}, index=days)
    sigs = pd.DataFrame([(t_sig, 0, pivot, 3.0, 90, True)], columns=["t", "j", "pivot", "vr", "rs", "close_break"])
    return E.simulate(pn, f, sigs, ms, E.Params(costs=False, **kw), days[1])


def test_v2_intraday_fills_at_pivot_same_day():
    # t=2 시가 99(피봇 아래) 고가 104 → 장중 돌파, 피봇 100에 체결. v1(next_open)이면 t=3 시가에 체결
    o, h, lo, c = [100, 100, 99, 101, 101], [101, 101, 104, 102, 102], [99, 99, 98, 100, 100], [100, 100, 103, 101, 101]
    r = sim2(o, h, lo, c, 2, entry_mode="intraday", stop_mode="breakeven", ma20_days=3)
    assert not r.trades and r.exposure.iloc[1] > 0          # exposure 는 days[1] 부터 → iloc[1] = t=2
    r1 = sim2(o, h, lo, c, 2)   # v1: t=3 시가 101 체결
    assert r1.exposure.iloc[1] == 0 and r1.exposure.iloc[2] > 0


def test_v2_intraday_chase_blocked_when_open_above():
    r = sim2([100, 100, 104, 104, 104], [101, 101, 106, 105, 105], [99, 99, 103, 103, 103], [100, 100, 105, 104, 104], 2, entry_mode="intraday")
    assert r.unfilled["추격금지"] == 1 and not r.trades


def test_v2_breakeven_stop_not_trailing():
    # 체결 100(t=2) → t=3 종가 107(+1R) → 손절 본전 100 → t=4 저가 99 → 100에 손절 (trail94 였으면 107x0.94=100.58)
    o, h, lo, c = [100, 100, 99, 106, 101, 101], [101, 101, 104, 108, 102, 102], [99, 99, 98, 105, 99, 99], [100, 100, 103, 107, 100, 100]
    r = sim2(o, h, lo, c, 2, entry_mode="intraday", stop_mode="breakeven")
    assert r.trades and r.trades[0]["why"] == "손절" and abs(r.trades[0]["exit_px"] - 100) < 1e-9
    r = sim2(o, h, lo, c, 2, entry_mode="intraday", stop_mode="trail94")
    assert abs(r.trades[0]["exit_px"] - 107 * 0.94) < 1e-9


def test_v2_ma20_three_days():
    # ma20=200 (항상 아래). 1일 모드면 체결 다음날 청산, 3일 모드면 3일 연속 뒤 청산
    o = h = lo = c = [100, 100, 100, 100, 100, 100, 100, 100]
    r1 = sim2(o, [101] * 8, [99] * 8, c, 2, entry_mode="intraday", ma20=200, ma20_days=1)
    r3 = sim2(o, [101] * 8, [99] * 8, c, 2, entry_mode="intraday", ma20=200, ma20_days=3)
    assert r1.trades[0]["days"] == 1 and r3.trades[0]["days"] == 3


def test_v2_take_profit_half_at_2R():
    o, h, lo, c = [100, 100, 99, 105, 100, 100], [101, 101, 104, 113, 101, 101], [99, 99, 98, 104, 99.5, 99.5], [100, 100, 103, 112, 100, 100]
    r = sim2(o, h, lo, c, 2, entry_mode="intraday", stop_mode="breakeven", take_profit=True)
    whys = [t["why"] for t in r.trades]
    assert whys[0] == "익절(절반)" and abs(r.trades[0]["exit_px"] - 112) < 1e-9 and abs(r.trades[0]["frac"] - 0.5) < 0.01
    assert whys[1] == "손절" and abs(r.trades[1]["exit_px"] - 100) < 1e-9    # 나머지는 본전에서
