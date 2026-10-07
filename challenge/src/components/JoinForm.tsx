"use client";

import { useActionState, useMemo, useState } from "react";
import { joinChallenge, updateGoal } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";
import { ALL_METHODS, inferMethods, METHOD_LABEL, normalizeMethods, type Method } from "@/lib/methods";
import { dailyCalorieDeficit } from "@/lib/game";
import type { Challenge, ParticipationGoal } from "@/lib/types";

/** 챌린지 참여(또는 목표 수정) 폼. 목표 종류에 따라 입력이 달라진다. */
export function JoinForm({ challenge, goal, mode = "join", next }: { challenge: Challenge; goal?: ParticipationGoal; mode?: "join" | "edit"; next?: string }) {
  const [state, action] = useActionState(mode === "join" ? joinChallenge : updateGoal, null);
  const g = challenge.config.goal;

  // 체중: 입력하면 바로 목표 체중·하루 칼로리 미리보기
  const [startKg, setStartKg] = useState(goal?.start_kg?.toString() ?? "");
  const [loss, setLoss] = useState(goal?.target_kg?.toString() ?? "");
  const [days, setDays] = useState(goal?.days?.toString() ?? "30");
  const preview = useMemo(() => {
    const s = parseFloat(startKg), l = parseFloat(loss), d = parseInt(days, 10);
    if (!(s > 0) || !(l > 0) || !(d > 0)) return null;
    return { goalKg: Math.round((s - l) * 10) / 10, kcal: dailyCalorieDeficit(l, d) };
  }, [startKg, loss, days]);

  // 취미: 글자에 맞춰 인증 방식 자동 추천, 직접 바꿀 수 있음
  const [hobby, setHobby] = useState(goal?.hobby ?? "");
  const [touched, setTouched] = useState(Boolean(goal?.methods?.length));
  const [methods, setMethods] = useState<Method[]>(normalizeMethods(goal?.methods).length ? normalizeMethods(goal?.methods) : inferMethods(goal?.hobby ?? ""));
  function onHobby(v: string) {
    setHobby(v);
    if (!touched) setMethods(inferMethods(v));
  }
  function toggle(m: Method) {
    setTouched(true);
    setMethods((cur) => (cur.includes(m) ? (cur.length > 1 ? cur.filter((x) => x !== m) : cur) : [...cur, m]));
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="challenge_id" value={challenge.id} />
      {next && <input type="hidden" name="next" value={next} />}
      {g === "weight" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">현재 체중(kg)</label>
              <input name="start_kg" type="number" step="0.1" min="20" inputMode="decimal" className="input" value={startKg} onChange={(e) => setStartKg(e.target.value)} placeholder="70" required />
            </div>
            <div>
              <label className="label">뺄 목표(kg)</label>
              <input name="target_kg" type="number" step="0.1" min="0.1" inputMode="decimal" className="input" value={loss} onChange={(e) => setLoss(e.target.value)} placeholder="5" required />
            </div>
            <div>
              <label className="label">기간(일)</label>
              <input name="days" type="number" min="1" max="365" inputMode="numeric" className="input" value={days} onChange={(e) => setDays(e.target.value)} required />
            </div>
          </div>
          {preview && (
            <div className="rounded-xl bg-bg-3/70 px-3 py-2 text-sm">
              목표 체중 <b className="num">{preview.goalKg} kg</b> · 매일 <b className="num">{preview.kcal.toLocaleString()} kcal</b> 덜 먹어야 해요
              <div className="text-[11px] text-fg-3 mt-0.5">체중은 나만 볼 수 있어요. 매일 홈에서 기록하면 게이지가 움직여요.</div>
            </div>
          )}
        </>
      )}
      {g === "hobby" && (
        <>
          <div>
            <label className="label">내가 도전할 취미</label>
            <input name="hobby" className="input" value={hobby} onChange={(e) => onHobby(e.target.value)} placeholder="예: 소설 쓰기, 기타 연습, 러닝 5km" maxLength={30} required />
          </div>
          <div>
            <label className="label">인증 방법 (취미에 맞춰 골라 뒀어요, 바꿔도 돼요)</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_METHODS.map((m) => (
                <button key={m} type="button" onClick={() => toggle(m)} className={`chip py-1.5 px-3 text-xs border ${methods.includes(m) ? "bg-fg text-white border-fg" : "bg-bg-2 text-fg-2 border-line"}`}>
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
            {methods.map((m) => <input key={m} type="hidden" name="methods" value={m} />)}
          </div>
        </>
      )}
      {g === "none" && <p className="text-sm text-fg-2">바로 참여할 수 있어요.</p>}
      <FormMessage state={state} />
      <SubmitButton className="btn btn-red w-full">{mode === "join" ? "참여하기" : "목표 저장"}</SubmitButton>
    </form>
  );
}
