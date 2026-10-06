import "server-only";
import type {
  Stock, Thesis, Setup, Position, OrderLog, MarketEvent, MarketRegime, Candle, StageLog, Stage, StockSummary, StockDetail, Author,
} from "./types";
import { hasSupabase, supabaseAdmin } from "./supabase";
import {
  SEED_STOCKS, SEED_THESES, SEED_SETUPS, SEED_POSITIONS, SEED_ORDERS, SEED_EVENTS, SEED_REGIME, SEED_CANDLES, SEED_STAGE_LOG,
} from "./seed-data";
import { daysBetween, todayKST } from "./format";
import { universeGuard } from "./guards";

export interface Repo {
  readonly mode: "supabase" | "seed";
  latestRegime(): Promise<MarketRegime | null>;
  summaries(): Promise<StockSummary[]>;
  detail(code: string): Promise<StockDetail | null>;
  orders(limit?: number): Promise<OrderLog[]>;
  upcomingEvents(days: number): Promise<MarketEvent[]>;
  violationFreeDays(): Promise<{ days: number; since: string | null; total: number; violations: number }>;
  moveStage(code: string, to: Stage, reason: string, actor: Author): Promise<{ ok: true } | { ok: false; error: string }>;
}


function computeViolationFree(orders: OrderLog[]) {
  const sorted = [...orders].sort((a, b) => a.ts.localeCompare(b.ts));
  const violations = sorted.filter((o) => o.is_violation || !o.rule_id);
  const last = violations.length ? violations[violations.length - 1].ts : null;
  const since = last ?? (sorted.length ? sorted[0].ts : null);
  const days = since ? daysBetween(since, todayKST()) : 0;
  return { days, since, total: sorted.length, violations: violations.length };
}

// ----------------------------------------------------------------------------
// 시드 모드 (Supabase 환경변수 없을 때). 프로세스 메모리에서만 바뀐다.
// ----------------------------------------------------------------------------
class SeedRepo implements Repo {
  readonly mode = "seed" as const;
  private stocks = SEED_STOCKS.map((s) => ({ ...s }));
  private stageLog = [...SEED_STAGE_LOG];

  private latestSetup(code: string) {
    return SEED_SETUPS.filter((s) => s.code === code).sort((a, b) => b.as_of.localeCompare(a.as_of))[0] ?? null;
  }
  private latestThesis(code: string) {
    return SEED_THESES.filter((t) => t.code === code).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }
  private openPosition(code: string) {
    return SEED_POSITIONS.find((p) => p.code === code && !p.closed_at) ?? null;
  }
  private closes(code: string) {
    const c = SEED_CANDLES.filter((x) => x.code === code);
    return { last: c[c.length - 1]?.close ?? null, prev: c[c.length - 2]?.close ?? null };
  }
  private summary(stock: Stock): StockSummary {
    const { last, prev } = this.closes(stock.code);
    return { stock, thesis: this.latestThesis(stock.code), setup: this.latestSetup(stock.code), position: this.openPosition(stock.code), last_close: last, prev_close: prev };
  }

  async latestRegime() {
    return [...SEED_REGIME].sort((a, b) => b.as_of.localeCompare(a.as_of))[0] ?? null;
  }
  async summaries() {
    return this.stocks.map((s) => this.summary(s));
  }
  async detail(code: string) {
    const stock = this.stocks.find((s) => s.code === code);
    if (!stock) return null;
    return {
      ...this.summary(stock),
      candles: SEED_CANDLES.filter((c) => c.code === code),
      events: SEED_EVENTS.filter((e) => e.code === code || e.code === null).sort((a, b) => a.event_date.localeCompare(b.event_date)),
      stage_log: this.stageLog.filter((l) => l.code === code).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      orders: SEED_ORDERS.filter((o) => o.code === code).sort((a, b) => b.ts.localeCompare(a.ts)),
    };
  }
  async orders(limit = 200) {
    return [...SEED_ORDERS].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
  }
  async upcomingEvents(days: number) {
    const t = todayKST();
    return SEED_EVENTS.filter((e) => e.event_date >= t && daysBetween(t, e.event_date) <= days).sort((a, b) => a.event_date.localeCompare(b.event_date));
  }
  async violationFreeDays() {
    return computeViolationFree(SEED_ORDERS);
  }
  async moveStage(code: string, to: Stage, reason: string, actor: Author) {
    const stock = this.stocks.find((s) => s.code === code);
    if (!stock) return { ok: false as const, error: "종목 없음" };
    if (to === "universe") {
      const err = universeGuard(this.latestThesis(code));
      if (err) return { ok: false as const, error: err };
    }
    const from = stock.stage;
    const now = new Date().toISOString();
    stock.stage = to;
    stock.stage_changed_at = now;
    stock.stage_reason = reason;
    this.stageLog.push({ id: this.stageLog.length + 1, code, from_stage: from, to_stage: to, reason, actor, created_at: now });
    return { ok: true as const };
  }
}

// ----------------------------------------------------------------------------
// Supabase 모드
// ----------------------------------------------------------------------------
type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function rowToStock(r: Row): Stock {
  return { code: r.code as string, name: r.name as string, market: r.market as Stock["market"], sector: (r.sector as string) ?? null, stage: r.stage as Stage, stage_changed_at: r.stage_changed_at as string, stage_reason: (r.stage_reason as string) ?? null, is_seed: Boolean(r.is_seed) };
}
function rowToThesis(r: Row): Thesis {
  return { id: Number(r.id), code: r.code as string, hypothesis: r.hypothesis as string, invalidation_conditions: (r.invalidation_conditions as Thesis["invalidation_conditions"]) ?? [], author: r.author as Author, status: r.status as Thesis["status"], created_at: r.created_at as string, updated_at: r.updated_at as string };
}
function rowToSetup(r: Row): Setup {
  return {
    id: Number(r.id), code: r.code as string, as_of: r.as_of as string, setup_type: r.setup_type as Setup["setup_type"],
    footprint_weeks: num(r.footprint_weeks), max_contraction_pct: num(r.max_contraction_pct), min_contraction_pct: num(r.min_contraction_pct), t_count: num(r.t_count),
    pivot: num(r.pivot), cbox_high: num(r.cbox_high), cbox_low: num(r.cbox_low), cbox_start: (r.cbox_start as string) ?? null,
    volume_dry_days: num(r.volume_dry_days),
    trend_template: (r.trend_template as Setup["trend_template"]) ?? [], trend_template_score: Number(r.trend_template_score ?? 0),
    checklist: (r.checklist as Setup["checklist"]) ?? [], checklist_score: Number(r.checklist_score ?? 0),
    drawdown_pct: num(r.drawdown_pct), market_drawdown_pct: num(r.market_drawdown_pct), drawdown_vs_market: num(r.drawdown_vs_market),
    notes: (r.notes as string) ?? null,
  };
}
function rowToPosition(r: Row): Position {
  return { id: Number(r.id), code: r.code as string, qty: Number(r.qty), avg_price: Number(r.avg_price), stop_price: Number(r.stop_price), state: r.state as Position["state"], entry_rule_id: (r.entry_rule_id as string) ?? null, opened_at: r.opened_at as string, closed_at: (r.closed_at as string) ?? null, updated_at: r.updated_at as string };
}
function rowToOrder(r: Row): OrderLog {
  return { id: Number(r.id), ts: r.ts as string, code: r.code as string, side: r.side as OrderLog["side"], qty: Number(r.qty), price: Number(r.price), rule_id: (r.rule_id as string) ?? null, rule_text: (r.rule_text as string) ?? null, is_violation: Boolean(r.is_violation), note: (r.note as string) ?? null };
}
function rowToEvent(r: Row): MarketEvent {
  return { id: Number(r.id), code: (r.code as string) ?? null, event_type: r.event_type as MarketEvent["event_type"], title: r.title as string, event_date: r.event_date as string, note: (r.note as string) ?? null };
}
function rowToRegime(r: Row): MarketRegime {
  return { as_of: r.as_of as string, signal: r.signal as MarketRegime["signal"], kospi_close: num(r.kospi_close), kospi_ma200: num(r.kospi_ma200), kospi_ma200_slope_pct: num(r.kospi_ma200_slope_pct), kosdaq_close: num(r.kosdaq_close), kosdaq_ma200: num(r.kosdaq_ma200), kosdaq_ma200_slope_pct: num(r.kosdaq_ma200_slope_pct), vkospi: num(r.vkospi), lev_etf_turnover_share_pct: num(r.lev_etf_turnover_share_pct), reasons: (r.reasons as string[]) ?? [] };
}
function rowToCandle(r: Row): Candle {
  return { code: r.code as string, date: r.date as string, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume) };
}
function rowToStageLog(r: Row): StageLog {
  return { id: Number(r.id), code: r.code as string, from_stage: (r.from_stage as Stage) ?? null, to_stage: r.to_stage as Stage, reason: (r.reason as string) ?? null, actor: r.actor as Author, created_at: r.created_at as string };
}

class SupabaseRepo implements Repo {
  readonly mode = "supabase" as const;
  private db = supabaseAdmin();

  private async latestPerCode<T extends { code: string }>(table: string, orderCol: string, map: (r: Row) => T, codes?: string[]): Promise<Map<string, T>> {
    let q = this.db.from(table).select("*").order(orderCol, { ascending: false });
    if (codes) q = q.in("code", codes);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const m = new Map<string, T>();
    for (const r of (data ?? []) as Row[]) {
      const v = map(r);
      if (!m.has(v.code)) m.set(v.code, v);
    }
    return m;
  }

  private async lastCloses(codes: string[]): Promise<Map<string, { last: number | null; prev: number | null }>> {
    const m = new Map<string, { last: number | null; prev: number | null }>();
    await Promise.all(codes.map(async (code) => {
      const { data } = await this.db.from("sb_candles").select("close").eq("code", code).order("date", { ascending: false }).limit(2);
      const rows = (data ?? []) as Row[];
      m.set(code, { last: rows[0] ? Number(rows[0].close) : null, prev: rows[1] ? Number(rows[1].close) : null });
    }));
    return m;
  }

  async latestRegime() {
    const { data, error } = await this.db.from("sb_market_regime").select("*").order("as_of", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ? rowToRegime(data[0] as Row) : null;
  }

  async summaries() {
    const { data, error } = await this.db.from("sb_stocks").select("*").order("stage_changed_at", { ascending: false });
    if (error) throw new Error(error.message);
    const stocks = ((data ?? []) as Row[]).map(rowToStock);
    const codes = stocks.map((s) => s.code);
    if (!codes.length) return [];
    const [theses, setups, closes] = await Promise.all([
      this.latestPerCode("sb_theses", "created_at", rowToThesis, codes),
      this.latestPerCode("sb_setups", "as_of", rowToSetup, codes),
      this.lastCloses(codes),
    ]);
    const { data: pos } = await this.db.from("sb_positions").select("*").is("closed_at", null).in("code", codes);
    const positions = new Map(((pos ?? []) as Row[]).map(rowToPosition).map((p) => [p.code, p]));
    return stocks.map((stock) => ({
      stock,
      thesis: theses.get(stock.code) ?? null,
      setup: setups.get(stock.code) ?? null,
      position: positions.get(stock.code) ?? null,
      last_close: closes.get(stock.code)?.last ?? null,
      prev_close: closes.get(stock.code)?.prev ?? null,
    }));
  }

  async detail(code: string) {
    const { data: s } = await this.db.from("sb_stocks").select("*").eq("code", code).maybeSingle();
    if (!s) return null;
    const stock = rowToStock(s as Row);
    const [thesis, setup, position, candles, events, stageLog, orders] = await Promise.all([
      this.db.from("sb_theses").select("*").eq("code", code).order("created_at", { ascending: false }).limit(1),
      this.db.from("sb_setups").select("*").eq("code", code).order("as_of", { ascending: false }).limit(1),
      this.db.from("sb_positions").select("*").eq("code", code).is("closed_at", null).limit(1),
      this.db.from("sb_candles").select("*").eq("code", code).order("date", { ascending: true }).limit(400),
      this.db.from("sb_events").select("*").or(`code.eq.${code},code.is.null`).order("event_date", { ascending: true }),
      this.db.from("sb_stage_log").select("*").eq("code", code).order("created_at", { ascending: false }).limit(30),
      this.db.from("sb_orders_log").select("*").eq("code", code).order("ts", { ascending: false }).limit(50),
    ]);
    const c = ((candles.data ?? []) as Row[]).map(rowToCandle);
    return {
      stock,
      thesis: thesis.data?.[0] ? rowToThesis(thesis.data[0] as Row) : null,
      setup: setup.data?.[0] ? rowToSetup(setup.data[0] as Row) : null,
      position: position.data?.[0] ? rowToPosition(position.data[0] as Row) : null,
      last_close: c[c.length - 1]?.close ?? null,
      prev_close: c[c.length - 2]?.close ?? null,
      candles: c,
      events: ((events.data ?? []) as Row[]).map(rowToEvent),
      stage_log: ((stageLog.data ?? []) as Row[]).map(rowToStageLog),
      orders: ((orders.data ?? []) as Row[]).map(rowToOrder),
    };
  }

  async orders(limit = 200) {
    const { data, error } = await this.db.from("sb_orders_log").select("*").order("ts", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(rowToOrder);
  }

  async upcomingEvents(days: number) {
    const t = todayKST();
    const end = new Date(t + "T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + days);
    const { data } = await this.db.from("sb_events").select("*").gte("event_date", t).lte("event_date", end.toISOString().slice(0, 10)).order("event_date", { ascending: true });
    return ((data ?? []) as Row[]).map(rowToEvent);
  }

  async violationFreeDays() {
    const { data } = await this.db.from("sb_orders_log").select("ts, rule_id, is_violation").order("ts", { ascending: true });
    const orders = ((data ?? []) as Row[]).map((r) => ({ ts: r.ts as string, rule_id: (r.rule_id as string) ?? null, is_violation: Boolean(r.is_violation) })) as OrderLog[];
    return computeViolationFree(orders);
  }

  async moveStage(code: string, to: Stage, reason: string, actor: Author) {
    const { data: s } = await this.db.from("sb_stocks").select("stage").eq("code", code).maybeSingle();
    if (!s) return { ok: false as const, error: "종목 없음" };
    const from = (s as Row).stage as Stage;
    if (to === "universe") {
      const { data: t } = await this.db.from("sb_theses").select("*").eq("code", code).order("created_at", { ascending: false }).limit(1);
      const err = universeGuard(t?.[0] ? rowToThesis(t[0] as Row) : null);
      if (err) return { ok: false as const, error: err };
    }
    const { error } = await this.db.from("sb_stocks").update({ stage: to, stage_reason: reason, stage_changed_at: new Date().toISOString() }).eq("code", code);
    if (error) return { ok: false as const, error: error.message };
    await this.db.from("sb_stage_log").insert({ code, from_stage: from, to_stage: to, reason, actor });
    return { ok: true as const };
  }
}

let repo: Repo | null = null;
export function getRepo(): Repo {
  if (!repo) repo = hasSupabase() ? new SupabaseRepo() : new SeedRepo();
  return repo;
}
