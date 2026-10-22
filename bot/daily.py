"""매일 장 마감 뒤 한 번: 일봉 적재 → 셋업 계산. 크론이 이것만 부른다."""
import sys
from datetime import datetime, timedelta, timezone

from . import load_candles, setups


def main() -> int:
    print(f"===== {datetime.now(timezone(timedelta(hours=9))):%Y-%m-%d %H:%M} KST =====")
    rc = load_candles.main([])
    setups.main([])
    return rc


if __name__ == "__main__":
    sys.exit(main())
