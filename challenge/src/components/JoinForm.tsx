"use client";

import { useActionState } from "react";
import { joinChallenge, updateGoal } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";
import type { Challenge, ParticipationGoal } from "@/lib/types";

/** 챌린지 참여(또는 목표 수정) 폼. 목표 종류에 따라 입력이 달라진다. */
export function JoinForm({ challenge, goal, mode = "join", next }: { challenge: Challenge; goal?: ParticipationGoal; mode?: "join" | "edit"; next?: string }) {
  const [state, action] = useActionState(mode === "join" ? joinChallenge : updateGoal, null);
  const g = challenge.config.goal;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="challenge_id" value={challenge.id} />
      {next && <input type="hidden" name="next" value={next} />}
      {g === "weight" && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label">현재 체중(kg)</label>
            <input name="start_kg" type="number" step="0.1" min="20" className="input" defaultValue={goal?.start_kg ?? ""} placeholder="70" required />
          </div>
          <div>
            <label className="label">감량 목표(kg)</label>
            <input name="target_kg" type="number" step="0.1" min="0.1" className="input" defaultValue={goal?.target_kg ?? ""} placeholder="5" required />
          </div>
          <div>
            <label className="label">기간(일)</label>
            <input name="days" type="number" min="1" max="365" className="input" defaultValue={goal?.days ?? 30} required />
          </div>
        </div>
      )}
      {g === "hobby" && (
        <div>
          <label className="label">내가 도전할 취미</label>
          <input name="hobby" className="input" defaultValue={goal?.hobby ?? ""} placeholder="예: 기타 연습, 러닝 5km, 수채화" maxLength={30} required />
        </div>
      )}
      {g === "none" && <p className="text-sm text-fg-2">바로 참여할 수 있어요.</p>}
      <FormMessage state={state} />
      <SubmitButton>{mode === "join" ? "참여하기" : "목표 저장"}</SubmitButton>
    </form>
  );
}
