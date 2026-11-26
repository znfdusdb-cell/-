"""매일 장 마감 뒤 한 번: 전 종목 스캔(레이더) → 관심 종목 일봉 적재 → 셋업 계산 → 내일 감시 목록. 크론이 이것만 부른다."""
import sys
from datetime import datetime, timedelta, timezone

from . import load_candles, scan, setups
from .config import load_env
from .live import exits, watch
from .supa import Supa


def main() -> int:
    print(f"===== {datetime.now(timezone(timedelta(hours=9))):%Y-%m-%d %H:%M} KST =====")
    try:
        scan.main([])          # 전 종목 스캔 → 레이더 투입 (새 종목은 아래 적재에서 2년치 받음)
    except Exception as e:     # 스캔이 실패해도 보유·관심 종목 일봉과 셋업은 계속
        print("스캔 실패:", e)
    rc = load_candles.main([])
    setups.main([])
    try:
        env = load_env()
        exits.mark_close_exits(Supa(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"]))   # 연습 보유 종가 퇴출 → 다음 장 시작 매도 표시
    except Exception as e:
        print("종가 퇴출 판정 실패:", e)
    try:
        watch.main()       # 연습 모드 장중 루프(bot.live.loop)가 내일 볼 종목
    except Exception as e:
        print("감시 목록 실패:", e)
    return rc


if __name__ == "__main__":
    sys.exit(main())
