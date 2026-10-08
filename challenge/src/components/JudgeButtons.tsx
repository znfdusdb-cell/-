"use client";

import { useActionState } from "react";
import { judgeReport } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

/** 관리자 판정: 불인정(실패 처리) / 인정(기각) */
export function JudgeButtons({ checkinId }: { checkinId: string }) {
  const [state, action] = useActionState(judgeReport, null);
  if (state?.ok) return <div className="text-sm text-ok font-bold">{state.message}</div>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="checkin_id" value={checkinId} />
      <input name="note" className="input py-2 text-sm" placeholder="불인정 사유 (당사자에게 보여요, 선택)" maxLength={120} />
      <div className="grid grid-cols-2 gap-2">
        <SubmitButton className="btn btn-ghost text-sm text-ok" pendingText="…">인정 (기각)</SubmitButton>
        <button type="submit" name="verdict" value="accept" className="btn text-sm bg-bad text-white">불인정 → 실패 처리</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
