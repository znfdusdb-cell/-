"use client";

import { useActionState } from "react";
import { adminStartNow } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

export function StartNowButton({ userId, challengeId }: { userId: string; challengeId: string }) {
  const [state, action] = useActionState(adminStartNow, null);
  return (
    <form action={action} className="mt-1">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="challenge_id" value={challengeId} />
      <SubmitButton className="btn btn-ghost text-[11px] py-1 px-2">관리자: 오늘부터 바로 시작</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
