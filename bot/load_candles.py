"""실제 일봉 적재 (조회 전용, 주문 없음).

    python3 -m bot.load_candles              # sb_stocks 전 종목: 실제 일봉 250개 미만이면 2년치, 아니면 최근 10일
    python3 -m bot.load_candles --full       # 전 종목 2년치 다시
    python3 -m bot.load_candles 005930 000660  # 지정 종목 (sb_stocks 에 있어야 함)
    python3 -m bot.load_candles --check      # 키·연결 확인만 (삼성전자 최근 5일 조회, DB 쓰기 없음)

가짜 시드 종목(is_seed=true)은 건너뛴다. 실제 일봉을 넣은 종목은 그 종목의 가짜 일봉(source=seed)을 지운다.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta, timezone

from .config import load_env
from .kis import Kis, KisError
from .supa import Supa

KST = timezone(timedelta(hours=9))
FULL_DAYS = 760      # 약 2년 + 여유 (52주 판정 252거래일 + 200일선 계산 여유)
RECENT_DAYS = 10


def today_kst() -> date:
    return datetime.now(KST).date()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("codes", nargs="*")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)

    env = load_env()
    kis = Kis(env["KIS_APP_KEY"], env["KIS_APP_SECRET"])
    end = today_kst()

    if a.check:
        name, rows = kis.daily("005930", end - timedelta(days=10), end)
        print(f"한투 연결 OK: {name} 최근 {len(rows)}일, 마지막 {rows[-1]['date']} 종가 {rows[-1]['close']:,}" if rows else "한투 연결 OK, 데이터 없음")
        db = Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])
        n = db.select("sb_stocks", "select=code")
        print(f"Supabase 연결 OK: 종목 {len(n)}개")
        return 0

    db = Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])
    stocks = db.select("sb_stocks", "select=code,name,is_seed")
    if a.codes:
        stocks = [s for s in stocks if s["code"] in a.codes]
        unknown = set(a.codes) - {s["code"] for s in stocks}
        if unknown:
            print(f"sb_stocks 에 없는 종목은 건너뜀: {', '.join(sorted(unknown))} (먼저 레이더에 넣기)")
    stocks = [s for s in stocks if not s.get("is_seed")]

    ok, fail = 0, []
    for s in stocks:
        code = s["code"]
        try:
            have = db.select("sb_candles", f"select=date&code=eq.{code}&source=neq.seed&order=date.desc&limit=260")
            full = a.full or len(have) < 250
            start = end - timedelta(days=FULL_DAYS if full else RECENT_DAYS)
            _, rows = kis.daily(code, start, end)
            if not rows:
                fail.append(f"{code} 데이터 없음")
                continue
            db.upsert("sb_candles", rows, "code,date")
            if full:
                db.delete("sb_candles", f"code=eq.{code}&source=eq.seed")
            ok += 1
            print(f"{code} {s['name']}: {len(rows)}일 ({rows[0]['date']} ~ {rows[-1]['date']}){' 2년치' if full else ''}")
        except (KisError, RuntimeError) as e:
            fail.append(f"{code} {e}")
    print(f"완료 {ok}종목, 실패 {len(fail)}")
    for f in fail:
        print("  실패:", f)
    return 1 if fail and not ok else 0


if __name__ == "__main__":
    sys.exit(main())
