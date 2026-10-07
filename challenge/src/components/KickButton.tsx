"use client";

import { useActionState, useState } from "react";
import { kickParticipant } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

/** 챌린지에서 참가자 내보내기 (개설자·관리자) */
export function KickButton({ challengeId, userId, name }: { challengeId: string; userId: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action] = useActionState(kickParticipant, null);
  if (!confirm) return <button type="button" className="text-[11px] text-fg-3 underline" onClick={() => setConfirm(true)}>내보내기</button>;
  return (
    <form action={action} className="flex items-center gap-1.5 flex-wrap">
      <input type="hidden" name="challenge_id" value={challengeId} />
      <input type="hidden" name="user_id" value={userId} />
      <span className="text-[11px] text-bad">{name}을(를) 이 챌린지에서 내보낼까요?</span>
      <SubmitButton className="text-[11px] text-bad font-bold">내보내기</SubmitButton>
      <button type="button" className="text-[11px] text-fg-3" onClick={() => setConfirm(false)}>취소</button>
      <FormMessage state={state} />
    </form>
  );
}
