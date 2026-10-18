"use client";

import { useActionState, useState } from "react";
import { leaveChallenge } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

export function LeaveButton({ challengeId, allowed = true, reason = "", label = "이 챌린지 그만두기", className = "text-xs text-fg-3 underline" }: { challengeId: string; allowed?: boolean; reason?: string; label?: string; className?: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action] = useActionState(leaveChallenge, null);
  if (!allowed) return <p className="text-[11px] text-fg-3">🔒 {reason}</p>;
  if (!confirm) return <button type="button" className={className} onClick={() => setConfirm(true)}>{label}</button>;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="challenge_id" value={challengeId} />
      <span className="text-xs text-bad flex-1">정말 그만둘까요? 연속 기록이 끊겨요.</span>
      <SubmitButton className="btn btn-ghost text-xs py-1.5 text-bad">그만두기</SubmitButton>
      <button type="button" className="btn btn-ghost text-xs py-1.5" onClick={() => setConfirm(false)}>취소</button>
      <FormMessage state={state} />
    </form>
  );
}
