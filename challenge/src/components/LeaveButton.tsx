"use client";

import { useActionState, useState } from "react";
import { leaveChallenge } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

export function LeaveButton({ challengeId }: { challengeId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action] = useActionState(leaveChallenge, null);
  if (!confirm) return <button type="button" className="text-xs text-fg-3 underline" onClick={() => setConfirm(true)}>이 챌린지 그만두기</button>;
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
