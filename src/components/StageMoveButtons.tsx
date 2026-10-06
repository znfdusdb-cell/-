"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Stage } from "@/lib/types";
import { ALLOWED_MOVES, STAGE_LABEL } from "@/lib/constants";
import { moveStageAction } from "@/app/actions";

export function StageMoveButtons({ code, stage, universeBlocked, botActive = true }: { code: string; stage: Stage; universeBlocked: string | null; botActive?: boolean }) {
  const [pick, setPick] = useState<{ to: Stage; label: string; danger?: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const moves = ALLOWED_MOVES[stage];

  function confirm() {
    if (!pick) return;
    setErr(null);
    start(async () => {
      const res = await moveStageAction({ code, from: stage, to: pick.to, reason });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setPick(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {moves.map((m) => {
          const blocked = m.to === "universe" ? universeBlocked : m.to === "exited" && !botActive ? "봇 가동 전: 퇴출 승인해도 팔 봇이 없다" : null;
          return (
            <button
              key={m.to}
              disabled={Boolean(blocked)}
              title={blocked ?? undefined}
              onClick={() => { setPick(m); setErr(null); }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${m.danger ? "border-stop/60 text-stop" : "border-line bg-bg-3 text-fg"}`}
            >
              {m.label}
            </button>
          );
        })}
        {!moves.length && <span className="text-xs text-fg-3">이 단계에서 사이트가 할 수 있는 이동 없음</span>}
      </div>
      {universeBlocked && stage === "review" && <p className="mt-2 text-xs text-warn">{universeBlocked}</p>}
      {!botActive && stage === "review" && <p className="mt-1 text-xs text-fg-3">퇴출 승인(봇 매도)은 봇 가동일이 정해진 뒤 열린다.</p>}

      {pick && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => !pending && setPick(null)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-bg-2 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">
              {STAGE_LABEL[stage]} → {STAGE_LABEL[pick.to]}
            </h3>
            <p className="mt-1 text-sm text-fg-2">{pick.label}. 이유를 적어라. 이력에 남고 나중에 복기한다.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="예: 무효화 조건 1번 위반 확인 (9/24 WTI 68.4)"
              className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-fg-3"
            />
            {err && <p className="mt-2 text-sm text-stop">{err}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => setPick(null)} disabled={pending} className="flex-1 rounded-lg border border-line px-3 py-2.5 text-sm">취소</button>
              <button
                onClick={confirm}
                disabled={pending || reason.trim().length < 2}
                className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold disabled:opacity-40 ${pick.danger ? "bg-stop text-white" : "bg-fg text-bg"}`}
              >
                {pending ? "이동 중…" : "확인하고 이동"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
