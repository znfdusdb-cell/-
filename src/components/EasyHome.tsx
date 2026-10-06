import Link from "next/link";
import type { StockSummary, MarketRegime, Settings, MarketEvent, Stage } from "@/lib/types";
import { buildTodos, regimeSentence, nextStep, mountainStage } from "@/lib/easy";
import { Lights, MountainPos, WeatherIcon } from "./EasyBits";
import { Term } from "./Term";
import { Badge } from "./StockCard";

const GROUPS: { stage: Stage; title: string; hint: string }[] = [
  { stage: "holding", title: "봇이 들고 있는 것", hint: "안전벨트 아래로 가면 판다" },
  { stage: "universe", title: "살 수 있는 목록", hint: "문턱을 넘는 날 봇이 산다" },
  { stage: "review", title: "검토 중", hint: "가설을 읽고 승인할 차례" },
  { stage: "radar", title: "후보", hint: "브레인이 찾아온 것" },
  { stage: "exited", title: "정리됨", hint: "다시 문턱을 넘으면 다시 볼 것" },
];

export function EasyHome({ items, regime, events, settings }: { items: StockSummary[]; regime: MarketRegime | null; events: MarketEvent[]; settings: Settings }) {
  const todos = buildTodos(items, events, settings);
  const w = regimeSentence(regime);
  return (
    <div className="space-y-4 font-easy">
      {/* 오늘 할 일 */}
      <section className="rounded-2xl border border-line bg-bg-2 p-4">
        <h2 className="text-xs text-fg-3">오늘 할 일</h2>
        {todos.length === 0 ? (
          <p className="mt-1 text-xl font-semibold">할 일 없음. 봇이 알아서 지켜보고 있어요.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {todos.map((t) => (
              <Link key={t.kind + t.code} href={`/stocks/${t.code}`} className="block rounded-xl bg-fg px-4 py-3 text-bg active:scale-[0.99]">
                <div className="text-lg font-bold">{t.title}</div>
                <div className="text-sm opacity-80">{t.detail}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 시장 날씨 */}
      <section className={`flex items-center gap-4 rounded-2xl border bg-bg-2 p-4 ${regime?.is_seed ? "border-warn/50" : "border-line"}`}>
        <WeatherIcon kind={w.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{w.word}</span>
            {regime?.is_seed && <Badge tone="warn">시드 데이터</Badge>}
          </div>
          <p className="text-sm text-fg-2">{w.line}</p>
        </div>
      </section>

      {/* 종목 */}
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.stock.stage === g.stage);
        if (!list.length) return null;
        return (
          <section key={g.stage}>
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="text-base font-semibold">{g.title}</h3>
              <span className="text-[11px] text-fg-3">{g.hint}</span>
            </div>
            <div className="space-y-3">
              {list.map((s) => <EasyCard key={s.stock.code} s={s} settings={settings} />)}
            </div>
          </section>
        );
      })}

      <p className="text-[11px] leading-relaxed text-fg-3">
        봇은 <Term k="universe" /> 안의 종목만 사고, 사면 늘 <Term k="stop" />를 채워요. 이 화면은 주문을 내지 않아요. 비움은 승인 버튼만 눌러요.
      </p>
    </div>
  );
}

function EasyCard({ s, settings }: { s: StockSummary; settings: Settings }) {
  const { stock, thesis, setup, position } = s;
  const fake = setup?.data_source === "seed";
  const violated = thesis?.status === "suspect" || thesis?.invalidation_conditions.some((c) => c.violated);
  const stage = mountainStage(setup?.trend_template ?? []);
  return (
    <Link href={`/stocks/${stock.code}`} className={`block rounded-2xl border bg-bg-2 p-4 active:scale-[0.99] ${violated ? "border-stop/70" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-lg font-bold">{stock.name}</div>
        <div className="flex gap-1 text-[11px]">
          {violated && <Badge tone="stop">가설 깨짐</Badge>}
          {position?.account === "kb_manual" && <Badge tone="muted">KB 수동 보유</Badge>}
          {thesis?.status === "draft" && <Badge tone="warn">가설 승인 대기</Badge>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1.2fr_1fr] items-center gap-4">
        <MountainPos stage={stage} fake={fake} />
        <div>
          <div className="text-[11px] text-fg-3">지금 위치</div>
          <div className="text-base font-semibold">{stage === 2 ? "오르막" : stage === 1 ? "평지" : stage === 3 ? "꼭대기" : "내리막"}</div>
        </div>
      </div>
      <div className="mt-3">
        <Lights items={setup?.checklist ?? []} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg">{nextStep(s, settings)}</p>
    </Link>
  );
}
