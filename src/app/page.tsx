import { getRepo } from "@/lib/repo";
import { MarketLight } from "@/components/MarketLight";
import { PipelineBoard } from "@/components/PipelineBoard";
import { UpcomingEvents } from "@/components/UpcomingEvents";
import { EasyHome } from "@/components/EasyHome";
import { ProposalCard } from "@/components/ProposalCard";
import { viewMode } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function Home() {
  const repo = getRepo();
  const [regime, items, events, settings, proposals, riskData] = await Promise.all([repo.latestRegime(), repo.summaries(), repo.upcomingEvents(14), repo.settings(), repo.proposals("pending"), repo.riskPanel()]);
  const names = Object.fromEntries(items.map((i) => [i.stock.code, i.stock.name]));
  if ((await viewMode()) === "easy") return <EasyHome items={items} regime={regime} events={events} settings={settings} proposals={proposals} risk={riskData.risk} />;
  return (
    <div className="space-y-4">
      <MarketLight regime={regime} settings={settings} />
      <UpcomingEvents events={events} names={names} />
      {proposals.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg-2">변경 문: 비움 결정 대기 {proposals.length}건</h3>
          <div className="space-y-2">{proposals.map((p) => <ProposalCard key={p.id} p={p} />)}</div>
        </section>
      )}
      <PipelineBoard items={items} />
      <p className="text-[11px] leading-relaxed text-fg-3">
        레이더 → 검토 → 유니버스 → 보유 → 퇴출. 봇은 유니버스만 매수하고 퇴출은 매도 대상. 보유 단계 진입은 봇 체결로만 일어난다.
        이 사이트는 주문을 내지 않는다. 단계 이동은 카드 상세에서 버튼 + 확인으로만.
      </p>
    </div>
  );
}
