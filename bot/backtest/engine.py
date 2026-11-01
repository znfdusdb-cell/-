"""백테스트 엔진 v1 — 명세 swingbot_backtest_spec_v1 [1]~[6] 기본값. 시뮬레이션만, 주문 코드 없음.

신호(t일 종가): 종가_t > 피봇(t-1까지 데이터로 고정) AND 거래량_t >= K x 평균(거래량 t-50..t-1)
              AND t-1 자격(TT1~7, RS>=70, 유동성, 시장 대비 조정) AND 시장필터(t-1) != 관망 AND 쿨다운 아님
체결: t+1 시가. 피봇 <= 시가 <= 피봇 x 1.03 아니면 취소(추격 금지·갭다운)
청산: 손절 = 체결가 x 0.94, 장중 저가 발동, 갭이면 시가 체결. 갱신 = 종가 x 0.94 위로만(T-A)
      20일선 아래 종가 1일 → 다음날 시가 청산. 익절 없음(T0). 피라미딩 없음(P1)
크기: 종목 20%(축소 10%), 최대 5종목, RS 높은 순. 셋업은 VCP 만(수축비 0.7)
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..setups import zigzag


@dataclass
class Params:
    K: float = 1.5
    use_filter: bool = True
    costs: bool = True
    chase: float = 0.03
    stop: float = 0.06
    slot: float = 0.20
    max_pos: int = 5
    rs_min: int = 70
    min_price: float = 1000
    min_turnover: float = 1e9
    shrink: float = 0.7
    last_t_max: float = 10.0
    zz: float = 6.0
    slope_min: float = 0.0
    fee: float = 0.00015
    tax: float = 0.0025
    slip_buy: float = 0.001
    slip_sell: float = 0.001
    slip_stop: float = 0.002
    capital: float = 1e8


def vcp_pivot(high: np.ndarray, low: np.ndarray, dates, p: Params) -> float | None:
    """t-1까지의 최근 252봉(high, low)으로 VCP 피봇. 레포 setups.compute 의 베이스·T·피봇 정의 + 명세 3-2."""
    bi = int(np.argmax(high))
    weeks = round((dates[-1] - dates[bi]).days / 7)
    if not 3 <= weeks <= 65:
        return None
    base = [{"high": float(h), "low": float(lo)} for h, lo in zip(high[bi:], low[bi:])]
    pts = zigzag(base, p.zz)
    cons = [((a[2] - b[2]) / a[2] * 100, a) for a, b in zip(pts, pts[1:]) if a[0] == "H" and b[0] == "L"]
    pivot = None
    last_low = max((q[1] for q in pts if q[0] == "L"), default=None)
    if last_low is not None and last_low < len(base) - 1:
        right = [x["high"] for x in base[last_low:]]
        rh_i = last_low + int(np.argmax(right))
        rl = min(x["low"] for x in base[rh_i:])
        pull = (base[rh_i]["high"] - rl) / base[rh_i]["high"] * 100
        if rh_i < len(base) - 1 and pull >= 2 and (not cons or cons[-1][1][1] != rh_i):
            cons.append((pull, ("H", rh_i, base[rh_i]["high"])))
        pivot = base[rh_i]["high"]
    elif cons:
        pivot = cons[-1][1][2]
    sizes = [c[0] for c in cons]
    if not 2 <= len(sizes) <= 6 or sizes[-1] > p.last_t_max:
        return None
    if any(sizes[k] > p.shrink * sizes[k - 1] for k in range(1, len(sizes))):
        return None
    return pivot


def market_state(idx: dict[str, pd.DataFrame], days, slope_min=0.0) -> pd.DataFrame:
    """명세 [1] 2요소(VKOSPI·레버리지 ETF 없음): 둘 다 하락 = wait(관망), 하나 = reduce(축소), 아니면 trade."""
    out = {}
    for k, df in idx.items():
        c = df["close"].reindex(days).ffill()
        ma = c.rolling(200).mean()
        out[k + "_close"], out[k + "_ma200"], out[k + "_slope"] = c, ma, ma / ma.shift(21) - 1
        out[k + "_up"] = (c > ma) & (out[k + "_slope"] >= slope_min)
    s = pd.DataFrame(out, index=days)
    ups = s[[k + "_up" for k in idx]].sum(axis=1)
    s["state"] = np.where(ups == 0, "wait", np.where(ups < len(idx), "reduce", "trade"))
    return s


def features(pn: dict[str, pd.DataFrame], p: Params) -> dict[str, pd.DataFrame]:
    c, h, lo, v = pn["close"], pn["high"], pn["low"], pn["volume"]
    f = {k: c.rolling(n).mean() for k, n in (("ma20", 20), ("ma50", 50), ("ma150", 150), ("ma200", 200))}
    f["hi252"], f["lo252"] = h.rolling(252).max(), lo.rolling(252).min()
    raw = sum(w * (c / c.shift(n) - 1) for w, n in ((0.4, 63), (0.2, 126), (0.2, 189), (0.2, 252)))
    f["rs"] = (raw.rank(axis=1, pct=True) * 99).round().clip(1, 99)
    f["vavg50"] = v.rolling(50).mean().shift(1)
    turnover = (c * v).rolling(20).mean()
    tt = ((c > f["ma150"]) & (c > f["ma200"]) & (f["ma150"] > f["ma200"]) & (f["ma200"] > f["ma200"].shift(21))
          & (f["ma50"] > f["ma150"]) & (c > f["ma50"]) & (c >= f["lo252"] * 1.25) & (c >= f["hi252"] * 0.75))
    f["elig"] = tt & (f["rs"] >= p.rs_min) & (c >= p.min_price) & (turnover >= p.min_turnover) & (c > f["hi252"] * 0.4)
    return f


def signals(pn, f, mkt_of: dict[str, str], ms: pd.DataFrame, p: Params, k_min: float, start) -> pd.DataFrame:
    """K 와 무관한 후보 신호 전부(거래량비 >= k_min). 피봇은 t-1 까지로만 계산."""
    c, h, lo, v = (pn[k].to_numpy() for k in ("close", "high", "low", "volume"))
    days, cols = pn["close"].index, pn["close"].columns
    elig, vavg, rs = (f[k].to_numpy() for k in ("elig", "vavg50", "rs"))
    vr = np.where(vavg > 0, v / np.where(vavg > 0, vavg, 1), 0)
    out = []
    t0 = days.searchsorted(pd.Timestamp(start))
    for t in range(max(t0, 252), len(days)):
        for j in np.flatnonzero(elig[t - 1] & (vr[t] >= k_min) & (c[t] > c[t - 1])):
            w = slice(t - 252, t)
            pv = vcp_pivot(h[w, j], lo[w, j], days[w], p)
            if pv is None or not c[t, j] > pv:
                continue
            hi_i = t - 252 + int(np.nanargmax(h[w, j]))           # 2-4 시장 대비 조정 2배 이상 제외
            ic = ms[mkt_of[cols[j]] + "_close"].to_numpy()
            idd, sdd = ic[t - 1] / ic[hi_i] - 1, c[t - 1, j] / h[hi_i, j] - 1
            if idd < 0 and sdd / idd >= 2:
                continue
            out.append((t, j, pv, vr[t, j], rs[t - 1, j]))
    return pd.DataFrame(out, columns=["t", "j", "pivot", "vr", "rs"])


@dataclass
class Result:
    trades: list = field(default_factory=list)
    equity: pd.Series | None = None
    exposure: pd.Series | None = None
    unfilled: Counter = field(default_factory=Counter)


def simulate(pn, f, sigs: pd.DataFrame, ms: pd.DataFrame, p: Params, start, end=None) -> Result:
    o, h, lo, c = (pn[k].to_numpy() for k in ("open", "high", "low", "close"))
    halt, ma20 = pn["halt"].to_numpy(), f["ma20"].to_numpy()
    days, cols = pn["close"].index, pn["close"].columns
    state = ms["state"].to_numpy() if p.use_filter else np.full(len(days), "trade")
    fee, tax, sb, ss, sst = (p.fee, p.tax, p.slip_buy, p.slip_sell, p.slip_stop) if p.costs else (0, 0, 0, 0, 0)
    sigs = sigs[sigs["vr"] >= p.K]
    by_t = {t: g.sort_values("rs", ascending=False) for t, g in sigs.groupby("t")}
    t0 = days.searchsorted(pd.Timestamp(start))
    t1 = len(days) if end is None else days.searchsorted(pd.Timestamp(end), "right")
    cash, pos, res, eq, ex = p.capital, {}, Result(), [], []
    last_close, lastv = {}, pn["close"].notna().to_numpy()[::-1].argmax(axis=0)
    lastv = len(days) - 1 - lastv

    def sell(j, px, slip, d, why):
        nonlocal cash
        q = pos.pop(j)
        cash += q["sh"] * px * (1 - slip) * (1 - fee - tax)
        net = px * (1 - slip) * (1 - fee - tax) / (q["px"] * (1 + sb) * (1 + fee)) - 1
        res.trades.append({"code": cols[j], "entry": days[q["t"]], "exit": days[d], "entry_px": q["px"], "exit_px": px,
                           "gross": px / q["px"] - 1, "net": net, "R": net / p.stop, "days": d - q["t"], "why": why})

    pending = []
    for d in range(t0, t1):
        stopped = False
        for j in list(pos):                               # 상폐: 일봉이 끝나면 마지막 종가로 정리
            if d > lastv[j]:
                sell(j, last_close[j], ss, d, "상폐")
        for j in [j for j, q in pos.items() if q["exit"] and not halt[d, j]]:
            sell(j, o[d, j], ss, d, "20일선")
        prev_eq = eq[-1] if eq else p.capital
        for s in pending:
            j, pv = int(s.j), s.pivot
            why = None
            if j in pos:
                why = "보유중"
            elif halt[d, j] or np.isnan(o[d, j]):
                why = "거래정지"
            elif o[d, j] >= c[d - 1, j] * 1.295 and h[d, j] == lo[d, j]:
                why = "상한가"
            elif o[d, j] < pv:
                why = "갭다운"
            elif o[d, j] > pv * (1 + p.chase):
                why = "추격금지"
            elif len(pos) >= p.max_pos:
                why = "동시보유초과"
            if why:
                res.unfilled[why] += 1
                continue
            size = p.slot * prev_eq * (0.5 if state[d - 2] == "reduce" else 1)
            sh = math.floor(min(size, cash) / (o[d, j] * (1 + sb) * (1 + fee)))
            if sh <= 0:
                res.unfilled["현금부족"] += 1
                continue
            cash -= sh * o[d, j] * (1 + sb) * (1 + fee)
            pos[j] = {"t": d, "px": o[d, j], "sh": sh, "stop": o[d, j] * (1 - p.stop), "exit": False}
        for j in list(pos):                               # 장중 손절(진입일 포함), 갭은 시가 체결
            q = pos[j]
            if not halt[d, j] and lo[d, j] <= q["stop"]:
                sell(j, min(q["stop"], o[d, j]), sst, d, "손절")
                stopped = True
        for j, q in pos.items():                          # 종가 마감 후: 손절 갱신(T-A), 20일선 이탈 표시
            last_close[j] = c[d, j]
            q["stop"] = max(q["stop"], c[d, j] * (1 - p.stop))
            q["exit"] = q["exit"] or bool(c[d, j] < ma20[d, j])
        pending = []
        if d in by_t:
            g = by_t[d]
            if stopped:
                res.unfilled["쿨다운"] += len(g)
            elif state[d - 1] == "wait":
                res.unfilled["관망"] += len(g)
            else:
                pending = list(g.itertuples())
        val = sum(q["sh"] * last_close[j] for j, q in pos.items())
        eq.append(cash + val)
        ex.append(val / (cash + val))
    res.equity = pd.Series(eq, index=days[t0:t1])
    res.exposure = pd.Series(ex, index=days[t0:t1])
    return res


def mdd(eq: pd.Series) -> tuple[float, str]:
    if eq.empty:
        return 0.0, "-"
    dd = eq / eq.cummax() - 1
    tr = dd.idxmin()
    pk = eq[:tr].idxmax()
    rec = eq[tr:][eq[tr:] >= eq[pk]]
    return float(dd.min()), f"{pk:%Y-%m-%d}~{tr:%Y-%m-%d} 회복 {rec.index[0]:%Y-%m-%d}" if len(rec) else f"{pk:%Y-%m-%d}~{tr:%Y-%m-%d} 미회복"


def stats(trades: list, eq: pd.Series, ex: pd.Series | None = None) -> dict:
    t = pd.DataFrame(trades)
    n = len(t)
    yrs = max((eq.index[-1] - eq.index[0]).days / 365.25, 1e-9) if len(eq) > 1 else 1e-9
    m, per = mdd(eq)
    out = {"n": n, "cagr": (eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1 if len(eq) > 1 else 0, "mdd": m, "mdd_period": per,
           "exposure": float(ex.mean()) if ex is not None and len(ex) else None}
    if not n:
        return out
    w, lz = t[t["net"] > 0]["net"], t[t["net"] <= 0]["net"]
    run = best = 0
    for why, r in zip(t.sort_values("exit")["why"], t.sort_values("exit")["net"]):
        run = run + 1 if (why == "손절" and r <= 0) else 0
        best = max(best, run)
    out.update(win=len(w) / n, avg_win=w.mean() if len(w) else 0, avg_loss=lz.mean() if len(lz) else 0,
               exp=t["net"].mean(), exp_R=t["R"].mean(), exp_gross=t["gross"].mean(), max_stop_run=best, hold=t["days"].mean())
    out["payoff"] = out["avg_win"] / -out["avg_loss"] if out["avg_loss"] < 0 else float("inf")
    return out
