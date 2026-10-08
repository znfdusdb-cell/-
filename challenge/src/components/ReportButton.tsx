"use client";

import { useActionState, useState } from "react";
import { reportCheckin } from "@/app/actions";
import { REPORT_REASONS } from "@/lib/reports";
import { FormMessage, SubmitButton } from "./Form";

/** 인증 신고 버튼 → 사유 고르는 작은 창 */
export function ReportButton({ checkinId, reported }: { checkinId: string; reported: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(reportCheckin, null);
  if (reported || state?.ok) return <span className="text-[10px] text-fg-3">신고됨</span>;
  return (
    <>
      <button type="button" className="text-[10px] text-fg-3 underline" onClick={() => setOpen(true)}>신고</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <form action={action} className="card w-full max-w-sm p-5 animate-pop" onClick={(e) => e.stopPropagation()}>
            <input type="hidden" name="checkin_id" value={checkinId} />
            <div className="font-extrabold">이 인증을 신고할까요?</div>
            <p className="text-xs text-fg-2 mt-1">관리자가 확인해서 불인정이면 그 시간대는 실패로 처리돼요. 장난 신고는 삼가 주세요.</p>
            <div className="mt-3 space-y-1.5">
              {REPORT_REASONS.map((r, i) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="reason" value={r} defaultChecked={i === 0} /> {r}
                </label>
              ))}
            </div>
            <input name="detail" className="input mt-2" placeholder="설명 (선택)" maxLength={200} />
            <FormMessage state={state} />
            <div className="flex gap-2 mt-3">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>취소</button>
              <SubmitButton className="btn btn-red flex-1">신고하기</SubmitButton>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
