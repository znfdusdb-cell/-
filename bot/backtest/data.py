"""백테스트 데이터: 상폐 포함 일봉 + 코스피·코스닥 지수. 조회만, 주문 없음. 캐시는 레포 밖 로컬 파일(~/.swingbot_bt).

소스 (2026-11-02 확인)
- pykrx KRX 소스는 KRX_ID/KRX_PW 로그인을 요구해 막힘 → FinanceDataReader(FDR)로 대체.
- 종목 목록 = FDR StockListing('KRX')(오늘 상장) + StockListing('KRX-DELISTING')(2013-06 이후 상폐 보통주).
  날짜별 상장 목록이 아니라 '그 날짜에 일봉이 있는 종목'을 그날의 유니버스로 쓴다.
- 일봉 = 네이버 siseJson(수정주가, 상폐 종목도 나옴). FDR 네이버 리더는 최근 3000봉만 줘서 직접 호출.
  가격은 수정주가인데 거래량은 비수정 → 거래정지 구간 앞뒤 거래량 중앙값이 4배 이상 차이 나면 분할로 보고 앞 거래량을 보정(근사).
- 지수 = FDR KS11·KQ11. VKOSPI 는 FDR 에서 못 받음(야후 404, KRX 로그인).
필요 패키지: pandas, finance-datareader, requests (VPS 봇과 별개. 데스크톱 전용)
"""
from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import requests

START, END = "2013-06-01", "2026-10-30"
CACHE = Path(os.environ.get("SWINGBOT_BT_CACHE", Path.home() / ".swingbot_bt"))   # 레포 밖. 시세는 레포에 커밋하지 않는다
UA = {"User-Agent": "Mozilla/5.0"}


def universe() -> pd.DataFrame:
    import FinanceDataReader as fdr
    f = CACHE / "universe.csv"
    if f.exists():
        return pd.read_csv(f, dtype={"code": str})
    cur = fdr.StockListing("KRX")
    cur = cur[cur["Market"].isin(["KOSPI", "KOSDAQ", "KOSDAQ GLOBAL"])]
    a = pd.DataFrame({"code": cur["Code"], "name": cur["Name"], "market": cur["Market"].str.replace(" GLOBAL", ""), "delisted": None})
    d = fdr.StockListing("KRX-DELISTING")
    d["DelistingDate"] = pd.to_datetime(d["DelistingDate"], errors="coerce")
    d = d[(d["SecuGroup"] == "주권") & (d["Kind"] == "보통주") & d["Market"].isin(["KOSPI", "KOSDAQ"]) & (d["DelistingDate"] >= START)]
    b = pd.DataFrame({"code": d["Symbol"], "name": d["Name"], "market": d["Market"], "delisted": d["DelistingDate"].dt.strftime("%Y-%m-%d")})
    u = pd.concat([a, b]).drop_duplicates("code")
    u = u[u["code"].str.fullmatch(r"\d{5}0") & ~u["name"].str.contains("스팩")]   # 보통주만(우선주·스팩 제외)
    CACHE.mkdir(parents=True, exist_ok=True)
    u.to_csv(f, index=False)
    return u


def _naver(code: str) -> pd.DataFrame:
    url = f"https://api.finance.naver.com/siseJson.naver?symbol={code}&requestType=1&startTime={START.replace('-', '')}&endTime={END.replace('-', '')}&timeframe=day"
    txt = requests.get(url, headers=UA, timeout=30).text
    rows = [json.loads(r) for r in re.findall(r'\["\d{8}"[^\]]*\]', txt)]
    df = pd.DataFrame([r[:6] for r in rows], columns=["date", "open", "high", "low", "close", "volume"])
    df["date"] = pd.to_datetime(df["date"])
    return df


def adjust_volume(df: pd.DataFrame) -> pd.DataFrame:
    """거래정지(시가 0·거래량 0) 구간 끝에서 앞뒤 20일 거래량 중앙값 비가 4배 이상(또는 1/4 이하)이면 앞 구간 거래량에 그 비를 곱한다.
    거래가 없어 거래량만 0인 날(시가 있음)은 보지 않는다. 앞뒤 20일 모두 거래가 15일 이상일 때만."""
    v = df["volume"].astype(float).to_numpy().copy()
    for i in np.flatnonzero((df["open"].to_numpy() <= 0) & (v == 0)):
        if i + 1 < len(v) and v[i + 1] > 0 and i >= 20:
            pre, post = v[max(0, i - 20):i], v[i + 1:i + 21]
            if (pre > 0).sum() < 15 or (post > 0).sum() < 15:
                continue
            pre, post = np.median(pre[pre > 0]), np.median(post[post > 0])
            if not 0.25 < post / pre < 4:
                v[:i] *= post / pre
    df["volume"] = v
    return df


def candles(codes: list[str], workers: int = 6) -> dict[str, pd.DataFrame]:
    d = CACHE / "daily"
    d.mkdir(parents=True, exist_ok=True)

    def one(code):
        f = d / f"{code}.csv"
        if f.exists():
            return code, adjust_volume(pd.read_csv(f, parse_dates=["date"]))
        try:
            df = _naver(code)
        except Exception as e:  # noqa: BLE001
            print("  일봉 실패", code, e)
            return code, None
        df.to_csv(f, index=False)
        return code, adjust_volume(df)

    out = {}
    with ThreadPoolExecutor(workers) as ex:
        for i, (c, df) in enumerate(ex.map(one, codes)):
            if df is not None and len(df):
                out[c] = df
            if i and i % 500 == 0:
                print(f"  일봉 {i}/{len(codes)}")
    return out


def index(sym: str) -> pd.DataFrame:
    import FinanceDataReader as fdr
    f = CACHE / f"idx_{sym}.csv"
    if not f.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        fdr.DataReader(sym, START, END)[["Open", "High", "Low", "Close"]].rename(columns=str.lower).rename_axis("date").to_csv(f)
    return pd.read_csv(f, parse_dates=["date"]).set_index("date")


def integrity(data: dict[str, pd.DataFrame], days: pd.DatetimeIndex) -> dict:
    """결측 거래일(상장 기간 안), 거래량 0일, ±30% 초과(가격제한폭 밖) 종가 점프 목록."""
    miss, zero, jumps = {}, {}, []
    for c, df in data.items():
        life = days[(days >= df["date"].iloc[0]) & (days <= df["date"].iloc[-1])]
        m = len(life) - df["date"].isin(life).sum()
        if m:
            miss[c] = int(m)
        z = int((df["volume"] == 0).sum())
        if z:
            zero[c] = z
        r = df["close"].pct_change()
        for i in np.flatnonzero((r.abs() > 0.305).to_numpy()):   # 가격제한폭 30% 초과만
            jumps.append((c, df["date"].iloc[i].strftime("%Y-%m-%d"), round(float(r.iloc[i]) * 100, 1)))
    return {"stocks": len(data), "missing_days": miss, "zero_volume_days": zero, "jumps_30pct": jumps}


def panel(data: dict[str, pd.DataFrame], days: pd.DatetimeIndex) -> dict[str, pd.DataFrame]:
    """날짜×종목 넓은 표. 거래정지일(시가 0)은 시가·고가·저가를 종가로 채우고 거래량 0."""
    out = {}
    for k in ("open", "high", "low", "close", "volume"):
        out[k] = pd.DataFrame({c: df.set_index("date")[k] for c, df in data.items()}).reindex(days).astype(float)
    life = out["close"].ffill().notna() & out["close"].bfill().notna()     # 상장 기간 안의 결측일 = 거래정지로 취급
    out["close"] = out["close"].ffill().where(life)
    out["volume"] = out["volume"].where(~(life & out["volume"].isna()), 0.0)
    out["open"] = out["open"].where(~(life & out["open"].isna()), 0.0)
    halt = (out["open"] <= 0) | (out["volume"] <= 0)
    for k in ("open", "high", "low"):
        out[k] = out[k].mask(halt, out["close"])
    out["volume"] = out["volume"].mask(halt, 0.0)
    out["halt"] = halt & out["close"].notna()
    return out
