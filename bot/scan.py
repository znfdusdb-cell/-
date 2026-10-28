"""레이더: 전 종목 매일 스캔 (조회·계산만, 주문 없음).

1. 종목 마스터(한투 공개 파일) → 보통주만
2. 일봉은 VPS 로컬 캐시(sqlite)에만. 처음엔 종목당 약 1년 반, 이후엔 최근 며칠만 받는다
3. 유동성 거름: 주가 1,000원 이상, 최근 20일 평균 거래대금 10억 원 이상 (Claude 초기값)
4. 상대강도(RS): 0.4×3개월 + 0.2×6개월 + 0.2×9개월 + 0.2×12개월 수익률 → 전 종목 백분위 1~99
5. 가격 거름: 트렌드 템플레이트 1~7 전부 + RS 70 이상
6. 실적 거름(DART): 최근 2개 보고 기간 모두 영업이익 1년 전 대비 +25% 이상(흑자 전환 포함) + 매출 증가
7. 둘 다 통과 → RS 높은 순으로 하루 최대 10개 레이더 투입(sb_stocks, actor=bot). 요약은 sb_scans
"""
from __future__ import annotations

import sys
import time
from datetime import date, datetime, timedelta, timezone

from . import cache, dart, master
from .config import load_env
from .kis import Kis, KisError
from .setups import compute
from .supa import Supa

KST = timezone(timedelta(hours=9))
MIN_PRICE = 1000
MIN_TURNOVER = 1_000_000_000      # 20일 평균 거래대금 10억
RS_MIN = 70
OP_YOY_MIN = 25.0
MAX_ADD = 10
FIRST_DAYS = 400                  # 첫 적재 달력일 (약 270거래일)


def rs_raw(closes: list[float]) -> float | None:
    if len(closes) < 253:
        return None
    r = lambda n: closes[-1] / closes[-1 - n] - 1  # noqa: E731
    return 0.4 * r(63) + 0.2 * r(126) + 0.2 * r(189) + 0.2 * r(252)


def percentile(raw: dict[str, float]) -> dict[str, int]:
    items = sorted(raw.items(), key=lambda x: x[1])
    n = len(items)
    return {c: max(1, min(99, round((i + 1) / n * 99))) for i, (c, _) in enumerate(items)} if n else {}


def fund_check(g: list[dict]) -> tuple[bool, str]:
    if len(g) < 2:
        return False, "비교 가능한 보고 기간 2개 미만"
    a, b = g[0], g[1]
    ok = all(x["op_yoy"] is not None and x["op_yoy"] >= OP_YOY_MIN and x["rev_yoy"] is not None and x["rev_yoy"] > 0 for x in (a, b))
    f = lambda v: "흑자전환" if v == 999.0 else ("—" if v is None else f"{v:+.0f}%")  # noqa: E731
    return ok, f"{a['period']} 영업이익 {f(a['op_yoy'])}·매출 {f(a['rev_yoy'])} / {b['period']} 영업이익 {f(b['op_yoy'])}·매출 {f(b['rev_yoy'])}"


def update_cache(con, kis: Kis, code: str, today: date) -> None:
    last, n = cache.last_date(con, code)
    if not last or n < 255:
        start = today - timedelta(days=FIRST_DAYS)
    else:
        start = date.fromisoformat(last) - timedelta(days=7)
    _, rows = kis.daily(code, start, today)
    if rows:
        cache.put_candles(con, rows)


def main(argv=None) -> int:
    env = load_env()
    t0 = time.time()
    today = datetime.now(KST).date()
    con = cache.db()
    kis = Kis(env["KIS_APP_KEY"], env["KIS_APP_SECRET"])
    db = Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])

    stocks = cache.kv_get(con, "master", 20 * 3600)
    info = cache.kv_get(con, "master_info") or {}
    if not stocks:
        stocks, info = master.load()
        cache.kv_set(con, "master", stocks)
        cache.kv_set(con, "master_info", info)
    summary = ", ".join("%s %s/%s" % (m, v.get("common"), v.get("rows")) for m, v in info.items())
    print(f"마스터: 보통주 {len(stocks)}개 ({summary})")
    if len(stocks) < 1000:
        print("경고: 보통주가 너무 적다. 그룹코드:", {m: v.get("groups") for m, v in info.items()})

    fails = 0
    for i, s in enumerate(stocks):
        try:
            update_cache(con, kis, s["code"], today)
        except KisError as e:
            fails += 1
            if fails <= 5:
                print("  일봉 실패:", s["code"], e)
        if i and i % 500 == 0:
            print(f"  일봉 {i}/{len(stocks)} ({time.time() - t0:.0f}초)")
    cache.prune(con, (today - timedelta(days=FIRST_DAYS + 30)).isoformat())

    # RS 백분위 (유동성 거름 전 전 종목 기준)
    candles = {s["code"]: cache.get_candles(con, s["code"], 300) for s in stocks}
    raw = {c: v for c, v in ((c, rs_raw([x["close"] for x in cs])) for c, cs in candles.items()) if v is not None}
    rs = percentile(raw)

    price_pass = []
    for s in stocks:
        cs = candles[s["code"]]
        if len(cs) < 253 or s["code"] not in rs:
            continue
        last = cs[-1]
        turnover = sum(x["close"] * x["volume"] for x in cs[-20:]) / 20
        if last["close"] < MIN_PRICE or turnover < MIN_TURNOVER or rs[s["code"]] < RS_MIN:
            continue
        r = compute(s["code"], [dict(x) for x in cs])
        if r and all(t["pass"] for t in r["trend_template"][:7]):
            price_pass.append({**s, "rs": rs[s["code"]], "close": last["close"], "turnover_eok": round(turnover / 1e8), "dd": r["drawdown_pct"]})
    price_pass.sort(key=lambda x: -x["rs"])
    print(f"가격 거름 통과 {len(price_pass)}개 (RS {RS_MIN}+, 트렌드 템플레이트 1~7)")

    # 실적 거름 (가격 통과 종목만 DART 조회)
    fund_pass = []
    if env.get("DART_API_KEY") and price_pass:
        cc = cache.kv_get(con, "dart_corp", 7 * 86400)
        if not cc:
            cc = dart.corp_codes(env["DART_API_KEY"])
            cache.kv_set(con, "dart_corp", cc)
        corps = [cc[s["code"]] for s in price_pass if s["code"] in cc]
        y = today.year
        periods = [(y, r) for r in dart.ORDER] + [(y - 1, "11011")] + [(y - 1, r) for r in dart.ORDER]
        data = {}
        for yy in (y, y - 1, y - 2):
            for rp in ("11013", "11012", "11014", "11011"):
                if yy == y and rp == "11011":
                    continue
                data[(yy, rp)] = dart.multi(env["DART_API_KEY"], corps, yy, rp)
        for s in price_pass:
            corp = cc.get(s["code"])
            g = dart.growth(periods, data, corp) if corp else []
            ok, why = fund_check(g)
            s["fund"] = why if corp else "DART 고유번호 없음"
            s["fund_ok"] = ok
            if ok:
                fund_pass.append(s)
    elif not env.get("DART_API_KEY"):
        print("DART 키 없음 → 실적 거름 건너뜀 (레이더 투입 안 함)")
    print(f"실적 거름 통과 {len(fund_pass)}개")

    existing = {r["code"] for r in db.select("sb_stocks", "select=code")}
    added = []
    for s in fund_pass:
        if len(added) >= MAX_ADD:
            break
        if s["code"] in existing:
            continue
        sector = None
        try:
            res = kis._get("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": s["code"]})
            sector = (res.get("output") or {}).get("bstp_kor_isnm") or None
        except KisError:
            pass
        reason = f"레이더 자동({today:%m/%d}): RS {s['rs']}, 트렌드 템플레이트 1~7 통과, 고점 대비 {s['dd']}%, 거래대금 {s['turnover_eok']}억 / {s['fund']}"
        db.upsert("sb_stocks", [{"code": s["code"], "name": s["name"], "market": s["market"], "sector": sector, "stage": "radar", "stage_reason": reason, "is_seed": False}], "code")
        db._req("POST", "/sb_stage_log", [{"code": s["code"], "from_stage": None, "to_stage": "radar", "reason": reason, "actor": "bot"}], {"prefer": "return=minimal"})
        added.append({"code": s["code"], "name": s["name"], "rs": s["rs"], "sector": sector})
    print(f"레이더 투입 {len(added)}개:", ", ".join(f"{a['name']}({a['rs']})" for a in added) or "없음")

    mine = {c: rs.get(c) for c in existing | {a["code"] for a in added} if c in rs}
    top = [{k: s.get(k) for k in ("code", "name", "market", "rs", "close", "turnover_eok", "dd", "fund", "fund_ok")} for s in price_pass[:60]]
    db.upsert("sb_scans", [{"as_of": today.isoformat(), "universe_n": len(stocks), "rs_n": len(rs), "price_pass_n": len(price_pass), "fund_pass_n": len(fund_pass),
                            "added": added, "top": top, "rs_mine": mine, "seconds": round(time.time() - t0), "kis_fail_n": fails,
                            "notes": f"유동성 {MIN_PRICE}원·거래대금 {MIN_TURNOVER // 100_000_000}억, RS {RS_MIN}+, 영업이익 +{OP_YOY_MIN:.0f}% 2기간 + 매출 증가 (Claude 초기값)"}], "as_of")
    print(f"스캔 끝 {time.time() - t0:.0f}초")
    return 0


if __name__ == "__main__":
    sys.exit(main())
