"""시장 변수(일감 C, 2026-11-05 지시서). 시장별로 다른 것만 여기: 거래일 달력·데이터 로더·통화·시장 지수(+비용은 costs.py).
규칙 숫자(손절 -6%, RR 2:1, K, 20일선 N일, RS70)는 여기 두지 않는다 — engine.Params 하나를 모든 시장이 같이 쓴다.

통화 단위 값(자본·최소가·최소 거래대금)은 같은 기준을 그 시장 통화로 적은 것이다.
US 값은 원화 기준(1,000원·10억원)을 1달러 ≈ 1,400원으로 어림해 둥글린 임시값 — 팀장 확인 대상.
상한가(가격제한폭) 체결 불가 검사는 KR 만 있다(US 는 제한폭 없음).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

SPEC = {
    "KR": dict(currency="KRW", capital=1e8, min_price=1000, min_turnover=1e9, limit_up=0.295,
               indices=("KS11", "KQ11"), calendar="KS11", survivorship_bias=False),   # 상폐 포함(data.py)
    "US": dict(currency="USD", capital=7e4, min_price=1.0, min_turnover=7e5, limit_up=None,
               indices=("SPX", "IXIC"), calendar="SPX", survivorship_bias=True),       # 일감 B 전까지 '편향 있음'으로 둔다
}


def load(market: str, dummy: bool = False) -> dict:
    """{pn, idx, days, mkt_of, n_listed, delisted, note}. 시장마다 로더만 다르고 돌려주는 모양은 같다."""
    if dummy:
        return dummy_data(market)
    if market == "KR":
        return _load_kr()
    if market == "US":
        return _load_us()
    raise ValueError(market)


def _load_kr() -> dict:
    from . import data
    u = data.universe()
    idx = {k: data.index(k) for k in SPEC["KR"]["indices"]}
    days = idx[SPEC["KR"]["calendar"]].index
    pn = data.panel(data.candles(list(u["code"])), days)
    mkt_of = dict(zip(u["code"], u["market"].map({"KOSPI": "KS11", "KOSDAQ": "KQ11"}).fillna("KQ11")))
    return dict(pn=pn, idx=idx, days=days, mkt_of=mkt_of, n_listed=len(u), delisted=int(u["delisted"].notna().sum()), note="")


def _load_us() -> dict:
    """일감 B 산출물 자리: CACHE/us/universe.csv(code, exchange, delisted), us/daily/<code>.csv, us/idx_SPX.csv, us/idx_IXIC.csv.
    모양은 KR 캐시와 같다(date, open, high, low, close, volume). 없으면 멈추고 --dummy 를 안내한다."""
    from . import data
    root = data.CACHE / "us"
    if not (root / "universe.csv").exists():
        raise FileNotFoundError(f"{root}/universe.csv 없음 — 일감 B(미국 데이터) 전. --dummy 로 실행만 확인할 수 있다")
    u = pd.read_csv(root / "universe.csv", dtype={"code": str})
    idx = {k: pd.read_csv(root / f"idx_{k}.csv", parse_dates=["date"]).set_index("date") for k in SPEC["US"]["indices"]}
    days = idx[SPEC["US"]["calendar"]].index
    dd = {}
    for c in u["code"]:
        f = root / "daily" / f"{c}.csv"
        if f.exists():
            dd[c] = pd.read_csv(f, parse_dates=["date"])
    pn = data.panel(dd, days)
    mkt_of = {c: ("IXIC" if ex == "NASDAQ" else "SPX") for c, ex in zip(u["code"], u.get("exchange", pd.Series(["NYSE"] * len(u))))}
    return dict(pn=pn, idx=idx, days=days, mkt_of=mkt_of, n_listed=len(u), delisted=int(u.get("delisted", pd.Series(dtype=object)).notna().sum()), note="")


def dummy_data(market: str, n: int = 40, seed: int = 7, start: str = "2013-06-03", end: str = "2026-10-30") -> dict:
    """합성 데이터(실행 확인 전용, 결과 숫자는 의미 없음). 종목마다 추세 구간이 섞인 무작위 보행."""
    rng = np.random.default_rng(seed)
    sp = SPEC[market]
    days = pd.bdate_range(start, end)
    T = len(days)
    pn = {k: {} for k in ("open", "high", "low", "close", "volume")}
    for i in range(n):
        drift = rng.choice([0.0, 0.0008, 0.0015], p=[0.4, 0.4, 0.2])
        r = rng.normal(drift, 0.02, T)
        c = sp["min_price"] * 20 * np.exp(np.cumsum(r))
        o = c * np.exp(rng.normal(0, 0.005, T))
        h = np.maximum(o, c) * (1 + np.abs(rng.normal(0, 0.012, T)))
        lo = np.minimum(o, c) * (1 - np.abs(rng.normal(0, 0.012, T)))
        v = sp["min_turnover"] / c[0] * 3 * np.exp(rng.normal(0, 0.5, T))
        code = f"D{i:04d}"
        for k, x in zip(("open", "high", "low", "close", "volume"), (o, h, lo, c, v)):
            pn[k][code] = x
    pn = {k: pd.DataFrame(v, index=days) for k, v in pn.items()}
    pn["halt"] = pn["volume"] <= 0
    idx = {}
    for k in sp["indices"]:
        c = 1000 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, T)))
        idx[k] = pd.DataFrame({"open": c, "high": c, "low": c, "close": c}, index=days)
    codes = list(pn["close"].columns)
    mkt_of = {c: sp["indices"][i % len(sp["indices"])] for i, c in enumerate(codes)}
    return dict(pn=pn, idx=idx, days=days, mkt_of=mkt_of, n_listed=n, delisted=0, note="더미 데이터(실행 확인용, 숫자 의미 없음)")
