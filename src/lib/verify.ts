/**
 * 주문 기록을 규칙과 대조해 위반을 판정한다 (봇의 자진 신고 is_violation 과 별개).
 * 순수 함수. 사이트가 읽을 때마다 계산하고 저장하지 않는다.
 *
 * 판정 항목:
 *  UV-1 유니버스 밖 종목 매수        — 주문 시각의 단계를 sb_stage_log 로 복원
 *  EN-7 손실 중 추가매수(물타기)      — 같은 포지션의 직전 매수 평단보다 낮은 가격에 추가 매수
 *  EN-2 피봇 +3% 초과 추격           — 주문일 이전 최신 셋업의 피봇 대비
 *  EX-1 손절가 도달 후 미체결·지연     — 보유 중 일봉 저가가 손절선 이하인데 당일·익일 매도 없음
 *  EN-8 주문 수량 ≠ 계산 수량         — planned_qty 와 qty 불일치 또는 planned_qty 없음
 *  RULE rule_id 없는 주문
 * 한계: 손절선은 트레일링으로 움직이므로 EX-1 은 포지션의 최종 손절선 기준 근사치다.
 */
import type { OrderLog, StageLog, Setup, Position, Candle, Violation, Stage } from "./types";

export interface VerifyContext {
  orders: OrderLog[];
  stageLog: StageLog[];
  currentStage: Record<string, Stage>;
  setups: Setup[];      // 종목별 여러 as_of 가능
  positions: Position[];
  candles: Candle[];    // 보유 종목 일봉
  botStartedAt: string | null;  // 이 날 이전 주문·포지션은 봇 이전(수동)이라 제외
}

function stageAt(ctx: VerifyContext, code: string, ts: string): Stage | null {
  const logs = ctx.stageLog.filter((l) => l.code === code && l.created_at <= ts).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return logs[0]?.to_stage ?? ctx.currentStage[code] ?? null;
}

function setupBefore(ctx: VerifyContext, code: string, ts: string): Setup | null {
  const day = ts.slice(0, 10);
  const list = ctx.setups.filter((s) => s.code === code && s.as_of <= day).sort((a, b) => b.as_of.localeCompare(a.as_of));
  return list[0] ?? ctx.setups.filter((s) => s.code === code).sort((a, b) => b.as_of.localeCompare(a.as_of))[0] ?? null;
}

export function verifyOrders(ctx: VerifyContext): Violation[] {
  const out: Violation[] = [];
  const orders = [...ctx.orders].sort((a, b) => a.ts.localeCompare(b.ts));

  // 종목별 누적 평단 (매수만, 매도로 전량 정리되면 초기화)
  const avg = new Map<string, { qty: number; cost: number }>();

  const start = ctx.botStartedAt ?? "9999-12-31";
  for (const o of orders) {
    if (o.source !== "bot" || o.ts.slice(0, 10) < start) continue;

    if (!o.rule_id) out.push({ order_id: o.id, rule_id: "RULE", reason: "근거 규칙 ID 없음" });

    if (o.planned_qty === null) out.push({ order_id: o.id, rule_id: "EN-8", reason: "주문 전 계산 수량(planned_qty) 기록 없음" });
    else if (o.planned_qty !== o.qty) out.push({ order_id: o.id, rule_id: "EN-8", reason: `계산 수량 ${o.planned_qty}주 ≠ 주문 수량 ${o.qty}주` });

    if (o.side === "buy") {
      const st = stageAt(ctx, o.code, o.ts);
      if (st !== "universe" && st !== "holding") out.push({ order_id: o.id, rule_id: "UV-1", reason: `주문 시각 단계가 '${st ?? "?"}' (유니버스 아님)` });

      const a = avg.get(o.code);
      if (a && a.qty > 0 && o.price < a.cost / a.qty) {
        out.push({ order_id: o.id, rule_id: "EN-7", reason: `평단 ${Math.round(a.cost / a.qty).toLocaleString("ko-KR")} 아래 ${o.price.toLocaleString("ko-KR")} 에 추가 매수 (물타기)` });
      }

      const su = setupBefore(ctx, o.code, o.ts);
      if (su?.pivot && o.price > su.pivot * 1.03) {
        out.push({ order_id: o.id, rule_id: "EN-2", reason: `피봇 ${su.pivot.toLocaleString("ko-KR")} 대비 +${(((o.price - su.pivot) / su.pivot) * 100).toFixed(1)}% 추격` });
      }

      const cur = a ?? { qty: 0, cost: 0 };
      avg.set(o.code, { qty: cur.qty + o.qty, cost: cur.cost + o.qty * o.price });
    } else {
      const a = avg.get(o.code);
      if (a) {
        const left = a.qty - o.qty;
        avg.set(o.code, left <= 0 ? { qty: 0, cost: 0 } : { qty: left, cost: (a.cost / a.qty) * left });
      }
    }
  }

  // EX-1: 손절가 도달 후 매도 지연
  for (const p of ctx.positions) {
    const from = p.opened_at.slice(0, 10);
    if (from < start) continue;
    // 봇 주문이 하나도 없는 포지션(수동 매매)은 대상이 아니다
    if (!orders.some((o) => o.code === p.code && o.source === "bot" && o.ts >= p.opened_at && (!p.closed_at || o.ts <= p.closed_at))) continue;
    const to = (p.closed_at ?? "9999-12-31").slice(0, 10);
    const hit = ctx.candles.filter((c) => c.code === p.code && c.date >= from && c.date <= to && c.low <= p.stop_price).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!hit) continue;
    const sells = orders.filter((o) => o.code === p.code && o.side === "sell" && o.ts.slice(0, 10) >= hit.date);
    const next = nextTradingDay(hit.date);
    const ok = sells.some((o) => o.ts.slice(0, 10) <= next);
    if (!ok) {
      const anchor = orders.filter((o) => o.code === p.code && o.ts <= hit.date + "T23:59:59").sort((a, b) => b.ts.localeCompare(a.ts))[0];
      out.push({ order_id: anchor?.id ?? -p.id, rule_id: "EX-1", reason: `${hit.date} 저가 ${hit.low.toLocaleString("ko-KR")} ≤ 손절선 ${p.stop_price.toLocaleString("ko-KR")} 인데 익일까지 매도 없음` });
    }
  }
  return out;
}

function nextTradingDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
