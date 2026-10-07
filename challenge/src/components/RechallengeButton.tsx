"use client";

import { useActionState } from "react";
import { rechallenge } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

export function RechallengeButton({ challengeId }: { challengeId: string }) {
  const [state, action] = useActionState(rechallenge, null);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="challenge_id" value={challengeId} />
      <SubmitButton className="btn btn-dark w-full">벌칙 했어요, 다시 도전</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
