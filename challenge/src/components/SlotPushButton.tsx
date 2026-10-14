"use client";

import { useActionState } from "react";
import { adminSendSlotPush } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

/** 관리자: 시간대 알림을 내 폰으로 미리 보내 보기 (크론과 같은 알림) */
export function SlotPushButton({ challengeId, slotKey, label, kind }: { challengeId: string; slotKey: string; label: string; kind: "start" | "ending" }) {
  const [state, action] = useActionState(adminSendSlotPush, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="challenge_id" value={challengeId} />
      <input type="hidden" name="slot" value={slotKey} />
      <input type="hidden" name="kind" value={kind} />
      <SubmitButton className="btn btn-ghost text-xs py-1.5 px-2.5" pendingText="보내는 중…">{kind === "start" ? `${label} 시작 알림` : `${label} 마감 30분 전`}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
