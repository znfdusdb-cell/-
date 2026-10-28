"""DART(금감원 공시) 분기 실적. 같은 보고서끼리 1년 전과 비교(같은 기준끼리라 누적·3개월 차이가 상쇄된다).

reprt_code: 11013 1분기, 11012 반기, 11014 3분기, 11011 사업보고서
다중회사 주요계정 API는 한 번에 100개 회사까지.
"""
from __future__ import annotations

import io
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

BASE = "https://opendart.fss.or.kr/api"
ORDER = ["11014", "11012", "11013"]          # 같은 해 안에서 최신 순
REPRT_NAME = {"11013": "1분기", "11012": "반기", "11014": "3분기", "11011": "사업"}


def _get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def corp_codes(key: str, http=None) -> dict:
    """종목코드 → DART 고유번호"""
    raw = (http or _get)(f"{BASE}/corpCode.xml?crtfc_key={urllib.parse.quote(key)}")
    z = zipfile.ZipFile(io.BytesIO(raw))
    root = ET.fromstring(z.read(z.namelist()[0]))
    out = {}
    for it in root.iter("list"):
        sc = (it.findtext("stock_code") or "").strip()
        if sc:
            out[sc] = it.findtext("corp_code").strip()
    return out


def _num(s) -> float | None:
    s = (s or "").replace(",", "").strip()
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def multi(key: str, corp_list: list[str], year: int, reprt: str, http=None, pause: float = 0.15) -> dict:
    """{corp_code: {'rev': x, 'op': y}} (연결 우선, 없으면 별도)"""
    out: dict[str, dict] = {}
    for i in range(0, len(corp_list), 100):
        q = urllib.parse.urlencode({"crtfc_key": key, "corp_code": ",".join(corp_list[i:i + 100]), "bsns_year": str(year), "reprt_code": reprt})
        j = json.loads((http or _get)(f"{BASE}/fnlttMultiAcnt.json?{q}").decode("utf-8"))
        time.sleep(pause)
        if j.get("status") == "013":      # 데이터 없음
            continue
        if j.get("status") != "000":
            raise RuntimeError(f"DART {j.get('status')} {j.get('message')}")
        for r in j.get("list", []):
            cc, nm, fs = r.get("corp_code"), (r.get("account_nm") or "").replace(" ", ""), r.get("fs_div")
            kind = "op" if nm.startswith("영업이익") else "rev" if ("매출액" in nm or nm in ("영업수익", "수익(매출액)")) else None
            v = _num(r.get("thstrm_amount"))
            if not kind or v is None:
                continue
            d = out.setdefault(cc, {})
            if fs == "CFS" or (kind + "_fs") not in d:
                d[kind], d[kind + "_fs"] = v, fs
    return out


def yoy(cur: float | None, prev: float | None) -> float | None:
    if cur is None or prev is None:
        return None
    if prev <= 0:
        return 999.0 if cur > 0 else None    # 흑자 전환은 통과로 본다(999로 표시)
    return (cur - prev) / prev * 100


def growth(periods: list[tuple[int, str]], data: dict, corp: str) -> list[dict]:
    """최신 기간부터 [{period, op_yoy, rev_yoy}] — 1년 전 같은 보고서와 비교"""
    out = []
    for y, rp in periods:
        cur, prev = data.get((y, rp), {}).get(corp), data.get((y - 1, rp), {}).get(corp)
        if not cur or not prev:
            continue
        out.append({"period": f"{y} {REPRT_NAME[rp]}", "op_yoy": yoy(cur.get("op"), prev.get("op")), "rev_yoy": yoy(cur.get("rev"), prev.get("rev")),
                    "op": cur.get("op"), "rev": cur.get("rev")})
    return out
