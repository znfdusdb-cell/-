import { getRepo } from "@/lib/repo";
import { RULES } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { Section, OrdersTable } from "@/components/DetailPanels";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const repo = getRepo();
  const [orders, vf, items] = await Promise.all([repo.orders(300), repo.violationFreeDays(), repo.summaries()]);
  const names = Object.fromEntries(items.map((i) => [i.stock.code, i.stock.name]));
  const cats = Array.from(new Set(RULES.map((r) => r.category)));

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-line bg-bg-2 p-4 text-center">
        <div className="text-xs text-fg-3">규칙 위반 0일</div>
        <div className={`num text-5xl font-bold ${vf.days >= 30 ? "text-go" : "text-fg"}`}>{vf.days}<span className="ml-1 text-lg font-semibold text-fg-2">일째</span></div>
        <p className="mt-1 text-xs text-fg-3">
          {vf.violations > 0 ? `마지막 위반 ${fmtDate(vf.since)}` : vf.total > 0 ? `첫 주문 ${fmtDate(vf.since)} 이후 위반 없음` : "주문 기록 없음"} · 주문 {vf.total}건 · 위반 {vf.violations}건
        </p>
        <p className="mt-1 text-[11px] text-fg-3">위반 = 근거 규칙 ID가 없는 주문 또는 봇이 위반으로 표시한 주문. 소액 실전 통과 기준: 3개월 0건.</p>
      </section>

      <Section title="주문별 근거 규칙">
        <OrdersTable orders={orders} names={names} />
      </Section>

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
