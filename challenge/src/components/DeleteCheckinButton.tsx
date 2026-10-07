"use client";

import { useActionState, useState } from "react";
import { deleteCheckin } from "@/app/actions";
import { SubmitButton } from "./Form";

export function DeleteCheckinButton({ checkinId }: { checkinId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action] = useActionState(deleteCheckin, null);
  if (!confirm) return <button type="button" className="text-[11px] text-fg-3 underline" onClick={() => setConfirm(true)}>삭제</button>;
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="checkin_id" value={checkinId} />
      <SubmitButton className="text-[11px] text-bad font-bold">지울게요</SubmitButton>
      <button type="button" className="text-[11px] text-fg-3" onClick={() => setConfirm(false)}>취소</button>
      {state?.error && <span className="text-[11px] text-bad">{state.error}</span>}
    </form>
  );
}
