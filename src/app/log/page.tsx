import { getRepo } from "@/lib/repo";
import { RULES } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { Section, OrdersTable, ClosuresPanel, SettingsPanel } from "@/components/DetailPanels";
import { todayKST } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const repo = getRepo();
  const [audit, items] = await Promise.all([repo.ruleAudit(), repo.summaries()]);
  const names = Object.fromEntries(items.map((i) => [i.stock.code, i.stock.name]));
  const cats = Array.from(new Set(RULES.map((r) => r.category)));
  const vByOrder = new Map<number, typeof audit.violations>();
  for (const v of audit.violations) vByOrder.set(v.order_id, [...(vByOrder.get(v.order_id) ?? []), v]);

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

      <ClosuresPanel from={todayKST()} />
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
