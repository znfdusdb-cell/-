"use client";

import { useActionState } from "react";
import { adminTestJoin } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

/** 관리자 테스트 참여 토글 (챌린지 상세·관리 탭). mode: join(숨김 참여) / official(정식 참여로 전환) / all(모든 챌린지) */
export function TestJoinButton({ challengeId, mode, className = "btn btn-ghost text-xs py-1.5" }: { challengeId?: string; mode: "join" | "official" | "all"; className?: string }) {
  const [state, action] = useActionState(adminTestJoin, null);
  const label = mode === "all" ? "관리자: 모든 챌린지 테스트 참여 (숨김)" : mode === "join" ? "관리자: 테스트 참여 (숨김 · 24시간 업로드)" : "정식 참여로 전환";
  return (
    <form action={action} className="inline-block">
      {challengeId && <input type="hidden" name="challenge_id" value={challengeId} />}
      <input type="hidden" name="mode" value={mode} />
      <SubmitButton className={className}>{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
