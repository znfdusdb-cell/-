import { getRepo } from "@/lib/repo";
import { RULES } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { Section, OrdersTable, ClosuresPanel, SettingsPanel } from "@/components/DetailPanels";
import { todayKST, fmtNum, fmtDateTime } from "@/lib/format";
import { viewMode } from "@/lib/view";
import { streakSentence } from "@/lib/easy";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const repo = getRepo();
  const [audit, items] = await Promise.all([repo.ruleAudit(), repo.summaries()]);
  const names = Object.fromEntries(items.map((i) => [i.stock.code, i.stock.name]));
  const cats = Array.from(new Set(RULES.map((r) => r.category)));
  const vByOrder = new Map<number, typeof audit.violations>();
  for (const v of audit.violations) vByOrder.set(v.order_id, [...(vByOrder.get(v.order_id) ?? []), v]);

  if ((await viewMode()) === "easy") {
    const st = streakSentence(audit.days, audit.since, audit.violations.length, audit.settings.bot_started_at ?? null);
    return (
      <div className="space-y-4 font-easy">
        <section className="rounded-2xl border border-line bg-bg-2 p-5 text-center">
          <div className="text-xs text-fg-3">봇이 규칙을 지킨 날</div>
          <div className={`mt-1 text-4xl font-bold ${audit.days !== null && audit.days >= 30 ? "text-go" : ""}`}>{st.big}</div>
          <p className="mt-1 text-sm text-fg-2">{st.line}</p>
        </section>
        <section className="rounded-2xl border border-line bg-bg-2 p-4">
          <h2 className="mb-2 text-xs text-fg-3">봇이 한 일</h2>
          {audit.orders.length === 0 ? (
            <p className="text-sm text-fg-2">아직 없어요.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {audit.orders.slice(0, 30).map((o) => {
                const vs = vByOrder.get(o.id) ?? [];
                const bad = o.source === "bot" && (vs.length > 0 || o.is_violation || !o.rule_id);
                return (
                  <li key={o.id} className={`rounded-lg border p-3 ${bad ? "border-stop/60" : "border-line"}`}>
                    <div className="num text-[11px] text-fg-3">{fmtDateTime(o.ts)}{o.source === "manual" ? " · 손으로" : ""}</div>
                    <div>
                      <span className={o.side === "buy" ? "text-up" : "text-down"}>{o.side === "buy" ? "샀어요" : "팔았어요"}</span> {names[o.code] ?? o.code} {fmtNum(o.qty)}주, 한 주에 {fmtNum(o.price)}원
                    </div>
                    <div className="text-[11px] text-fg-2">{bad ? `규칙을 어겼어요: ${vs.map((v) => v.reason).join(" / ") || o.note || ""}` : `이유: ${o.rule_text ?? (o.rule_id ? RULES.find((r) => r.rule_id === o.rule_id)?.title : "") ?? ""}`}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <ClosuresPanel from={todayKST()} longTradingDays={Number(audit.settings.long_closure_trading_days ?? 2)} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-line bg-bg-2 p-4 text-center">
        <div className="text-xs text-fg-3">규칙 위반 0일</div>
        {audit.days === null ? (
          <div className="text-2xl font-bold text-fg-2">가동 전</div>
        ) : (
          <div className={`num text-5xl font-bold ${audit.days >= 30 ? "text-go" : "text-fg"}`}>{audit.days}<span className="ml-1 text-lg font-semibold text-fg-2">일째</span></div>
        )}
        <p className="mt-1 text-xs text-fg-3">
          {audit.days === null
            ? "봇 가동일(모의투자 시작일)이 정해지면 그날부터 센다 · sb_settings.bot_started_at"
            : `${audit.violations.length > 0 && audit.since !== audit.settings.bot_started_at ? `마지막 위반 ${fmtDate(audit.since)}` : `봇 가동일 ${fmtDate(audit.settings.bot_started_at)}`} 기준 · 봇 주문 ${audit.botOrders}건 · 위반 ${audit.violations.length}건`}
        </p>
        <p className="mt-1 text-[11px] text-fg-3">
          위반 = 주문 기록을 규칙과 대조한 검증 함수 판정(UV-1·EN-2·EN-7·EN-8·RR-1·SZ-1·EX-1·EV-2 휴장일·근거 없음) + 봇 자진 신고. 수동 매매와 봇 가동일 이전 주문은 기록만 하고 제외. 소액 실전 통과 기준: 3개월 0건.
        </p>
      </section>

      {audit.violations.length > 0 && (
        <Section title="위반 판정">
          <ul className="space-y-1 text-xs">
            {audit.violations.map((v, i) => {
              const o = audit.orders.find((x) => x.id === v.order_id);
              return (
                <li key={i} className="flex gap-2">
                  <span className="num w-10 shrink-0 font-semibold text-stop">{v.rule_id}</span>
                  <span className="text-fg">{o ? `${names[o.code] ?? o.code} ${fmtDate(o.ts)}` : "—"}</span>
                  <span className="text-fg-2">{v.reason}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="주문별 근거 규칙">
        <OrdersTable orders={audit.orders} names={names} violations={vByOrder} />
      </Section>

      <ClosuresPanel from={todayKST()} longTradingDays={Number(audit.settings.long_closure_trading_days ?? 2)} />
      <SettingsPanel settings={audit.settings} />

      <Section title="규칙 카탈로그">
        <div className="space-y-3">
          {cats.map((c) => (
            <div key={c}>
              <h3 className="mb-1 text-xs font-semibold text-fg-3">{c}</h3>
              <ul className="space-y-1 text-xs">
                {RULES.filter((r) => r.category === c).map((r) => (
                  <li key={r.rule_id} className="flex gap-2">
                    <span className="num w-10 shrink-0 text-fg">{r.rule_id}</span>
                    <span><span className="text-fg">{r.title}</span> <span className="text-fg-2">— {r.description}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
