/**
 * 시드 데이터. Supabase 연결이 없을 때 사이트가 그대로 쓰고,
 * scripts/seed.ts 가 같은 데이터를 Supabase에 넣는다. (단일 출처)
 *
 * 삼성전자는 KB 수동 보유(봇 대상 아님). 체결 이력은 재구성 불가라 화면으로 확인된 잔고 스냅샷만 넣는다
 * (swingbot_erratum_2_2026-10-06). 9/22 이후 미확인 → 비움이 실제 숫자를 주면 교체. 일봉은 가짜다.
 * 나머지 4종목은 완전히 가짜(이름 앞에 [가짜]).
 */
import type {
  Stock, Thesis, Setup, Position, OrderLog, MarketEvent, Prediction, MarketRegime, Candle, StageLog, CheckItem, Settings, BalanceSnapshot, Proposal, RiskLog, Signal,
} from "./types";
import { TREND_TEMPLATE_ITEMS, CHECKLIST_ITEMS } from "./constants";
import { candleStats } from "./setup-calc";

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

/** 앵커(날짜→가격)를 선형 보간한 뒤 노이즈를 얹어 일봉을 만든다. 고점·저점 앵커는 그날 고가·저가가 앵커값이 되게 맞춘다. */
function makeCandles(code: string, seed: number, dateAnchors: [string, number][], n: number, tick: number, baseVol: number, clamp?: [number, number]): Candle[] {
  const rnd = mulberry32(seed);
  const days = tradingDays(SEED_AS_OF, n);
  const idx = (d: string) => { let i = days.findIndex((x) => x >= d); return i < 0 ? n - 1 : i; };
  const anchors: [number, number][] = dateAnchors.map(([d, p]) => [idx(d), p]);
  const pinned = new Map(anchors.map(([i, p]) => [i, p]));
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
    const pin = pinned.get(i);
    const c: Candle = { code, date: days[i], open, high: hi, low: lo, close, volume, source: "seed" };
    if (pin !== undefined) {
      // 앵커 날엔 앵커값이 그날의 극값(고점이면 고가, 저점이면 저가)이 되도록
      if (pin >= trend) { c.high = Math.max(c.high, pin); c.close = round(Math.min(c.close, pin)); }
      else { c.low = Math.min(c.low, pin); c.close = round(Math.max(c.close, pin)); }
    }
    if (clamp) {
      // 앵커 날만 극값에 닿고, 나머지 날은 한 틱 안쪽으로
      const hiCap = pin === clamp[1] ? clamp[1] : clamp[1] - tick;
      const loCap = pin === clamp[0] ? clamp[0] : clamp[0] + tick;
      c.high = Math.min(c.high, hiCap); c.low = Math.max(c.low, loCap);
      c.open = Math.min(Math.max(c.open, c.low), c.high); c.close = Math.min(Math.max(c.close, c.low), c.high);
    }
    out.push(c);
    prevClose = c.close;
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
  { id: 1, code: "005930", from_stage: null, to_stage: "review", reason: "시드: KB 수동 보유 중, 가설 초안(claude_code) 비움 미승인. 봇 계좌 기준으론 아직 유니버스 아님", actor: "claude_code", created_at: "2026-10-06T09:00:00+09:00" },
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
    id: 1, code: "005930", author: "claude_code", status: "draft",
    hypothesis: "3분기 컨센서스 사상 최대(FnGuide 매출 200조7657억, 영업이익 106조9435억, 2026-10-06 보도). 최근 원화 강세로 전망치 소폭 하향 분석 있음. 가격은 3C 베이스 진행 중(A 380,000→189,200, B 288,000 회복, C 후보 아직 넓음). C 박스 고점 288,000 돌파 시 2단계 재개가 가설. 10/8 잠정실적 결과 확인 후 승인.",
    hypothesis_plain: "회사 실적은 역대 최고로 예상돼요. 가격은 큰 폭락 뒤 절반쯤 되찾고 지금 숨 고르는 중이에요. 288,000원 문턱을 거래량과 함께 넘으면 다시 오르막이 시작된다고 보는 거예요. 10월 8일 실적 발표를 보고 나서 승인하세요.",
    invalidation_conditions: [
      { text: "288,000 돌파 실패 후 C 박스 하단(250,000) 종가 이탈", violated: false, note: null, plain: "문턱을 못 넘고 250,000원 아래에서 하루를 마치면 틀린 거예요." },
      { text: "HBM4 주요 고객 인증 지연 공식 발표", violated: false, note: null, plain: "핵심 제품(HBM4)이 큰 고객 검사를 통과 못 했다고 회사가 공식 발표하면 틀린 거예요." },
      { text: "3분기 영업이익이 컨센서스 10% 이상 하회 (FnGuide 106조9435억 기준 약 96.2조 이하). 10/8 잠정실적으로 검증", violated: false, note: null, plain: "10월 8일 발표한 영업이익이 96조 2천억 원보다 적으면 틀린 거예요." },
      { text: "필라델피아 반도체지수 대비 상대강도 3개월 연속 하위", violated: false, note: null, plain: "미국 반도체 지수보다 석 달 내리 못 오르면 틀린 거예요." },
    ],
    created_at: "2026-10-06T09:00:00+09:00", updated_at: "2026-10-06T09:00:00+09:00",
  },
  {
    id: 2, code: "999902", author: "claude_code", status: "draft",
    hypothesis: "[가짜] 신약 3상 결과 발표 전 기관 매집. 2분기 연속 컨센서스 상회.",
    hypothesis_plain: null,
    invalidation_conditions: [],   // 비어 있음 → 유니버스 승인 불가 상태를 보여주는 카드
    created_at: "2026-10-02T09:30:00+09:00", updated_at: "2026-10-02T09:30:00+09:00",
  },
  {
    id: 3, code: "999903", author: "claude_code", status: "valid",
    hypothesis: "[가짜] LNG선 수주 잔고 3년치 + 신조선가 상승. 4~7주 플랫 베이스 고점 돌파 대기. (가짜 카드라 '유효' 상태로 둠)",
    hypothesis_plain: "[가짜] 배 주문이 3년치 밀려 있고 배값도 오르고 있어요. 평평하게 쉬는 곳의 윗가격을 넘으면 사요.",
    invalidation_conditions: [
      { text: "신조선가 지수 2개월 연속 하락", violated: false, note: null },
      { text: "베이스 하단(-12%) 종가 이탈", violated: false, note: null },
    ],
    created_at: "2026-09-29T20:00:00+09:00", updated_at: "2026-09-29T20:00:00+09:00",
  },
  {
    id: 4, code: "999904", author: "claude_code", status: "suspect",
    hypothesis: "[가짜] 중동 리스크로 유가 90달러 이상 유지 시 정제 마진 확대.",
    hypothesis_plain: "[가짜] 기름값이 비싸게 유지되면 돈을 더 번다는 가설이었어요.",
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
    footprint_weeks: 0, max_contraction_pct: 50.2, min_contraction_pct: 13, t_count: 3,
    pivot: 288000, cbox_high: 288000, cbox_low: 250000, cbox_start: "2026-08-04",
    volume_dry_days: 9,
    trend_template: tt([true, true, false, true, true, true, true, false], ["257,000 > 231,000·214,000", null, "200일선 상승 3주", null, null, null, null, "SOX 대비 하위"]),
    trend_template_score: 0,
    checklist: cl([true, true, false, true, true, false, false]),
    checklist_score: 0,
    drawdown_pct: 0, market_drawdown_pct: -6.5, drawdown_vs_market: 0, benchmark: "SOX",
    notes: "C 후보: 288,000 이후 약 25만까지 -13% 흔들려 아직 넓음(10% 안으로 좁아져야 진짜 C). 거래량 7월 1억 주 → 9월 1,600만~2,800만 주로 축소. 위에 325,000·380,000에 본전 기다리는 사람들 있음.",
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
].map((s) => ({ ...s, high_52w: null, high_52w_date: null, low_52w: null, low_52w_date: null, base_start: null, data_source: "seed" as const, trend_template_score: 0, checklist_score: 0 })) as Setup[];

// ---------- 포지션 ----------
export const SEED_POSITIONS: Position[] = [
  { id: 1, code: "005930", account: "kb_manual", qty: 13, avg_price: 257575, stop_price: null, state: "manual", entry_rule_id: null, is_unverified: true, note: "KB 계좌 수동 보유. 봇 상태 머신·손절 자동화 대상 아님. 9/22 10:41 확인값(13주, 평단 257,575). 이후 변동 미확인 — 비움이 현재 수량·평단을 주면 교체", initial_stop_price: null, exit_price: null, realized_pnl: null, r_multiple: null, opened_at: "2026-08-13T09:00:00+09:00", closed_at: null, updated_at: "2026-09-22T10:41:00+09:00" },
  { id: 2, code: "999904", account: "kis_bot", qty: 0, avg_price: 41200, stop_price: 36000, state: "closed", entry_rule_id: "EN-3", is_unverified: false, note: "[가짜]", initial_stop_price: 38700, exit_price: 38600, realized_pnl: -26000, r_multiple: -1.04, opened_at: "2026-09-15T09:40:00+09:00", closed_at: "2026-09-29T09:02:00+09:00", updated_at: "2026-09-29T09:02:00+09:00" },
];

/** 확인된 시점의 잔고 스냅샷 (체결가·체결일은 지어내지 않는다) */
export const SEED_SNAPSHOTS: BalanceSnapshot[] = [
  { id: 1, account: "kb_manual", code: "005930", as_of: "2026-08-18T09:00:00+09:00", qty: 1, avg_price: null, market_price: null, cash: null, total_value: null, note: "8/18 오전 잔고: 정찰병 1주, +6.19% (8/13 전후 매수)" },
  { id: 2, account: "kb_manual", code: "005930", as_of: "2026-08-18T15:14:00+09:00", qty: 10, avg_price: 268400, market_price: 267500, cash: null, total_value: null, note: "10주 오주문 (계획 1주). 매입금액 약 2,684,190원 → EN-8 신설 계기" },
  { id: 3, account: "kb_manual", code: "005930", as_of: "2026-08-26T09:43:00+09:00", qty: 10, avg_price: 259609, market_price: null, cash: null, total_value: null, note: "8/18 이후 일부 매도·재매수 추정, 미확인" },
  { id: 4, account: "kb_manual", code: "005930", as_of: "2026-09-04T10:11:00+09:00", qty: 13, avg_price: 257575, market_price: null, cash: 2900000, total_value: null, note: "3주 추가: 국장 총액 증가(예수금 168만→290만)에 따른 수동 비중 조정. 정찰병 규칙 매수 아님" },
  { id: 5, account: "kb_manual", code: "005930", as_of: "2026-09-22T10:41:00+09:00", qty: 13, avg_price: 257575, market_price: 279250, cash: null, total_value: null, note: "마지막 확인. 이후 미확인" },
  { id: 6, account: "kis_bot", code: null, as_of: "2026-09-15T08:30:00+09:00", qty: null, avg_price: null, market_price: null, cash: 6200000, total_value: 6200000, note: "[가짜] 봇 계좌 시작 잔고" },
  { id: 7, account: "kis_bot", code: null, as_of: "2026-10-06T15:40:00+09:00", qty: null, avg_price: null, market_price: null, cash: 6174000, total_value: 6174000, note: "[가짜] 종가 기준" },
];

// ---------- 제안 (변경 문). 가짜 1건: 브레인이 설정 변경을 제안한 모양 ----------
export const SEED_PROPOSALS: Proposal[] = [
  { id: 1, kind: "setting", target: "regime_vkospi_reduce", current_value: null, proposed_value: "22", reason: "[가짜] 최근 60거래일 VKOSPI 분포에서 상위 25% 경계가 22. 그 위에서 코스피 5일 수익률 중앙값이 마이너스", evidence: "[가짜] 4단계 검증 노트 2026-10-06 (7월 폭락 구간에서 관망 판정 확인 전)", plain: "시장 불안 지수가 22를 넘으면 '흐림'으로 보자는 제안이에요. 지금은 기준이 비어 있어요.", proposer: "brain", status: "pending", approved_at: null, apply_at: null, applied_at: null, decision_note: null, created_at: "2026-10-07T07:10:00+09:00" },
];

// ---------- 리스크 다이얼 일지 (봇이 매일 장 전 기록) ----------
export const SEED_RISK_LOG: RiskLog[] = [
  { as_of: SEED_AS_OF, level: "normal", prev_level: "normal", market_signal: "reduce", consecutive_losses: 1, trades_total: 1, ev_30_r: null, reasons: ["[가짜] 종료 거래 1건이라 30거래 기댓값 미산출", "시장 흐림이지만 연속 손절 1회라 하향 조건 미충족", "과감 상향은 30거래 전엔 불가"] },
];

// ---------- 규칙 신호 (기회 횟수 지표) ----------
export const SEED_SIGNALS: Signal[] = [
  { id: 1, code: "999904", signal_date: "2026-09-15", kind: "pivot_breakout", entered: true, skip_reason: null, note: "[가짜]" },
  { id: 2, code: "999903", signal_date: "2026-09-30", kind: "pivot_breakout", entered: false, skip_reason: "거래량 미달 (개장 2시간 누적 < 50일 평균 50%)", note: "[가짜]" },
  { id: 3, code: "999901", signal_date: "2026-10-02", kind: "pivot_breakout", entered: false, skip_reason: "유니버스 아님 (레이더)", note: "[가짜]" },
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
  max_weight_per_stock_pct: "20",     // v1 Claude 초기값: '나만의 ETF 최소 5종목'
  max_weight_per_sector_pct: "40",
  uv4_drawdown_pct: "60",
  uv4_market_multiple: "2",           // 책 범위 2~3배 중 엄격한 쪽
  long_closure_trading_days: "2",     // 주말 제외 연속 휴장 거래일
  risk_level: "normal",
  risk_stock_pct_caution: "10", risk_stock_pct_normal: "20", risk_stock_pct_bold: "30",
  risk_trade_pct_caution: "0.6", risk_trade_pct_normal: "1.2", risk_trade_pct_bold: "1.8",
  risk_min_trades_for_bold: "30", risk_consecutive_loss_down: "2",
  target_return_pct_min: "20", target_return_pct_max: "30",
  universe_target_stocks: "30", universe_target_sectors: "8", universe_sector_warn_pct: "40",
  regime_vkospi_reduce: null,
  regime_vkospi_wait: null,
  regime_lev_etf_share_reduce: null,
  regime_ma200_slope_min_pct: null,
};

// ---------- 이벤트 ----------
export const SEED_EVENTS: MarketEvent[] = [
  { id: 1, code: "005930", event_type: "earnings", title: "3분기 잠정실적 발표 (10/8 목)", event_date: "2026-10-08", note: "FnGuide 컨센서스 매출 200조7657억·영업이익 106조9435억. EV-1: 발표 전 축소 여부 비움 승인", source: "news:파이낸셜포스트·국제뉴스 2026-10-06" },
  { id: 2, code: null, event_type: "macro", title: "미국 CPI 발표", event_date: "2026-10-14", note: null, source: "seed" },
  { id: 3, code: null, event_type: "holiday", title: "한글날 휴장", event_date: "2026-10-09", note: "하루 휴장. 손절선 하루 미작동", source: "krx_calendar" },
  { id: 4, code: "999903", event_type: "earnings", title: "[가짜] 3분기 실적", event_date: "2026-10-28", note: null, source: "seed" },
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
  // 삼성전자: 6/19 고점 380,000 → 7/6 325,000 → 7/29 저점 189,200 → 8월 288,000 → 9/21 273,000 → 10/6 약 257,000 (모양만 실제, 값은 가짜)
  ...makeCandles("005930", 5930, [["2025-09-20", 230000], ["2026-01-15", 250000], ["2026-04-20", 310000], ["2026-06-19", 380000], ["2026-07-06", 325000], ["2026-07-29", 189200], ["2026-08-20", 288000], ["2026-09-05", 252000], ["2026-09-21", 273000], ["2026-10-06", 257000]], 260, 100, 22000000, [189200, 380000]),
  ...makeCandles("999901", 9901, [["2025-12-15", 31000], ["2026-03-10", 42000], ["2026-04-20", 36000], ["2026-06-15", 52000], ["2026-07-15", 49500], ["2026-08-20", 54800], ["2026-10-06", 53200]], 260, 100, 900000),
  ...makeCandles("999902", 9902, [["2025-12-15", 12000], ["2026-04-01", 24500], ["2026-06-01", 19000], ["2026-07-20", 26800], ["2026-10-06", 21400]], 260, 50, 1500000),
  ...makeCandles("999903", 9903, [["2025-12-15", 72000], ["2026-04-15", 98000], ["2026-07-01", 131500], ["2026-08-25", 118000], ["2026-10-06", 128000]], 260, 100, 600000),
  ...makeCandles("999904", 9904, [["2025-12-15", 29000], ["2026-05-01", 44800], ["2026-07-10", 46500], ["2026-08-15", 40000], ["2026-10-06", 36300]], 260, 50, 800000),
];

// ---------- 일봉 기반 재계산 (52주 = 252거래일, 베이스 시작 = 직전 2단계 고점) ----------
for (const su of SEED_SETUPS) {
  const st = candleStats(SEED_CANDLES.filter((c) => c.code === su.code));
  if (!st) continue;
  su.high_52w = st.high_52w; su.high_52w_date = st.high_52w_date;
  su.low_52w = st.low_52w; su.low_52w_date = st.low_52w_date;
  su.base_start = st.base_start;
  su.footprint_weeks = st.footprint_weeks;
  su.drawdown_pct = st.drawdown_pct;
  su.drawdown_vs_market = su.market_drawdown_pct ? Math.round((st.drawdown_pct / su.market_drawdown_pct) * 10) / 10 : null;
  if (!st.has_52w) {
    // 실제 252거래일 없음 → 52주 항목 판정 보류 (회색, 점수 제외)
    for (const k of ["tt6", "tt7"]) {
      const it = su.trend_template.find((i) => i.key === k);
      if (it) { it.pass = false; it.pending = true; it.value = `데이터 부족 (실제 일봉 ${st.candles_count}거래일 / 252 필요)`; }
    }
    su.trend_template_score = score(su.trend_template);
    su.checklist_score = score(su.checklist);
    continue;
  }
  const tt6 = su.trend_template.find((i) => i.key === "tt6");
  const tt7 = su.trend_template.find((i) => i.key === "tt7");
  if (tt6) { tt6.pass = st.pct_from_low >= 25; tt6.value = `52주 저가 ${st.low_52w!.toLocaleString("ko-KR")}(${st.low_52w_date!.slice(5)}) 대비 ${st.pct_from_low >= 0 ? "+" : ""}${st.pct_from_low}%`; }
  if (tt7) { tt7.pass = st.pct_from_high >= -25; tt7.value = `52주 고가 ${st.high_52w!.toLocaleString("ko-KR")}(${st.high_52w_date!.slice(5)}) 대비 ${st.pct_from_high}%`; }
  su.trend_template_score = score(su.trend_template);
  su.checklist_score = score(su.checklist);
}
