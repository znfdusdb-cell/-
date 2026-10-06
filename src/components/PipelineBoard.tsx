"use client";

import { useState } from "react";
import type { Stage, StockSummary } from "@/lib/types";
import { STAGES, STAGE_LABEL, STAGE_HINT } from "@/lib/constants";
import { StockCard } from "./StockCard";

export function PipelineBoard({ items }: { items: StockSummary[] }) {
  const [active, setActive] = useState<Stage>(() => {
    const first = STAGES.find((st) => items.some((i) => i.stock.stage === st));
    return first ?? "radar";
  });
  const byStage = (st: Stage) => items.filter((i) => i.stock.stage === st);

  return (
    <section>
      {/* 모바일: 단계 탭 */}
      <div className="scroll-x -mx-4 flex gap-1 px-4 md:hidden">
        {STAGES.map((st) => {
          const n = byStage(st).length;
          const on = st === active;
          return (
            <button
              key={st}
              onClick={() => setActive(st)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${on ? "border-fg bg-fg text-bg" : "border-line bg-bg-2 text-fg-2"}`}
            >
              {STAGE_LABEL[st]} <span className={`num ${on ? "text-bg/70" : "text-fg-3"}`}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 md:hidden">
        <p className="mb-2 text-xs text-fg-3">{STAGE_HINT[active]}</p>
        <Column items={byStage(active)} />
      </div>

      {/* 데스크톱: 5열 */}
      <div className="hidden gap-3 md:grid md:grid-cols-5">
        {STAGES.map((st) => (
          <div key={st} className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between border-b border-line pb-1">
              <h3 className="font-semibold">{STAGE_LABEL[st]}</h3>
              <span className="num text-xs text-fg-3">{byStage(st).length}</span>
            </div>
            <p className="mb-2 text-[11px] leading-snug text-fg-3">{STAGE_HINT[st]}</p>
            <Column items={byStage(st)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Column({ items }: { items: StockSummary[] }) {
  if (!items.length) return <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">비어 있음</p>;
  return (
    <div className="space-y-2">
      {items.map((s) => (
        <StockCard key={s.stock.code} s={s} />
      ))}
    </div>
  );
}
