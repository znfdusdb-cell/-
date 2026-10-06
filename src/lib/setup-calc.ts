/**
 * 일봉에서 바로 나오는 셋업 값. 봇(파이썬)도 같은 정의를 써야 한다.
 *  - 52주 고가·저가 = 최근 252거래일 최고가·최저가 (최근 스윙 고저가 아님)
 *  - 베이스 시작 = 직전 2단계 고점 = 52주 고가 날짜 (고점 이후 지금까지가 베이스)
 *  - 발자국 W = 베이스 시작 ~ 기준일 주 수
 *  - 고점 대비 조정 = (종가 - 52주 고가) / 52주 고가
 */
import type { Candle } from "./types";

export interface CandleStats {
  high_52w: number;
  high_52w_date: string;
  low_52w: number;
  low_52w_date: string;
  base_start: string;
  footprint_weeks: number;
  drawdown_pct: number;
  last_close: number;
  pct_from_low: number;   // 52주 저가 대비 +%
  pct_from_high: number;  // 52주 고가 대비 -%
}

export function candleStats(candles: Candle[], window = 252): CandleStats | null {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  const win = sorted.slice(-window);
  let hi = win[0], lo = win[0];
  for (const c of win) {
    if (c.high > hi.high) hi = c;
    if (c.low < lo.low) lo = c;
  }
  const last = sorted[sorted.length - 1];
  const weeks = Math.max(1, Math.round((Date.parse(last.date) - Date.parse(hi.date)) / (7 * 86400000)));
  return {
    high_52w: hi.high, high_52w_date: hi.date,
    low_52w: lo.low, low_52w_date: lo.date,
    base_start: hi.date,
    footprint_weeks: weeks,
    drawdown_pct: round1(((last.close - hi.high) / hi.high) * 100),
    last_close: last.close,
    pct_from_low: round1(((last.close - lo.low) / lo.low) * 100),
    pct_from_high: round1(((last.close - hi.high) / hi.high) * 100),
  };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
