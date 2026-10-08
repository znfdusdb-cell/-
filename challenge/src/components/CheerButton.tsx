"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleCheer } from "@/app/actions";

export type CheerState = { count: number; mine: boolean; own: boolean };

/** 인증 카드의 🔥 응원 버튼. 내 인증이면 개수만 보여 준다. 낙관적으로 먼저 바뀌고 서버가 확정한다. */
export function CheerButton({ checkinId, cheer }: { checkinId: string; cheer: CheerState }) {
  const [state, setState] = useState(cheer);
  const [optimistic, setOptimistic] = useOptimistic(state);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (cheer.own) {
    return <span className="text-[11px] text-fg-2 num">🔥 {state.count}</span>;
  }

  function onClick() {
    setError(null);
    start(async () => {
      const next = { ...optimistic, mine: !optimistic.mine, count: optimistic.count + (optimistic.mine ? -1 : 1) };
      setOptimistic(next);
      const fd = new FormData();
      fd.set("checkin_id", checkinId);
      const r = await toggleCheer(null, fd);
      if (!r.ok) { setError(r.error ?? "실패"); return; }
      setState({ ...state, mine: r.cheered ?? next.mine, count: r.count ?? next.count });
    });
  }

  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={onClick} disabled={pending} aria-pressed={optimistic.mine} className={`chip py-1 px-2 text-[11px] border num ${optimistic.mine ? "bg-red text-white border-red" : "bg-bg-2 text-fg-2 border-line"}`}>
        🔥 {optimistic.count > 0 ? optimistic.count : "응원"}
      </button>
      {error && <span className="text-[10px] text-bad">{error}</span>}
    </span>
  );
}
