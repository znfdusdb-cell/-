/**
 * 시드 데이터. Supabase 연결이 없을 때 사이트가 그대로 쓰고,
 * scripts/seed.ts 가 같은 데이터를 Supabase에 넣는다. (단일 출처)
 *
 * 삼성전자는 KB 수동 보유(봇 대상 아님). 체결 이력은 재구성 불가라 화면으로 확인된 잔고 스냅샷만 넣는다
 * (swingbot_erratum_2_2026-10-06). 9/22 이후 미확인 → 비움이 실제 숫자를 주면 교체. 일봉은 가짜다.
 * 나머지 4종목은 완전히 가짜(이름 앞에 [가짜]).
 */
import type {
  Stock, Thesis, Setup, Position, OrderLog, MarketEvent, Prediction, MarketRegime, Candle, StageLog, CheckItem, Settings, BalanceSnapshot,
} from "./types";
import { TREND_TEMPLATE_ITEMS, CHECKLIST_ITEMS } from "./constants";

export const SEED_AS_OF = "2026-10-06";

// ---------- 결정적 난수 (같은 시드는 항상 같은 캔들) ----------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tradingDays(endISO: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(endISO + "T00:00:00Z");
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

/** 앵커(날짜 인덱스→가격)를 선형 보간한 뒤 노이즈를 얹어 일봉을 만든다. */
function makeCandles(code: string, seed: number, anchors: [number, number][], n: number, tick: number, baseVol: number): Candle[] {
  const rnd = mulberry32(seed);
  const days = tradingDays(SEED_AS_OF, n);
  const round = (v: number) => Math.max(tick, Math.round(v / tick) * tick);
  const out: Candle[] = [];
  let prevClose: number | null = null;
  for (let i = 0; i < n; i++) {
    let a = anchors[0];
    let b = anchors[anchors.length - 1];
    for (let k = 0; k < anchors.length - 1; k++) {
      if (i >= anchors[k][0] && i <= anchors[k + 1][0]) { a = anchors[k]; b = anchors[k + 1]; break; }
    }
    const t = b[0] === a[0] ? 0 : (i - a[0]) / (b[0] - a[0]);
    const trend = a[1] + (b[1] - a[1]) * t;
    const noise = (rnd() - 0.5) * 0.03 * trend;
    const close = round(trend + noise);
    const open = round(prevClose ?? close * (1 + (rnd() - 0.5) * 0.01));
    const hi = round(Math.max(open, close) * (1 + rnd() * 0.012));
    const lo = round(Math.min(open, close) * (1 - rnd() * 0.012));
    const move = Math.abs(close - open) / open;
    const volume = Math.round(baseVol * (0.5 + rnd() + move * 40));
    out.push({ code, date: days[i], open, high: hi, low: lo, close, volume, source: "seed" });
    prevClose = close;
  }
  return out;
}

function tt(passes: boolean[], values: (string | null)[] = []): CheckItem[] {
  return TREND_TEMPLATE_ITEMS.map((it, i) => ({ ...it, pass: passes[i] ?? false, value: values[i] ?? null }));
}
function cl(passes: boolean[]): CheckItem[] {
  return CHECKLIST_ITEMS.map((it, i) => ({ ...it, pass: passes[i] ?? false }));
}
const score = (items: CheckItem[]) => items.filter((i) => i.pass).length;

// ---------- 종목 ----------
export const SEED_STOCKS: Stock[] = [
  { code: "005930", name: "삼성전자", market: "KOSPI", sector: "반도체", stage: "review", stage_changed_at: "2026-10-06T09:00:00+09:00", stage_reason: "KB 계좌 수동 보유 중. 봇 계좌 파이프라인은 검토부터 시작 (가설 작성 완료, 유니버스 승인 대기)", is_seed: false },
  { code: "999901", name: "[가짜] 알파로보틱스", market: "KOSDAQ", sector: "로봇", stage: "radar", stage_changed_at: "2026-10-05T07:10:00+09:00", stage_reason: "브레인 후보 수집: 상대강도 상위", is_seed: true },
  { code: "999902", name: "[가짜] 베타바이오", market: "KOSDAQ", sector: "바이오", stage: "review", stage_changed_at: "2026-10-02T09:30:00+09:00", stage_reason: "가설 작성 중", is_seed: true },
  { code: "999903", name: "[가짜] 감마조선", market: "KOSPI", sector: "조선", stage: "universe", stage_changed_at: "2026-09-29T20:00:00+09:00", stage_reason: "비움 승인", is_seed: true },
  { code: "999904", name: "[가짜] 델타에너지", market: "KOSPI", sector: "에너지", stage: "exited", stage_changed_at: "2026-09-29T15:40:00+09:00", stage_reason: "무효화 조건 위반 확인 후 퇴출 승인", is_seed: true },
];

export const SEED_STAGE_LOG: StageLog[] = [
  { id: 1, code: "005930", from_stage: null, to_stage: "review", reason: "시드: KB 수동 보유 중, 가설·무효화 조건 작성 완료. 봇 계좌 기준으론 아직 유니버스 아님", actor: "bium", created_at: "2026-10-06T09:00:00+09:00" },
  { id: 5, code: "999901", from_stage: null, to_stage: "radar", reason: "상대강도 상위 + 거래량 축소 감지", actor: "brain", created_at: "2026-10-05T07:10:00+09:00" },
  { id: 6, code: "999902", from_stage: null, to_stage: "radar", reason: "실적 서프라이즈 2분기 연속", actor: "brain", created_at: "2026-09-28T07:10:00+09:00" },
  { id: 7, code: "999902", from_stage: "radar", to_stage: "review", reason: "가설 작성 시작", actor: "bium", created_at: "2026-10-02T09:30:00+09:00" },
  { id: 8, code: "999903", from_stage: null, to_stage: "radar", reason: "수주 모멘텀 + 플랫 베이스", actor: "brain", created_at: "2026-09-20T07:10:00+09:00" },
  { id: 9, code: "999903", from_stage: "radar", to_stage: "review", reason: null, actor: "bium", created_at: "2026-09-22T21:00:00+09:00" },
  { id: 10, code: "999903", from_stage: "review", to_stage: "universe", reason: "비움 승인", actor: "bium", created_at: "2026-09-29T20:00:00+09:00" },
  { id: 11, code: "999904", from_stage: null, to_stage: "radar", reason: "유가 급등 수혜 가설", actor: "brain", created_at: "2026-09-10T07:10:00+09:00" },
  { id: 12, code: "999904", from_stage: "radar", to_stage: "universe", reason: "시드", actor: "bium", created_at: "2026-09-12T20:00:00+09:00" },
  { id: 13, code: "999904", from_stage: "universe", to_stage: "review", reason: "무효화 조건 위반 의심: 유가 70달러 하회", actor: "brain", created_at: "2026-09-24T07:10:00+09:00" },
  { id: 14, code: "999904", from_stage: "review", to_stage: "exited", reason: "무효화 조건 위반 확인 후 퇴출 승인", actor: "bium", created_at: "2026-09-29T15:40:00+09:00" },
];

// ---------- 가설 ----------
export const SEED_THESES: Thesis[] = [
  {
    id: 1, code: "005930", author: "bium", status: "valid",
    hypothesis: "HBM 구조적 수요 + 범용 D램 가격 반등으로 2026 하반기 실적 컨센서스 상향. 3C 베이스(A 380,000→189,200, B 288,000 회복) 완성 후 C 박스 고점 돌파 시 2단계 재개.",
    invalidation_conditions: [
      { text: "288,000 돌파 실패 후 C 박스 하단(250,000) 종가 이탈", violated: false, note: null },
      { text: "HBM4 주요 고객 인증 지연 공식 발표", violated: false, note: null },
      { text: "분기 영업이익 컨센서스 10% 이상 하회", violated: false, note: null },
      { text: "필라델피아 반도체지수 대비 상대강도 3개월 연속 하위", violated: false, note: null },
    ],
    created_at: "2026-09-15T22:30:00+09:00", updated_at: "2026-09-15T22:30:00+09:00",
  },
  {
    id: 2, code: "999902", author: "brain", status: "valid",
    hypothesis: "[가짜] 신약 3상 결과 발표 전 기관 매집. 2분기 연속 컨센서스 상회.",
    invalidation_conditions: [],   // 비어 있음 → 유니버스 승인 불가 상태를 보여주는 카드
    created_at: "2026-10-02T09:30:00+09:00", updated_at: "2026-10-02T09:30:00+09:00",
  },
  {
    id: 3, code: "999903", author: "bium", status: "valid",
    hypothesis: "[가짜] LNG선 수주 잔고 3년치 + 신조선가 상승. 4~7주 플랫 베이스 고점 돌파 대기.",
    invalidation_conditions: [
      { text: "신조선가 지수 2개월 연속 하락", violated: false, note: null },
      { text: "베이스 하단(-12%) 종가 이탈", violated: false, note: null },
    ],
    created_at: "2026-09-29T20:00:00+09:00", updated_at: "2026-09-29T20:00:00+09:00",
  },
  {
    id: 4, code: "999904", author: "bium", status: "suspect",
    hypothesis: "[가짜] 중동 리스크로 유가 90달러 이상 유지 시 정제 마진 확대.",
    invalidation_conditions: [
      { text: "WTI 70달러 하회", violated: true, note: "9/24 종가 68.4달러" },
      { text: "정제 마진 5달러 이하", violated: false, note: null },
    ],
    created_at: "2026-09-12T20:00:00+09:00", updated_at: "2026-09-24T07:10:00+09:00",
  },
];

// ---------- 셋업 ----------
export const SEED_SETUPS: Setup[] = [
  {
    id: 1, code: "005930", as_of: SEED_AS_OF, setup_type: "cup3c",
    footprint_weeks: 40, max_contraction_pct: 50.2, min_contraction_pct: 13, t_count: 3,
    pivot: 288000, cbox_high: 288000, cbox_low: 250000, cbox_start: "2026-08-04",
    volume_dry_days: 9,
    trend_template: tt([true, true, false, true, true, true, true, false], ["257,000 > 231,000·214,000", null, "200일선 상승 3주", null, null, "저가 189,200 대비 +36%", "고가 288,000 대비 -11%", "SOX 대비 하위"]),
    trend_template_score: 0,
    checklist: cl([true, true, false, true, true, false, false]),
    checklist_score: 0,
    drawdown_pct: -13.0, market_drawdown_pct: -6.5, drawdown_vs_market: 2.0, benchmark: "SOX",
    notes: "C 박스가 아직 넓음(-13%). 거래량 7월 1억 주 → 9월 1,600만~2,800만 주로 축소. 피봇 288,000 돌파 + 거래량 전까지 2차 금지.",
  },
  {
    id: 2, code: "999901", as_of: SEED_AS_OF, setup_type: "vcp",
    footprint_weeks: 12, max_contraction_pct: 24, min_contraction_pct: 6, t_count: 3,
    pivot: 54800, cbox_high: 54800, cbox_low: 51500, cbox_start: "2026-09-15",
    volume_dry_days: 4,
    trend_template: tt([true, true, true, true, true, true, true, true]),
    trend_template_score: 0,
    checklist: cl([true, true, true, true, true, false, false]),
    checklist_score: 0,
    drawdown_pct: -6.0, market_drawdown_pct: -6.5, drawdown_vs_market: 0.9, benchmark: "KOSDAQ",
    notes: "[가짜] 펀더멘털 미확인. 가설 없음.",
  },
  {
    id: 3, code: "999902", as_of: SEED_AS_OF, setup_type: "none",
    footprint_weeks: 6, max_contraction_pct: 38, min_contraction_pct: 20, t_count: 2,
    pivot: null, cbox_high: null, cbox_low: null, cbox_start: null,
    volume_dry_days: 0,
    trend_template: tt([true, true, true, false, true, true, false, true]),
    trend_template_score: 0,
    checklist: cl([true, false, false, false, true, false, false]),
    checklist_score: 0,
    drawdown_pct: -20.0, market_drawdown_pct: -6.5, drawdown_vs_market: 3.1, benchmark: "KOSDAQ",
    notes: "[가짜] 조정이 안 줄어듦. 시장 대비 3배 조정 → 제외 기준 근접.",
  },
  {
    id: 4, code: "999903", as_of: SEED_AS_OF, setup_type: "flat",
    footprint_weeks: 6, max_contraction_pct: 12, min_contraction_pct: 5, t_count: 2,
    pivot: 131500, cbox_high: 131500, cbox_low: 116000, cbox_start: "2026-08-25",
    volume_dry_days: 7,
    trend_template: tt([true, true, true, true, true, true, true, true]),
    trend_template_score: 0,
    checklist: cl([true, true, true, true, true, false, false]),
    checklist_score: 0,
    drawdown_pct: -8.0, market_drawdown_pct: -6.5, drawdown_vs_market: 1.2, benchmark: "KOSPI",
    notes: "[가짜] 플랫 베이스 6주차. 피봇 131,500. 거래량 마른 7일째.",
  },
  {
    id: 5, code: "999904", as_of: SEED_AS_OF, setup_type: "none",
    footprint_weeks: 9, max_contraction_pct: 22, min_contraction_pct: 11, t_count: 2,
    pivot: null, cbox_high: null, cbox_low: null, cbox_start: null,
    volume_dry_days: 0,
    trend_template: tt([false, true, true, false, false, true, false, false]),
    trend_template_score: 0,
    checklist: cl([false, true, false, false, true, false, false]),
    checklist_score: 0,
    drawdown_pct: -22.0, market_drawdown_pct: -6.5, drawdown_vs_market: 3.4, benchmark: "KOSPI",
    notes: "[가짜] 50일선 이탈. 퇴출.",
  },
].map((s) => ({ ...s, data_source: "seed" as const, trend_template_score: score(s.trend_template), checklist_score: score(s.checklist) })) as Setup[];

// ---------- 포지션 ----------
export const SEED_POSITIONS: Position[] = [
  { id: 1, code: "005930", account: "kb_manual", qty: 13, avg_price: 257575, stop_price: null, state: "manual", entry_rule_id: null, is_unverified: true, note: "KB 계좌 수동 보유. 봇 상태 머신·손절 자동화 대상 아님. 9/22 10:41 확인값(13주, 평단 257,575). 이후 변동 미확인 — 비움이 현재 수량·평단을 주면 교체", opened_at: "2026-08-13T09:00:00+09:00", closed_at: null, updated_at: "2026-09-22T10:41:00+09:00" },
  { id: 2, code: "999904", account: "kis_bot", qty: 0, avg_price: 41200, stop_price: 36000, state: "closed", entry_rule_id: "EN-3", is_unverified: false, note: "[가짜]", opened_at: "2026-09-15T09:40:00+09:00", closed_at: "2026-09-29T09:02:00+09:00", updated_at: "2026-09-29T09:02:00+09:00" },
];

/** 확인된 시점의 잔고 스냅샷 (체결가·체결일은 지어내지 않는다) */
export const SEED_SNAPSHOTS: BalanceSnapshot[] = [
  { id: 1, account: "kb_manual", code: "005930", as_of: "2026-08-18T09:00:00+09:00", qty: 1, avg_price: null, market_price: null, cash: null, note: "8/18 오전 잔고: 정찰병 1주, +6.19% (8/13 전후 매수)" },
  { id: 2, account: "kb_manual", code: "005930", as_of: "2026-08-18T15:14:00+09:00", qty: 10, avg_price: 268400, market_price: 267500, cash: null, note: "10주 오주문 (계획 1주). 매입금액 약 2,684,190원 → EN-8 신설 계기" },
  { id: 3, account: "kb_manual", code: "005930", as_of: "2026-08-26T09:43:00+09:00", qty: 10, avg_price: 259609, market_price: null, cash: null, note: "8/18 이후 일부 매도·재매수 추정, 미확인" },
  { id: 4, account: "kb_manual", code: "005930", as_of: "2026-09-04T10:11:00+09:00", qty: 13, avg_price: 257575, market_price: null, cash: 2900000, note: "3주 추가: 국장 총액 증가(예수금 168만→290만)에 따른 수동 비중 조정. 정찰병 규칙 매수 아님" },
  { id: 5, account: "kb_manual", code: "005930", as_of: "2026-09-22T10:41:00+09:00", qty: 13, avg_price: 257575, market_price: 279250, cash: null, note: "마지막 확인. 이후 미확인" },
];

// ---------- 주문 로그 ----------
export const SEED_ORDERS: OrderLog[] = [
  { id: 1, ts: "2026-09-15T09:40:00+09:00", code: "999904", side: "buy", qty: 10, planned_qty: 10, price: 41200, source: "bot", stop_price: 38700, target_price: 47000, account_balance_at: 6200000, rule_id: "EN-3", rule_text: "정찰병 소액 진입", is_violation: false, note: "[가짜]" },
  { id: 2, ts: "2026-09-29T09:02:00+09:00", code: "999904", side: "sell", qty: 10, planned_qty: 10, price: 38600, source: "bot", stop_price: null, target_price: null, account_balance_at: 6180000, rule_id: "UV-3", rule_text: "무효화 조건 위반 → 퇴출 승인 → 봇 매도", is_violation: false, note: "[가짜] 추석 연휴 뒤 첫 거래일" },
];

/** sb_settings. null = 비움 미확정. 봇 가동일은 모의투자 시작일에 넣는다. */
export const SEED_SETTINGS: Settings = {
  bot_started_at: null,
  bot_account_balance: null,
  max_weight_per_stock_pct: null,
  max_weight_per_sector_pct: null,
  uv4_drawdown_pct: "60",
  uv4_market_multiple: "2",
  regime_vkospi_reduce: null,
  regime_vkospi_wait: null,
  regime_lev_etf_share_reduce: null,
  regime_ma200_slope_min_pct: null,
};

// ---------- 이벤트 ----------
export const SEED_EVENTS: MarketEvent[] = [
  { id: 1, code: "005930", event_type: "earnings", title: "삼성전자 3분기 잠정실적", event_date: "2026-10-08", note: "EV-1: 발표 전 축소 여부 비움 승인" },
  { id: 2, code: null, event_type: "macro", title: "미국 CPI 발표", event_date: "2026-10-14", note: null },
  { id: 3, code: null, event_type: "holiday", title: "한글날 휴장", event_date: "2026-10-09", note: "하루 휴장. 손절선 하루 미작동" },
  { id: 4, code: "999903", event_type: "earnings", title: "[가짜] 감마조선 3분기 실적", event_date: "2026-10-28", note: null },
];

// ---------- 가설 장부 ----------
export const SEED_PREDICTIONS: Prediction[] = [
  { id: 1, code: "005930", statement: "288,000 맞고 한 번 떨어진 뒤 C 박스 형성", deadline: "2026-09-30", outcome: "288,000 미돌파 후 -13% 조정, C 박스 진행 중", hit: true, created_at: "2026-08-20T21:00:00+09:00", resolved_at: "2026-09-30T18:00:00+09:00" },
  { id: 2, code: "005930", statement: "10월 중 피봇 288,000 장중 돌파 + 거래량 동반", deadline: "2026-10-31", outcome: null, hit: null, created_at: "2026-10-01T21:00:00+09:00", resolved_at: null },
];

// ---------- 시장 신호 ----------
export const SEED_REGIME: MarketRegime[] = [
  {
    as_of: SEED_AS_OF, signal: "reduce",
    kospi_close: 3420.5, kospi_ma200: 3215.2, kospi_ma200_slope_pct: 1.8,
    kosdaq_close: 812.3, kosdaq_ma200: 790.1, kosdaq_ma200_slope_pct: 0.4,
    vkospi: 24.8, lev_etf_turnover_share_pct: 9.2,
    reasons: ["코스피·코스닥 200일선 위, 기울기 상승", "VKOSPI 24.8 → 축소 (임계값 미확정)", "단일종목 레버리지 ETF 거래대금 비중 9.2% → 축소 (임계값 미확정)"],
    is_seed: true,
  },
  {
    as_of: "2026-10-02", signal: "reduce",
    kospi_close: 3388.1, kospi_ma200: 3209.0, kospi_ma200_slope_pct: 1.7,
    kosdaq_close: 805.0, kosdaq_ma200: 789.4, kosdaq_ma200_slope_pct: 0.4,
    vkospi: 25.9, lev_etf_turnover_share_pct: 10.1,
    reasons: ["VKOSPI 25.9 → 축소 (임계값 미확정)"],
    is_seed: true,
  },
];

// ---------- 일봉 (전부 가짜) ----------
// 삼성전자: 1월 380,000 → 4월 저점 189,200 → 7월 288,000 → 8~10월 250,000~288,000 박스
export const SEED_CANDLES: Candle[] = [
  ...makeCandles("005930", 5930, [[0, 362000], [12, 380000], [70, 189200], [135, 288000], [160, 252000], [175, 281000], [190, 250000], [199, 257000]], 200, 100, 22000000),
  ...makeCandles("999901", 9901, [[0, 31000], [60, 42000], [90, 36000], [130, 52000], [150, 49500], [175, 54800], [199, 53200]], 200, 100, 900000),
  ...makeCandles("999902", 9902, [[0, 12000], [80, 24500], [120, 19000], [150, 26800], [199, 21400]], 200, 50, 1500000),
  ...makeCandles("999903", 9903, [[0, 72000], [90, 98000], [140, 131500], [170, 118000], [199, 128000]], 200, 100, 600000),
  ...makeCandles("999904", 9904, [[0, 29000], [100, 44800], [150, 46500], [170, 40000], [199, 36300]], 200, 50, 800000),
];
