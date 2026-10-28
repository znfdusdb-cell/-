"""코스피·코스닥 종목 마스터 (한투 공개 파일). 보통주만 남긴다."""
from __future__ import annotations

import io
import urllib.request
import zipfile

URLS = {
    "KOSPI": ("https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip", 228),
    "KOSDAQ": ("https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip", 222),
}


def parse(text: str, tail: int, market: str) -> tuple[list[dict], dict]:
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
