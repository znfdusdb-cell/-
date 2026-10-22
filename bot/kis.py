"""한국투자증권 Open API — 시세 조회 전용. 주문 함수는 이 파일에 없다(연습 모드 전까지 만들지 않는다).

- 접근 토큰: 24시간 유효, 발급은 1분 1회 제한 → 파일 캐시(600 권한), 만료 1시간 전 재발급
- 일봉: inquire-daily-itemchartprice (FHKST03010100), 1회 최대 100건, 수정주가(FID_ORG_ADJ_PRC=0)
- 페이징: 받은 봉 중 가장 오래된 날 하루 전을 다음 종료일로. 빈 응답이면 멈춘다(무한 루프 방지)
- 유량: 실전 초당 20건 → 여유 있게 초당 약 12건
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

from .config import HOME

REAL = "https://openapi.koreainvestment.com:9443"
TOKEN_FILE = HOME / "kis_token.json"
MIN_INTERVAL = 0.085


class KisError(RuntimeError):
    pass


class Kis:
    def __init__(self, app_key: str, app_secret: str, base: str = REAL, http=None):
        self.key, self.secret, self.base = app_key, app_secret, base
        self._http = http or _http_json
        self._last = 0.0
        self._token = None

    # ---------- 토큰 ----------
    def token(self) -> str:
        if self._token:
            return self._token
        if TOKEN_FILE.exists():
            try:
                c = json.loads(TOKEN_FILE.read_text())
                if c.get("app_key_tail") == self.key[-6:] and datetime.fromisoformat(c["expires"]) - timedelta(hours=1) > datetime.now():
                    self._token = c["token"]
                    return self._token
            except Exception:
                pass
        res = self._http("POST", self.base + "/oauth2/tokenP", {"content-type": "application/json"},
                         {"grant_type": "client_credentials", "appkey": self.key, "appsecret": self.secret})
        tok = res.get("access_token")
        if not tok:
            raise KisError(f"토큰 발급 실패: {res.get('error_description') or res.get('msg1') or res}")
        exp = res.get("access_token_token_expired") or (datetime.now() + timedelta(seconds=int(res.get("expires_in", 86400)))).strftime("%Y-%m-%d %H:%M:%S")
        HOME.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(json.dumps({"token": tok, "expires": exp.replace(" ", "T"), "app_key_tail": self.key[-6:]}))
        TOKEN_FILE.chmod(0o600)
        self._token = tok
        return tok

    def _get(self, path: str, tr_id: str, params: dict) -> dict:
        wait = MIN_INTERVAL - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        headers = {"content-type": "application/json; charset=utf-8", "authorization": f"Bearer {self.token()}",
                   "appkey": self.key, "appsecret": self.secret, "tr_id": tr_id, "custtype": "P"}
        for attempt in range(4):
            self._last = time.time()
            res = self._http("GET", self.base + path + "?" + urllib.parse.urlencode(params), headers, None)
            if res.get("rt_cd") == "0":
                return res
            if res.get("msg_cd") == "EGW00201" and attempt < 3:  # 초당 거래건수 초과 → 잠깐 쉬고 다시
                time.sleep(1.0 + attempt)
                continue
            raise KisError(f"{tr_id} {params.get('FID_INPUT_ISCD', '')}: {res.get('msg_cd')} {res.get('msg1')}")
        raise KisError("재시도 초과")

    # ---------- 일봉 ----------
    def daily_page(self, code: str, start: date, end: date) -> tuple[str | None, list[dict]]:
        res = self._get("/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice", "FHKST03010100", {
            "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code,
            "FID_INPUT_DATE_1": start.strftime("%Y%m%d"), "FID_INPUT_DATE_2": end.strftime("%Y%m%d"),
            "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0",
        })
        name = (res.get("output1") or {}).get("hts_kor_isnm")
        return name, parse_candles(code, res.get("output2") or [])

    def daily(self, code: str, start: date, end: date) -> tuple[str | None, list[dict]]:
        """start~end 일봉 전부 (날짜 오름차순, 중복 제거)."""
        seen: dict[str, dict] = {}
        name = None
        cur_end = end
        for _ in range(60):  # 안전장치: 60페이지 = 약 24년
            if cur_end < start:
                break
            nm, rows = self.daily_page(code, start, cur_end)
            name = name or nm
            new = [r for r in rows if r["date"] not in seen]
            if not new:
                break
            for r in new:
                seen[r["date"]] = r
            oldest = min(r["date"] for r in new)
            cur_end = date.fromisoformat(oldest) - timedelta(days=1)
        return name, [seen[k] for k in sorted(seen)]


def parse_candles(code: str, rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        d = (r.get("stck_bsop_date") or "").strip()
        if len(d) != 8:
            continue
        o, h, l, c = (int(float(r.get(k) or 0)) for k in ("stck_oprc", "stck_hgpr", "stck_lwpr", "stck_clpr"))
        if c <= 0:
            continue
        out.append({"code": code, "date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "open": o or c, "high": h or c, "low": l or c,
                    "close": c, "volume": int(float(r.get("acml_vol") or 0)), "source": "kis"})
    return out


def _http_json(method: str, url: str, headers: dict, body):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            raise KisError(f"HTTP {e.code} {url.split('?')[0]}") from None
