"""코스피·코스닥 종목 마스터 (한투 공개 파일). 보통주만 남긴다."""
from __future__ import annotations

import io
import urllib.request
import zipfile

URLS = {
    "KOSPI": ("https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip", 228),
    "KOSDAQ": ("https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip", 222),
}


def _split(text: str, tail: int, market: str) -> tuple[list[dict], dict]:
    out, groups = [], {}
    for line in text.splitlines():
        row = line.rstrip("\r\n")
        if len(row) <= tail:
            continue
        head, rest = row[: len(row) - tail], row[len(row) - tail:]
        code, name, group = head[0:9].strip(), head[21:].strip(), rest[0:2]
        groups[group] = groups.get(group, 0) + 1
        out.append({"code": code, "name": name, "group": group, "market": market})
    return out, groups


def parse(text: str, tail: int, market: str) -> tuple[list[dict], dict]:
    """뒤쪽 고정폭 길이는 문서상 코스피 228·코스닥 222지만, 공식 예제는 줄바꿈을 포함해 센 값이라
    줄바꿈을 뗀 실제 길이는 1 작을 수 있다(2026-11-05: 228로 잘라 그룹코드를 못 찾아 전 종목 0개).
    그래서 N-1, N, N+1 중 그룹코드 'ST'(주권)가 가장 많이 나오는 길이를 고른다."""
    best = None
    for t in (tail - 1, tail, tail + 1):
        rows, groups = _split(text, t, market)
        st = groups.get("ST", 0)
        if best is None or st > best[0]:
            best = (st, rows, {**groups, "_tail": t})
    return best[1], best[2]


def common_stock(s: dict) -> bool:
    c, n = s["code"], s["name"]
    if s["group"] != "ST" or len(c) != 6 or not c.isdigit():
        return False
    if c[-1] != "0":                    # 우선주(005935 등)
        return False
    if "스팩" in n or n.endswith("우") or "우B" in n or "리츠" in n:
        return False
    return True


def load(http=None) -> tuple[list[dict], dict]:
    allx, info = [], {}
    for market, (url, tail) in URLS.items():
        raw = (http or _get)(url)
        z = zipfile.ZipFile(io.BytesIO(raw))
        text = z.read(z.namelist()[0]).decode("cp949", errors="replace")
        rows, groups = parse(text, tail, market)
        keep = [r for r in rows if common_stock(r)]
        info[market] = {"rows": len(rows), "groups": groups, "common": len(keep)}
        allx += keep
    return allx, info


def _get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "swingbot/1.0"}), timeout=60) as r:
        return r.read()
