"use client";

import { useActionState } from "react";
import { nudge } from "@/app/actions";
import { SubmitButton } from "./Form";

/** 아직 인증 안 한 멤버 콕 찌르기 (하루 1번) */
export function NudgeButton({ challengeId, userId }: { challengeId: string; userId: string }) {
  const [state, action] = useActionState(nudge, null);
  if (state?.ok) return <span className="text-[11px] text-ok font-bold">찔렀어요 ✓</span>;
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="challenge_id" value={challengeId} />
      <input type="hidden" name="user_id" value={userId} />
      <SubmitButton className="chip bg-fg text-white py-1 px-2.5" pendingText="…">👉 콕 찌르기</SubmitButton>
      {state?.error && <span className="text-[11px] text-bad">{state.error}</span>}
    </form>
  );
}
