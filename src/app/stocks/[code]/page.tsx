import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/repo";
import { universeGuard } from "@/lib/guards";
import { STAGE_LABEL, STAGE_HINT } from "@/lib/constants";
import { fmtNum, fmtPct, pctChange, udClass } from "@/lib/format";
import { CandleChart } from "@/components/CandleChart";
import { StageMoveButtons } from "@/components/StageMoveButtons";
import { Badge } from "@/components/StockCard";
import { Section, FootprintPanel, CheckPanel, ThesisPanel, PositionPanel, EventsPanel, StageLogPanel, OrdersTable, SnapshotsPanel } from "@/components/DetailPanels";

export const dynamic = "force-dynamic";

export default async function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const repo = getRepo();
  const [d, settings] = await Promise.all([repo.detail(code), repo.settings()]);
  if (!d) notFound();
  const { stock, thesis, setup, position } = d;
  const chg = pctChange(d.last_close, d.prev_close);
  const fakeCandles = d.candles.some((c) => c.source === "seed");
  const violated = thesis?.status === "suspect" || thesis?.invalidation_conditions.some((c) => c.violated);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/" className="text-xs text-fg-3">← 관제탑</Link>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <span className="truncate">{stock.name}</span>
            <span className="text-sm font-normal text-fg-3">{stock.code}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
            <Badge tone="fg">{STAGE_LABEL[stock.stage]}</Badge>
            {violated && <Badge tone="stop">무효화 조건 위반</Badge>}
            {stock.is_seed && <Badge tone="warn">가짜 시드</Badge>}
            <span className="text-fg-3">{stock.market} · {stock.sector ?? "업종 미정"}</span>
          </div>
        </div>
        <div className="num shrink-0 text-right">
          {fakeCandles ? (
            <>
              <div className="text-2xl font-bold text-fg-3">—</div>
              <div className="text-[11px] text-warn">가짜 일봉 (현재가 없음)</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold">{fmtNum(d.last_close)}</div>
              <div className={`text-sm ${udClass(chg)}`}>{fmtPct(chg, 2)}</div>
            </>
          )}
        </div>
      </div>

      {violated && (
        <div className="rounded-xl border border-stop bg-stop/10 p-3 text-sm text-stop">
          무효화 조건 위반. 규칙 UV-3: 검토 단계로 강등 → 비움 승인 후 퇴출(봇 매도). 손절선은 그대로 작동한다.
        </div>
      )}

      <Section title={`단계: ${STAGE_LABEL[stock.stage]}`} right={<span className="text-[11px] text-fg-3">{STAGE_HINT[stock.stage]}</span>}>
        <StageMoveButtons code={stock.code} stage={stock.stage} universeBlocked={universeGuard(thesis, setup, settings)} />
        {stock.stage_reason && <p className="mt-2 text-xs text-fg-3">최근 이동 이유: {stock.stage_reason}</p>}
      </Section>

      <Section title="일봉">
        <CandleChart candles={d.candles} setup={setup} position={position} />
      </Section>

      <PositionPanel position={position} lastClose={d.last_close} fakePrice={fakeCandles} />
      <SnapshotsPanel snapshots={d.snapshots} />
      <ThesisPanel thesis={thesis} />
      <FootprintPanel setup={setup} lastClose={d.last_close} />
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckPanel title={setup?.data_source === "seed" ? "트렌드 템플레이트 (가짜 일봉 기준)" : "트렌드 템플레이트"} items={setup?.trend_template ?? []} max={8} />
        <CheckPanel title={setup?.data_source === "seed" ? "체크리스트 (가짜 일봉 기준)" : "체크리스트"} items={setup?.checklist ?? []} max={7} />
      </div>
      <EventsPanel events={d.events} />
      {d.orders.length > 0 && (
        <Section title="이 종목 주문 로그">
          <OrdersTable orders={d.orders} />
        </Section>
      )}
      <StageLogPanel log={d.stage_log} />
    </div>
  );
}
