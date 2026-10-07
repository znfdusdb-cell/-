/**
 * 일봉에서 바로 나오는 셋업 값. 봇(파이썬)도 같은 정의를 써야 한다.
 *  - 52주 고가·저가 = 최근 252거래일 최고가·최저가 (최근 스윙 고저가 아님)
 *  - 베이스 시작 = 직전 2단계 고점 = 52주 고가 날짜 (고점 이후 지금까지가 베이스)
 *  - 발자국 W = 베이스 시작 ~ 기준일 주 수
 *  - 고점 대비 조정 = (종가 - 52주 고가) / 52주 고가
 */
import type { Candle } from "./types";

export interface CandleStats {
  /** 252거래일(실제 일봉)이 안 되면 false. 그때 52주 값은 null, TT6/TT7 보류 */
  has_52w: boolean;
  candles_count: number;
  high_52w: number | null;
  high_52w_date: string | null;
  low_52w: number | null;
  low_52w_date: string | null;
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
  // 52주 판정은 실제 일봉 252개 이상일 때만. 가짜(seed) 일봉은 항상 '데이터 부족'.
  const real = sorted.filter((c) => c.source !== "seed");
  const has52 = real.length >= window;
  const win = sorted.slice(-window);
  let hi = win[0], lo = win[0];
  for (const c of win) {
    if (c.high > hi.high) hi = c;
    if (c.low < lo.low) lo = c;
  }
  const last = sorted[sorted.length - 1];
  const weeks = Math.max(1, Math.round((Date.parse(last.date) - Date.parse(hi.date)) / (7 * 86400000)));
  return {
    has_52w: has52,
    candles_count: real.length,
    high_52w: has52 ? hi.high : null, high_52w_date: has52 ? hi.date : null,
    low_52w: has52 ? lo.low : null, low_52w_date: has52 ? lo.date : null,
    base_start: hi.date,            // 자료 범위 안의 직전 고점 (52주 미확정이어도 베이스 시작은 잡는다)
    footprint_weeks: weeks,
    drawdown_pct: round1(((last.close - hi.high) / hi.high) * 100),
    last_close: last.close,
    pct_from_low: round1(((last.close - lo.low) / lo.low) * 100),
    pct_from_high: round1(((last.close - hi.high) / hi.high) * 100),
  };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
