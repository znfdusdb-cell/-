"use client";

import { useState } from "react";
import type { Candle, Setup, Position } from "@/lib/types";
import { CandleChart } from "./CandleChart";

export function ChartToggle(props: { candles: Candle[]; setup: Setup | null; position: Position | null }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-xl border border-line bg-bg-2 py-3 text-sm text-fg-2 hover:text-fg">
        차트 보기
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-bg-2 p-3">
      <CandleChart {...props} />
      <button onClick={() => setOpen(false)} className="mt-2 text-xs text-fg-3">접기</button>
    </div>
  );
}
