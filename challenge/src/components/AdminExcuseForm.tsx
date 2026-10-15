"use client";

import { useActionState, useState } from "react";
import { adminExcuseSlot } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

/** 관리자: 멤버의 특정 날짜·시간대를 인증 완료로 수동 처리 (오류로 못 올린 경우) */
export function AdminExcuseForm({ challengeId, userId, name, slots, today }: { challengeId: string; userId: string; name: string; slots: { key: string; label: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(adminExcuseSlot, null);
  if (!open) return <button type="button" className="btn btn-ghost text-[11px] py-1 px-2" onClick={() => setOpen(true)}>관리자: 인증 수동 완료</button>;
  return (
    <form action={action} className="mt-1 w-full rounded-xl border border-line bg-bg-2 p-2 space-y-1.5 text-xs">
      <input type="hidden" name="challenge_id" value={challengeId} />
      <input type="hidden" name="user_id" value={userId} />
      <div className="font-bold">{name} 인증 수동 완료 (사진 없이 기록, 깎인 실패·경험치 복구)</div>
      <div className="flex gap-1.5">
        <input name="date" type="date" className="input py-1.5 text-xs" defaultValue={today} max={today} required />
        {slots.length > 0 && (
          <select name="slot" className="input py-1.5 text-xs">
            {slots.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}
      </div>
      <input name="reason" className="input py-1.5 text-xs" placeholder="사유 (예: 네트워크 오류로 업로드 실패)" maxLength={100} />
      <div className="flex gap-1.5">
        <button type="button" className="btn btn-ghost flex-1 py-1.5 text-xs" onClick={() => setOpen(false)}>닫기</button>
        <SubmitButton className="btn btn-dark flex-1 py-1.5 text-xs" pendingText="처리 중…">완료 처리</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
