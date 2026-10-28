"""실제 일봉으로 셋업 계산 → sb_setups (data_source='bot'). 조회·계산만, 주문 없음.

정의는 src/lib/setup-calc.ts 와 같다.
  - 52주 고가·저가 = 최근 252거래일 최고가·최저가. 252개 미만이면 TT6·TT7 보류
  - 베이스 시작 = 52주 고가 날 (직전 2단계 고점), 발자국 W = 그날부터 주 수
  - 고점 대비 조정 = (종가 - 52주 고가) / 52주 고가
자동 판정의 한계(화면에 '보류'로 표시):
  - TT8 상대강도는 전 종목 등수가 있어야 해서 레이더 단계 전까지 보류
  - 시장 대비 조정(UV-4 배수)은 지수 일봉 적재 전까지 보류
  - 피봇·C 박스·T 는 지그재그(흔들림 6% 이상만 셈) 휴리스틱. 비움 확인 전 참고값
  - 체크리스트 ⑥⑦(돌파·진입)은 장중 감시 단계에서 판정
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone

from .config import load_env
from .supa import Supa

KST = timezone(timedelta(hours=9))
ZIGZAG_PCT = 6.0      # 이보다 작은 흔들림은 무시
TT_LABELS = [
    ("tt1", "현재가 > 150일선·200일선"), ("tt2", "150일선 > 200일선"),
    ("tt3", "200일선 1개월 이상 상승 (권장 4~5개월)"), ("tt4", "50일선 > 150일선 > 200일선"),
    ("tt5", "현재가 > 50일선"), ("tt6", "52주 신저가 대비 +25~30% 이상"),
    ("tt7", "52주 신고가 25% 이내"), ("tt8", "상대강도 상위"),
]
CL_LABELS = [
    ("c1", "큰 흐름이 2단계(상승 추세)다"), ("c2", "상승 중 베이스(조정·횡보 구간)가 있다"),
    ("c3", "흔들림이 갈수록 작아졌고 마지막 조정이 10% 이내다"), ("c4", "베이스 동안 거래량이 줄었다"),
    ("c5", "고점 대비 조정이 60% 미만이다"), ("c6", "피봇을 거래량 급증과 함께 돌파했다"),
    ("c7", "피봇 대비 +2~3% 이내에서 진입했다"),
]


def won(n) -> str:
    return f"{round(n):,}"


def sma(closes: list[float], n: int, end: int | None = None) -> float | None:
    end = len(closes) if end is None else end
    if end < n:
        return None
    return sum(closes[end - n:end]) / n


def zigzag(c: list[dict], pct: float = ZIGZAG_PCT) -> list[tuple[str, int, float]]:
    """고가·저가로 지그재그 꼭짓점 [(kind 'H'/'L', idx, price)]."""
    if not c:
        return []
    pts: list[tuple[str, int, float]] = []
    trend = None
    hi_i, lo_i = 0, 0
    for i, x in enumerate(c):
        if x["high"] >= c[hi_i]["high"]:
            hi_i = i
        if x["low"] <= c[lo_i]["low"]:
            lo_i = i
        if trend in (None, "up") and x["low"] <= c[hi_i]["high"] * (1 - pct / 100) and i > hi_i:
            if trend is None or not pts or pts[-1][0] != "H":
                pts.append(("H", hi_i, c[hi_i]["high"]))
            trend, lo_i = "down", i
        elif trend in (None, "down") and x["high"] >= c[lo_i]["low"] * (1 + pct / 100) and i > lo_i:
            if trend is None or not pts or pts[-1][0] != "L":
                pts.append(("L", lo_i, c[lo_i]["low"]))
            trend, hi_i = "up", i
    return pts


def compute(code: str, candles: list[dict]) -> dict | None:
    c = sorted(candles, key=lambda x: x["date"])
    if len(c) < 60:
        return None
    for x in c:
        for k in ("open", "high", "low", "close"):
            x[k] = float(x[k])
        x["volume"] = int(x["volume"])
    closes = [x["close"] for x in c]
    last = c[-1]
    price = last["close"]
    ma50, ma150, ma200 = sma(closes, 50), sma(closes, 150), sma(closes, 200)
    ma200_1m = sma(closes, 200, len(closes) - 21) if len(closes) >= 221 else None
    has52 = len(c) >= 252
    win = c[-252:]
    hi = max(win, key=lambda x: x["high"])
    lo = min(win, key=lambda x: x["low"])
    dd = (price - hi["high"]) / hi["high"] * 100
    from_low = (price - lo["low"]) / lo["low"] * 100

    def item(i, ok, value=None, pending=False):
        k, label = TT_LABELS[i]
        return {"key": k, "label": label, "pass": bool(ok) and not pending, "value": value, **({"pending": True} if pending else {})}

    tt = [
        item(0, ma150 and ma200 and price > ma150 and price > ma200, f"{won(price)} vs 150일 {won(ma150)}·200일 {won(ma200)}" if ma200 else "200일선 계산 불가", pending=ma200 is None),
        item(1, ma150 and ma200 and ma150 > ma200, f"150일 {won(ma150)} / 200일 {won(ma200)}" if ma200 else None, pending=ma200 is None),
        item(2, ma200 and ma200_1m and ma200 > ma200_1m, f"200일선 1개월 전 {won(ma200_1m)} → {won(ma200)}" if ma200_1m else "1개월 전 200일선 없음", pending=ma200_1m is None),
        item(3, ma50 and ma150 and ma200 and ma50 > ma150 > ma200, f"50일 {won(ma50)} / 150일 {won(ma150)} / 200일 {won(ma200)}" if ma200 else None, pending=ma200 is None),
        item(4, ma50 and price > ma50, f"{won(price)} vs 50일 {won(ma50)}"),
        item(5, from_low >= 25, f"52주 저가 {won(lo['low'])}({lo['date'][5:]}) 대비 {from_low:+.1f}%" if has52 else f"데이터 부족 (일봉 {len(c)} / 252)", pending=not has52),
        item(6, dd >= -25, f"52주 고가 {won(hi['high'])}({hi['date'][5:]}) 대비 {dd:.1f}%" if has52 else f"데이터 부족 (일봉 {len(c)} / 252)", pending=not has52),
        item(7, False, "전 종목 등수 계산 전 (레이더 단계)", pending=True),
    ]

    # 베이스: 52주 고가 이후
    base_i = c.index(hi)
    base = c[base_i:]
    weeks = max(1, round((datetime.fromisoformat(last["date"]) - datetime.fromisoformat(hi["date"])).days / 7))
    pts = zigzag(base)
    # 고점 → 다음 저점 하락폭이 흔들림(T)
    contractions = []
    for a, b in zip(pts, pts[1:]):
        if a[0] == "H" and b[0] == "L":
            contractions.append(((a[2] - b[2]) / a[2] * 100, a, b))
    if not contractions and len(base) > 1:
        low_b = min(base, key=lambda x: x["low"])
        contractions.append(((hi["high"] - low_b["low"]) / hi["high"] * 100, ("H", 0, hi["high"]), ("L", base.index(low_b), low_b["low"])))
    # 마지막 지그재그 저점 뒤의 '지금 진행 중인 작은 흔들림'(6% 미만)도 마지막 T로 센다 (2% 이상일 때)
    pivot = cbox_low = cbox_start = None
    last_low_i = max((p[1] for p in pts if p[0] == "L"), default=None)
    if last_low_i is not None and last_low_i < len(base) - 1:
        right = base[last_low_i:]
        rh = max(right, key=lambda x: x["high"])
        rh_i = last_low_i + right.index(rh)
        after = base[rh_i:]
        rl = min(after, key=lambda x: x["low"])
        pull = (rh["high"] - rl["low"]) / rh["high"] * 100
        if rh_i < len(base) - 1 and pull >= 2 and (not contractions or contractions[-1][1][1] != rh_i):
            contractions.append((pull, ("H", rh_i, rh["high"]), ("L", base.index(rl), rl["low"])))
        pivot, cbox_low, cbox_start = rh["high"], rl["low"], rh["date"]
    elif contractions:
        h = contractions[-1][1]
        pivot, cbox_low, cbox_start = h[2], min(x["low"] for x in base[h[1]:]), base[h[1]]["date"]
    t_count = len(contractions)
    sizes = [round(x[0], 1) for x in contractions]
    shrinking = t_count >= 2 and all(sizes[i] > sizes[i + 1] for i in range(len(sizes) - 1))
    last_t = contractions[-1] if contractions else None
    pivot = round(pivot) if pivot else None
    cbox_low = round(cbox_low) if cbox_low else None
    vols = [x["volume"] for x in c]
    avg50 = sum(vols[-50:]) / min(50, len(vols))
    dry = 0
    for v in reversed(vols):
        if v <= avg50:
            dry += 1
        else:
            break
    base_vol = sum(x["volume"] for x in base) / len(base) if base else None
    pre = c[max(0, base_i - 50):base_i]
    pre_vol = sum(x["volume"] for x in pre) / len(pre) if pre else None
    vol_down = bool(base_vol and pre_vol and base_vol < pre_vol)
    stage2 = all(t["pass"] for t in tt[:5])

    def cl(i, ok, value=None, pending=False):
        k, label = CL_LABELS[i]
        return {"key": k, "label": label, "pass": bool(ok) and not pending, "value": value, **({"pending": True} if pending else {})}

    checklist = [
        cl(0, stage2, "트렌드 템플레이트 1~5 모두 통과" if stage2 else "1~5 중 미통과 있음"),
        cl(1, stage2 and weeks >= 3 and dd < 0, f"고점 후 {weeks}주, {dd:.1f}%"),
        cl(2, shrinking and last_t and last_t[0] <= 10, "흔들림 " + " → ".join(f"{s}%" for s in sizes) if sizes else "흔들림 없음"),
        cl(3, vol_down, f"베이스 평균 {won(base_vol or 0)}주 vs 직전 {won(pre_vol or 0)}주" if pre_vol else "비교 구간 없음"),
        cl(4, dd > -60, f"{dd:.1f}%"),
        cl(5, False, "장중 감시 단계에서 판정", pending=True),
        cl(6, False, "장중 감시 단계에서 판정", pending=True),
    ]
    setup_type = "vcp" if stage2 and shrinking else "none"
    # 문턱(피봇)은 2단계 오르막 위의 베이스에서만 의미가 있다. 내리막 속 반등 고점은 문턱이 아니다.
    no_pivot_reason = None
    if not stage2:
        no_pivot_reason = "2단계(트렌드 템플레이트 1~5) 아님 → 문턱 없음. 내리막·평지 속 반등 고점은 피봇이 아니다"
        pivot = cbox_low = cbox_start = None
    score = lambda xs: sum(1 for x in xs if x["pass"])  # noqa: E731
    return {
        "code": code, "as_of": last["date"], "setup_type": setup_type,
        "footprint_weeks": weeks,
        "max_contraction_pct": max(sizes) if sizes else None, "min_contraction_pct": min(sizes) if sizes else None, "t_count": t_count,
        "pivot": pivot, "cbox_high": pivot, "cbox_low": cbox_low, "cbox_start": cbox_start,
        "volume_dry_days": dry,
        "trend_template": tt, "trend_template_score": score(tt),
        "checklist": checklist, "checklist_score": score(checklist),
        "drawdown_pct": round(dd, 2), "market_drawdown_pct": None, "drawdown_vs_market": None, "benchmark": None,
        "high_52w": hi["high"] if has52 else None, "high_52w_date": hi["date"] if has52 else None,
        "low_52w": lo["low"] if has52 else None, "low_52w_date": lo["date"] if has52 else None,
        "base_start": hi["date"], "data_source": "bot",
        "notes": (no_pivot_reason + ". " if no_pivot_reason else "") + f"자동 계산 {datetime.now(KST):%m/%d %H:%M}. 피봇·C 박스·흔들림은 지그재그({ZIGZAG_PCT:g}% 이상) 휴리스틱이라 비움 확인 전 참고값. 상대강도·시장 대비 조정은 보류.",
    }


def main(argv=None) -> int:
    env = load_env()
    db = Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])
    stocks = [s for s in db.select("sb_stocks", "select=code,name,is_seed") if not s.get("is_seed")]
    out = []
    for s in stocks:
        rows = db.select("sb_candles", f"select=date,open,high,low,close,volume&code=eq.{s['code']}&source=neq.seed&order=date.desc&limit=400")
        r = compute(s["code"], rows)
        if not r:
            print(f"{s['code']} {s['name']}: 일봉 부족, 건너뜀")
            continue
        out.append(r)
        print(f"{s['code']} {s['name']}: 트렌드 템플레이트 {r['trend_template_score']}/8, 체크리스트 {r['checklist_score']}/7, 고점 대비 {r['drawdown_pct']}%, 피봇 {won(r['pivot']) if r['pivot'] else '-'}")
    if out:
        db.upsert("sb_setups", out, "code,as_of")
    print(f"셋업 {len(out)}종목 저장")
    return 0


if __name__ == "__main__":
    sys.exit(main())
