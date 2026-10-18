"use client";

import { useActionState } from "react";
import { adminRechallenge } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

/** 관리자: 탈락 멤버 대신 재도전 처리. giftSent 가 false 면 면제 버튼으로 */
export function AdminRechallengeButton({ challengeId, userId, giftSent }: { challengeId: string; userId: string; giftSent: boolean }) {
  const [state, action] = useActionState(adminRechallenge, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="challenge_id" value={challengeId} />
      <input type="hidden" name="user_id" value={userId} />
      {!giftSent && <input type="hidden" name="force" value="1" />}
      <SubmitButton className="btn btn-ghost text-[11px] py-1 px-2" pendingText="…">{giftSent ? "관리자: 다음 월요일부터 재도전" : "관리자: 벌칙 면제하고 재도전"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
