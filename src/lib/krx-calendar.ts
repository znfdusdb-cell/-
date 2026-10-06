/**
 * 한국거래소 거래일 달력. 주말 + 공휴일 + 대체공휴일 + 임시휴장 + 연말휴장.
 * 2025~2026 기준(2026-10-06 작성). 매년 12월에 다음 해 KRX 휴장일 공고를 보고 갱신한다.
 * 공고 이후 생기는 임시휴장은 sb_events(event_type='holiday') 로도 넣는다.
 */
export const KRX_HOLIDAYS: Record<string, string> = {
  // 2025
  "2025-01-01": "신정",
  "2025-01-27": "임시공휴일",
  "2025-01-28": "설날 연휴",
  "2025-01-29": "설날",
  "2025-01-30": "설날 연휴",
  "2025-03-03": "삼일절 대체공휴일",
  "2025-05-01": "근로자의 날",
  "2025-05-05": "어린이날·부처님오신날",
  "2025-05-06": "대체공휴일",
  "2025-06-03": "대통령 선거일",
  "2025-06-06": "현충일",
  "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-06": "추석",
  "2025-10-07": "추석 연휴",
  "2025-10-08": "추석 대체공휴일",
  "2025-10-09": "한글날",
  "2025-12-25": "성탄절",
  "2025-12-31": "연말 휴장",
  // 2026
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-02": "삼일절 대체공휴일",
  "2026-05-01": "근로자의 날",
  "2026-05-05": "어린이날",
  "2026-05-25": "부처님오신날 대체공휴일",
  "2026-06-03": "지방선거일",
  "2026-08-17": "광복절 대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-28": "추석 대체공휴일",
  "2026-10-05": "개천절 대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
  "2026-12-31": "연말 휴장",
};

export const KRX_CALENDAR_UPDATED = "2026-10-06";
export const KRX_CALENDAR_COVERS_UNTIL = "2026-12-31";

function dow(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

export function holidayName(date: string): string | null {
  const d = dow(date);
  if (d === 0) return "일요일";
  if (d === 6) return "토요일";
  return KRX_HOLIDAYS[date] ?? null;
}

export function isTradingDay(date: string): boolean {
  return holidayName(date) === null;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nextTradingDay(date: string): string {
  let d = addDays(date, 1);
  while (!isTradingDay(d)) d = addDays(d, 1);
  return d;
}

/** 다가오는 휴장 구간 (연속 비거래일 묶음). 주말만인 구간은 제외하고, 공휴일을 포함한 구간만. */
export function upcomingClosures(from: string, horizonDays: number): { start: string; end: string; days: number; names: string[]; long: boolean }[] {
  const out: { start: string; end: string; days: number; names: string[]; long: boolean }[] = [];
  let d = from;
  const until = addDays(from, horizonDays);
  while (d <= until) {
    if (!isTradingDay(d)) {
      const start = d;
      const names: string[] = [];
      let hasHoliday = false;
      while (!isTradingDay(d) && d <= addDays(until, 7)) {
        const n = holidayName(d)!;
        if (KRX_HOLIDAYS[d]) { hasHoliday = true; names.push(`${d.slice(5)} ${n}`); }
        d = addDays(d, 1);
      }
      const end = addDays(d, -1);
      const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
      // 거래일 기준 연속 비거래일 3일 이상(주말+공휴일)이면 '장기 휴장': 손절선이 며칠간 작동 못 한다 (EV-2)
      if (hasHoliday) out.push({ start, end, days, names, long: days >= 3 });
    } else {
      d = addDays(d, 1);
    }
  }
  return out;
}
