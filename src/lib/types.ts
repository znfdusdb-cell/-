export type Stage = "radar" | "review" | "universe" | "holding" | "exited";
export type Market = "KOSPI" | "KOSDAQ";
export type ThesisStatus = "draft" | "valid" | "suspect" | "discarded";
export type Author = "brain" | "bium" | "bot" | "claude_code";
export type SetupType = "vcp" | "cup3c" | "flat" | "power_play" | "none";
export type PositionState =
  | "scout"
  | "tranche1"
  | "tranche2"
  | "tranche3"
  | "squat_wait"
  | "reset_watch"
  | "closed"
  | "manual";
export type Account = "kis_bot" | "kb_manual";
export type Side = "buy" | "sell";
export type OrderSource = "bot" | "manual";
export type RegimeSignal = "trade" | "reduce" | "wait";
export type EventType = "earnings" | "holiday" | "macro" | "other";

export interface Stock {
  code: string;
  name: string;
  market: Market;
  sector: string | null;
  stage: Stage;
  stage_changed_at: string;
  stage_reason: string | null;
  is_seed: boolean;
}

export interface StageLog {
  id: number;
  code: string;
  from_stage: Stage | null;
  to_stage: Stage;
  reason: string | null;
  actor: Author;
  created_at: string;
}

export interface InvalidationCondition {
  text: string;
  violated: boolean;
  note?: string | null;
}

export interface Thesis {
  id: number;
  code: string;
  hypothesis: string;
  invalidation_conditions: InvalidationCondition[];
  author: Author;
  status: ThesisStatus;
  created_at: string;
  updated_at: string;
}

export interface CheckItem {
  key: string;
  label: string;
  pass: boolean;
  value?: string | null;
}

export interface Setup {
  id: number;
  code: string;
  as_of: string;
  setup_type: SetupType;
  footprint_weeks: number | null;
  max_contraction_pct: number | null;
  min_contraction_pct: number | null;
  t_count: number | null;
  pivot: number | null;
  cbox_high: number | null;
  cbox_low: number | null;
  cbox_start: string | null;
  high_52w: number | null;
  high_52w_date: string | null;
  low_52w: number | null;
  low_52w_date: string | null;
  base_start: string | null;
  volume_dry_days: number | null;
  trend_template: CheckItem[];
  trend_template_score: number;
  checklist: CheckItem[];
  checklist_score: number;
  drawdown_pct: number | null;
  market_drawdown_pct: number | null;
  drawdown_vs_market: number | null;
  benchmark: string | null;
  data_source: "bot" | "seed";
  notes: string | null;
}

export interface Position {
  id: number;
  code: string;
  account: Account;
  qty: number;
  avg_price: number;
  stop_price: number | null;
  state: PositionState;
  entry_rule_id: string | null;
  is_unverified: boolean;
  note: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
}

export interface OrderLog {
  id: number;
  ts: string;
  code: string;
  side: Side;
  qty: number;
  planned_qty: number | null;
  price: number;
  source: OrderSource;
  stop_price: number | null;
  target_price: number | null;
  account_balance_at: number | null;
  rule_id: string | null;
  rule_text: string | null;
  is_violation: boolean;
  note: string | null;
}

export interface MarketEvent {
  id: number;
  code: string | null;
  event_type: EventType;
  title: string;
  event_date: string;
  note: string | null;
  source: string;
}

export interface Prediction {
  id: number;
  code: string | null;
  statement: string;
  deadline: string;
  outcome: string | null;
  hit: boolean | null;
  created_at: string;
  resolved_at: string | null;
}

export interface MarketRegime {
  as_of: string;
  signal: RegimeSignal;
  kospi_close: number | null;
  kospi_ma200: number | null;
  kospi_ma200_slope_pct: number | null;
  kosdaq_close: number | null;
  kosdaq_ma200: number | null;
  kosdaq_ma200_slope_pct: number | null;
  vkospi: number | null;
  lev_etf_turnover_share_pct: number | null;
  reasons: string[];
  is_seed: boolean;
}

export interface Candle {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: "kis" | "seed";
}

export interface Rule {
  rule_id: string;
  category: string;
  title: string;
  description: string;
}

export interface StockSummary {
  stock: Stock;
  thesis: Thesis | null;
  setup: Setup | null;
  position: Position | null;
  last_close: number | null;
  prev_close: number | null;
}

export interface StockDetail extends StockSummary {
  snapshots: BalanceSnapshot[];
  candles: Candle[];
  events: MarketEvent[];
  stage_log: StageLog[];
  orders: OrderLog[];
}

/** sb_settings key/value. 값 null = 비움 미확정 */
export type Settings = Record<string, string | null>;

export interface BalanceSnapshot {
  id: number;
  account: Account;
  code: string | null;
  as_of: string;
  qty: number | null;
  avg_price: number | null;
  market_price: number | null;
  cash: number | null;
  note: string | null;
}

export interface Violation {
  order_id: number;
  rule_id: string;
  reason: string;
}

export type ViewMode = "easy" | "detail";

export interface Todo {
  kind: "approve_universe" | "approve_exit" | "approve_thesis" | "event_reduce";
  code: string;
  name: string;
  title: string;
  detail: string;
}
