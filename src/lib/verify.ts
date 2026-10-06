/**
 * 주문 기록을 규칙과 대조해 위반을 판정한다 (봇의 자진 신고 is_violation 과 별개).
 * 순수 함수. 사이트가 읽을 때마다 계산하고 저장하지 않는다.
 *
 * 판정 항목:
 *  UV-1 유니버스 밖 종목 매수        — 주문 시각의 단계를 sb_stage_log 로 복원
 *  EN-7 손실 중 추가매수(물타기)      — 같은 종목의 직전 평단보다 낮은 가격에 추가 매수
 *  EN-2 피봇 +3% 초과 추격           — 주문일 이전 최신 셋업의 피봇 대비
 *  EX-1 손절가 도달 후 미체결·지연     — 보유 중 일봉 저가가 손절선 이하인데 당일·익거래일 매도 없음
 *  EN-8 주문 수량 ≠ 계산 수량         — planned_qty 와 qty 불일치 또는 planned_qty 없음
 *  RR-1 손익비 미기록·2:1 미만         — 매수 주문의 stop_price/target_price
 *  SZ-1 종목당·업종당 비중 상한 초과   — 주문 시각 잔고(account_balance_at) 기준. 상한 미설정이면 판정 보류
 *  EV-2 휴장일 주문                   — KRX 달력 기준 비거래일
 *  RULE rule_id 없는 주문
 * 한계: 손절선은 트레일링으로 움직이므로 EX-1 은 포지션의 최종 손절선 기준 근사치다.
 */
import type { OrderLog, StageLog, Setup, Position, Candle, Violation, Stage, Settings, Stock } from "./types";
import { isTradingDay, holidayName, nextTradingDay } from "./krx-calendar";

export interface VerifyContext {
  orders: OrderLog[];
  stageLog: StageLog[];
  stocks: Pick<Stock, "code" | "stage" | "sector">[];
  setups: Setup[];      // 종목별 여러 as_of 가능
  positions: Position[];
  candles: Candle[];    // 보유 종목 일봉
  settings: Settings;
}

function stageAt(ctx: VerifyContext, code: string, ts: string): Stage | null {
  const logs = ctx.stageLog.filter((l) => l.code === code && l.created_at <= ts).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return logs[0]?.to_stage ?? ctx.stocks.find((s) => s.code === code)?.stage ?? null;
}

function setupBefore(ctx: VerifyContext, code: string, ts: string): Setup | null {
  const day = ts.slice(0, 10);
  const list = ctx.setups.filter((s) => s.code === code && s.as_of <= day).sort((a, b) => b.as_of.localeCompare(a.as_of));
  return list[0] ?? ctx.setups.filter((s) => s.code === code).sort((a, b) => b.as_of.localeCompare(a.as_of))[0] ?? null;
}

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
const numSetting = (s: Settings, k: string): number | null => (s[k] === null || s[k] === undefined || s[k] === "" ? null : Number(s[k]));

export function verifyOrders(ctx: VerifyContext): Violation[] {
  const out: Violation[] = [];
  const orders = [...ctx.orders].sort((a, b) => a.ts.localeCompare(b.ts));
  const start = ctx.settings.bot_started_at ?? "9999-12-31";
  const maxStock = numSetting(ctx.settings, "max_weight_per_stock_pct");
  const maxSector = numSetting(ctx.settings, "max_weight_per_sector_pct");
  const sectorOf = (code: string) => ctx.stocks.find((s) => s.code === code)?.sector ?? null;

  // 종목별 누적 보유 (매수 누적, 매도 차감) — 물타기·비중 판정용
  const hold = new Map<string, { qty: number; cost: number }>();

  for (const o of orders) {
    if (o.source !== "bot" || o.ts.slice(0, 10) < start) continue;
    const day = o.ts.slice(0, 10);

    if (!o.rule_id) out.push({ order_id: o.id, rule_id: "RULE", reason: "근거 규칙 ID 없음" });

    if (!isTradingDay(day)) out.push({ order_id: o.id, rule_id: "EV-2", reason: `휴장일 주문 (${day} ${holidayName(day)})` });

    if (o.planned_qty === null) out.push({ order_id: o.id, rule_id: "EN-8", reason: "주문 전 계산 수량(planned_qty) 기록 없음" });
    else if (o.planned_qty !== o.qty) out.push({ order_id: o.id, rule_id: "EN-8", reason: `계산 수량 ${o.planned_qty}주 ≠ 주문 수량 ${o.qty}주` });

    if (o.side === "buy") {
      const st = stageAt(ctx, o.code, o.ts);
      if (st !== "universe" && st !== "holding") out.push({ order_id: o.id, rule_id: "UV-1", reason: `주문 시각 단계가 '${st ?? "?"}' (유니버스 아님)` });

      const h = hold.get(o.code);
      if (h && h.qty > 0 && o.price < h.cost / h.qty) {
        out.push({ order_id: o.id, rule_id: "EN-7", reason: `평단 ${won(h.cost / h.qty)} 아래 ${won(o.price)} 에 추가 매수 (물타기)` });
      }

      const su = setupBefore(ctx, o.code, o.ts);
      if (su?.pivot && o.price > su.pivot * 1.03) {
        out.push({ order_id: o.id, rule_id: "EN-2", reason: `피봇 ${won(su.pivot)} 대비 +${(((o.price - su.pivot) / su.pivot) * 100).toFixed(1)}% 추격` });
      }

      // RR-1
      if (o.stop_price === null || o.target_price === null) {
        out.push({ order_id: o.id, rule_id: "RR-1", reason: "매수 전 손절가·목표가 미기록" });
      } else {
        const risk = o.price - o.stop_price;
        const reward = o.target_price - o.price;
        if (risk <= 0 || reward <= 0) out.push({ order_id: o.id, rule_id: "RR-1", reason: `손절가 ${won(o.stop_price)}·목표가 ${won(o.target_price)} 가 진입가와 어긋남` });
        else if (reward / risk < 2) out.push({ order_id: o.id, rule_id: "RR-1", reason: `손익비 ${(reward / risk).toFixed(2)}:1 (2:1 미만)` });
      }

      // SZ-1
      if (o.account_balance_at === null) {
        out.push({ order_id: o.id, rule_id: "SZ-1", reason: "주문 시각 계좌 잔고 미기록 → 비중 판정 불가" });
      } else if (maxStock !== null || maxSector !== null) {
        const afterStock = ((h?.qty ?? 0) * (h ? h.cost / Math.max(h.qty, 1) : 0)) + o.qty * o.price;
        const pctStock = (afterStock / o.account_balance_at) * 100;
        if (maxStock !== null && pctStock > maxStock) out.push({ order_id: o.id, rule_id: "SZ-1", reason: `종목 비중 ${pctStock.toFixed(1)}% > 상한 ${maxStock}%` });
        if (maxSector !== null) {
          const sec = sectorOf(o.code);
          let sectorValue = o.qty * o.price;
          for (const [c, v] of hold) if (c !== o.code && sectorOf(c) === sec) sectorValue += v.cost;
          if (h) sectorValue += h.cost;
          const pctSector = (sectorValue / o.account_balance_at) * 100;
          if (pctSector > maxSector) out.push({ order_id: o.id, rule_id: "SZ-1", reason: `업종(${sec ?? "?"}) 비중 ${pctSector.toFixed(1)}% > 상한 ${maxSector}%` });
        }
      }

      const cur = h ?? { qty: 0, cost: 0 };
      hold.set(o.code, { qty: cur.qty + o.qty, cost: cur.cost + o.qty * o.price });
    } else {
      const h = hold.get(o.code);
      if (h) {
        const left = h.qty - o.qty;
        hold.set(o.code, left <= 0 ? { qty: 0, cost: 0 } : { qty: left, cost: (h.cost / h.qty) * left });
      }
    }
  }

  // EX-1: 손절가 도달 후 매도 지연 (봇 계좌 포지션만)
  for (const p of ctx.positions) {
    if (p.account !== "kis_bot" || p.stop_price === null) continue;
    const from = p.opened_at.slice(0, 10);
    if (from < start) continue;
    if (!orders.some((o) => o.code === p.code && o.source === "bot" && o.ts >= p.opened_at && (!p.closed_at || o.ts <= p.closed_at))) continue;
    const to = (p.closed_at ?? "9999-12-31").slice(0, 10);
    const stop = p.stop_price;
    const hit = ctx.candles.filter((c) => c.code === p.code && c.date >= from && c.date <= to && c.low <= stop).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!hit) continue;
    const next = nextTradingDay(hit.date);
    const ok = orders.some((o) => o.code === p.code && o.side === "sell" && o.ts.slice(0, 10) >= hit.date && o.ts.slice(0, 10) <= next);
    if (!ok) {
      const anchor = orders.filter((o) => o.code === p.code && o.ts <= hit.date + "T23:59:59").sort((a, b) => b.ts.localeCompare(a.ts))[0];
      out.push({ order_id: anchor?.id ?? -p.id, rule_id: "EX-1", reason: `${hit.date} 저가 ${won(hit.low)} ≤ 손절선 ${won(stop)} 인데 익거래일까지 매도 없음` });
    }
  }
  return out;
}
