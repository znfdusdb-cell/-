import Link from "next/link";
import type { StockDetail, Settings } from "@/lib/types";
import { nextStep, mountainStage, MOUNTAIN_LABEL, MOUNTAIN_HINT } from "@/lib/easy";
import { universeGuard, uv4Status } from "@/lib/guards";
import { Lights, MountainPos, Thermometer } from "./EasyBits";
import { Term } from "./Term";
import { Badge } from "./StockCard";
import { StageMoveButtons } from "./StageMoveButtons";
import { ThesisApproveButton } from "./ThesisApproveButton";
import { ChartToggle } from "./ChartToggle";
import { AUTHOR_LABEL, THESIS_STATUS_LABEL } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

export function EasyDetail({ d, settings }: { d: StockDetail; settings: Settings }) {
  const { stock, thesis, setup, position } = d;
  const fake = d.candles.some((c) => c.source === "seed");
  const violated = thesis?.status === "suspect" || thesis?.invalidation_conditions.some((c) => c.violated);
  const stage = mountainStage(setup?.trend_template ?? []);
  const guard = universeGuard(thesis, setup, settings);
  const uv4 = uv4Status(setup, settings);
  const botActive = Boolean(settings.bot_started_at);
  const cboxWide = setup?.cbox_high && setup?.cbox_low ? (setup.cbox_high - setup.cbox_low) / setup.cbox_high > 0.1 : false;

  return (
    <div className="space-y-4 font-easy">
      <div>
        <Link href="/" className="text-xs text-fg-3">← 돌아가기</Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold">
          {stock.name}
          {violated && <Badge tone="stop">가설 깨짐</Badge>}
          {position?.account === "kb_manual" && <Badge tone="muted">KB 수동 보유 · {position.qty}주</Badge>}
          {position?.is_unverified && <Badge tone="warn">숫자 미확인</Badge>}
        </h1>
      </div>

      {/* 다음에 일어나야 할 일 + 버튼 */}
      <section className="rounded-2xl border border-line bg-bg-2 p-4">
        <h2 className="text-xs text-fg-3">다음에 일어나야 할 일</h2>
        <p className="mt-1 text-base leading-relaxed">{nextStep(d, settings)}</p>
        <div className="mt-3 space-y-2">
          {thesis?.status === "draft" && thesis.invalidation_conditions.length > 0 && <ThesisApproveButton thesisId={thesis.id} code={stock.code} />}
          <StageMoveButtons code={stock.code} stage={stock.stage} universeBlocked={guard} botActive={botActive} />
          {uv4.status === "pending" && stock.stage === "review" && <p className="text-[11px] text-fg-3">{uv4.text}</p>}
        </div>
      </section>

      {/* 온도계 */}
      <section className="rounded-2xl border border-line bg-bg-2 p-4">
        <h2 className="mb-3 text-xs text-fg-3">
          <Term k="pivot" /> · 지금 · <Term k="stop" />
          {cboxWide && <span className="ml-2 text-warn">C 후보 (아직 넓음)</span>}
        </h2>
        <Thermometer pivot={setup?.pivot ?? null} now={d.last_close} stop={position?.account === "kis_bot" ? position.stop_price : null} fake={fake} />
        {position?.account === "kb_manual" && <p className="mt-2 text-[11px] text-fg-3">KB에서 손으로 들고 있는 건 봇 안전벨트가 없어요. 봇이 사면 그때 생겨요.</p>}
      </section>

      {/* 산 위치 + 불빛 */}
      <section className="rounded-2xl border border-line bg-bg-2 p-4">
        <div className="grid grid-cols-[1.2fr_1fr] items-center gap-4">
          <MountainPos stage={stage} fake={fake} />
          <div>
            <div className="text-[11px] text-fg-3">지금 위치</div>
            <div className="text-lg font-semibold">{MOUNTAIN_LABEL[stage]}</div>
            <p className="text-[11px] text-fg-2">{MOUNTAIN_HINT[stage]}</p>
          </div>
        </div>
        <div className="mt-4">
          <h3 className="mb-1 text-xs text-fg-3">살 준비가 됐는지 7칸</h3>
          <Lights items={setup?.checklist ?? []} />
          <ul className="mt-2 space-y-0.5 text-xs">
            {(setup?.checklist ?? []).map((c) => (
              <li key={c.key} className={c.pass ? "text-fg" : "text-fg-3"}>{c.pass ? "●" : "○"} {c.label}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* 가설 */}
      <section className="rounded-2xl border border-line bg-bg-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs text-fg-3">왜 사나 (가설)</h2>
          {thesis && <span className="text-[11px] text-fg-3">{AUTHOR_LABEL[thesis.author]} · {THESIS_STATUS_LABEL[thesis.status]} · {fmtDate(thesis.updated_at)}</span>}
        </div>
        {!thesis ? (
          <p className="mt-1 text-sm text-warn">아직 없어요. 가설과 '틀렸다고 인정할 조건'부터.</p>
        ) : (
          <>
            <p className="mt-1 text-sm leading-relaxed">{thesis.hypothesis}</p>
            <h3 className="mt-3 text-[11px] text-fg-3">이러면 틀린 거다</h3>
            {thesis.invalidation_conditions.length === 0 ? (
              <p className="text-sm text-warn">비어 있어요. 이게 없으면 살 수 있는 목록에 못 올려요.</p>
            ) : (
              <ol className="mt-1 space-y-1 text-sm">
                {thesis.invalidation_conditions.map((c, i) => (
                  <li key={i} className={c.violated ? "font-semibold text-stop" : ""}>{i + 1}. {c.text}{c.violated && c.note ? ` — 깨짐 (${c.note})` : ""}</li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>

      <ChartToggle candles={d.candles} setup={setup} position={position} />

      <p className="text-[11px] leading-relaxed text-fg-3">
        위에 <Term k="overhead" />이 있으면 <Term k="pivot" />을 넘어도 금방 다시 밀릴 수 있어요. 넘고 나서 <Term k="tennis" />처럼 튀면 괜찮고, 돌처럼 가라앉으면 경고예요.
      </p>
    </div>
  );
}
