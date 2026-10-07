"use client";

import { useActionState, useState } from "react";
import { createChallenge, updateChallenge } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";
import type { Challenge } from "@/lib/types";

/** 챌린지 개설(create) / 수정(edit) 폼 */
export function ChallengeForm({ challenge }: { challenge?: Challenge }) {
  const editing = Boolean(challenge);
  const [state, action] = useActionState(editing ? updateChallenge : createChallenge, null);
  const [kind, setKind] = useState<"slots" | "count">(challenge?.config.kind ?? "count");
  const [slotCount, setSlotCount] = useState(challenge?.config.kind === "slots" ? challenge.config.slots.length : 2);
  const [editConfig, setEditConfig] = useState(!editing);

  const slots = challenge?.config.kind === "slots" ? challenge.config.slots : [];
  const count = challenge?.config.kind === "count" ? challenge.config : null;

  return (
    <form action={action} className="space-y-4">
      {challenge && <input type="hidden" name="challenge_id" value={challenge.id} />}
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <div>
          <label className="label">이모지</label>
          <input name="emoji" className="input text-center" defaultValue={challenge?.emoji ?? "🏆"} maxLength={4} />
        </div>
        <div>
          <label className="label">챌린지 이름</label>
          <input name="title" className="input" defaultValue={challenge?.title ?? ""} placeholder="예: 매일 만보 걷기" maxLength={30} required />
        </div>
      </div>
      <div>
        <label className="label">설명</label>
        <textarea name="description" className="input" rows={2} defaultValue={challenge?.description ?? ""} maxLength={200} placeholder="어떻게 인증하는지 한두 줄" />
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div>
          <label className="label">실패하면 잃는 것 (벌칙)</label>
          <input name="penalty" className="input" defaultValue={challenge?.penalty ?? "톡방에 메가커피 아메리카노 쿠폰 쏘기"} maxLength={80} required />
        </div>
        <div>
          <label className="label">한 달 실패 허용(회)</label>
          <input name="max_fails" type="number" min="0" max="30" inputMode="numeric" className="input" defaultValue={challenge?.max_fails ?? 3} required />
        </div>
      </div>
      <p className="text-[11px] text-fg-3 -mt-2">실패 1번마다 경험치가 깎이고, 한 달 안에 이 횟수에 닿으면 탈락해서 벌칙(기프티콘)을 올려요. 0이면 탈락 없음.</p>
      {editing && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={challenge!.is_active} /> 참여 가능(비활성화하면 목록에서 숨김)
        </label>
      )}

      {editing && !editConfig ? (
        <button type="button" className="btn btn-ghost w-full text-sm" onClick={() => setEditConfig(true)}>인증 규칙 바꾸기 (시간대·횟수)</button>
      ) : (
        <div className="card p-3 space-y-3">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-bg-3">
            {(["count", "slots"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`py-2 rounded-lg text-sm font-semibold ${kind === k ? "bg-fg text-white" : "text-fg-2"}`}>
                {k === "count" ? "횟수형 (취미처럼)" : "시간대형 (식사처럼)"}
              </button>
            ))}
          </div>
          <input type="hidden" name="kind" value={kind} />
          {kind === "count" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">기간(일)</label>
                <input name="period_days" type="number" min="1" max="90" className="input" defaultValue={count?.period_days ?? 7} required />
              </div>
              <div>
                <label className="label">기간당 인증 횟수</label>
                <input name="times" type="number" min="1" max="50" className="input" defaultValue={count?.times ?? 1} required />
              </div>
              <div className="col-span-2">
                <label className="label">참여할 때 받을 정보</label>
                <select name="goal" className="input" defaultValue={count?.goal ?? "hobby"}>
                  <option value="hobby">도전 내용 한 줄 (취미처럼)</option>
                  <option value="none">없음</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: slotCount }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2">
                  {slots[i]?.key && <input type="hidden" name={`slot_key_${i}`} value={slots[i].key} />}
                  <input name={`slot_label_${i}`} className="input" placeholder={i === 0 ? "점심" : i === 1 ? "저녁" : "이름"} defaultValue={slots[i]?.label ?? (i === 0 ? "점심" : i === 1 ? "저녁" : "")} maxLength={10} />
                  <input name={`slot_start_${i}`} type="time" className="input px-2" defaultValue={slots[i]?.start ?? (i === 0 ? "11:00" : i === 1 ? "17:00" : "")} />
                  <input name={`slot_end_${i}`} type="time" className="input px-2" defaultValue={slots[i]?.end ?? (i === 0 ? "14:00" : i === 1 ? "20:00" : "")} />
                </div>
              ))}
              <div className="flex gap-2">
                {slotCount < 6 && <button type="button" className="btn btn-ghost text-xs py-1.5" onClick={() => setSlotCount((n) => n + 1)}>+ 시간대</button>}
                {slotCount > 1 && <button type="button" className="btn btn-ghost text-xs py-1.5" onClick={() => setSlotCount((n) => n - 1)}>− 시간대</button>}
              </div>
              <div>
                <label className="label">참여할 때 받을 정보</label>
                <select name="goal" className="input" defaultValue={challenge?.config.kind === "slots" ? challenge.config.goal : "none"}>
                  <option value="none">없음</option>
                  <option value="weight">체중 목표 (다이어트처럼)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton className="btn btn-red w-full">{editing ? "저장" : "챌린지 만들기"}</SubmitButton>
    </form>
  );
}
