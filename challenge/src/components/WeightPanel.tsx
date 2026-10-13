"use client";

import { useActionState } from "react";
import { logWeight } from "@/app/actions";
import { dailyCalorieDeficit, weightProgress, type MealPlan } from "@/lib/game";
import Link from "next/link";
import { FormMessage, SubmitButton } from "./Form";

/** 다이어트 체중 게이지 (본인만 보임). 매일 체중을 넣으면 목표까지 얼마나 왔는지, 하루 줄일 칼로리를 보여준다. */
export function WeightPanel({
  challengeId,
  startKg,
  targetLoss,
  days,
  elapsedDays,
  logs,
  today,
  budget,
}: {
  challengeId: string;
  startKg: number;
  targetLoss: number;
  days: number;
  elapsedDays: number;
  logs: { date: string; kg: number }[];
  today: string;
  /** 오늘 칼로리 예산(인증 끼니 합계 한도)과 지금까지 AI로 잡힌 양 */
  budget?: { budget: number; plan: MealPlan | null; consumed: number };
}) {
  const [state, action] = useActionState(logWeight, null);
  const latest = logs.length ? logs[logs.length - 1] : null;
  const todayLog = logs.find((l) => l.date === today) ?? null;
  const p = weightProgress(startKg, targetLoss, latest?.kg ?? null);
  const remainingDays = Math.max(0, days - Math.max(0, elapsedDays));
  const kcal = dailyCalorieDeficit(p.remainingKg, remainingDays);
  const prev = logs.length >= 2 ? logs[logs.length - 2] : null;
  const delta = latest && prev ? Math.round((latest.kg - prev.kg) * 10) / 10 : null;

  return (
    <div className="mt-3 rounded-2xl border border-line bg-bg-3/60 p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold text-fg-2">내 체중 (나만 보여요)</div>
        <div className="text-xs text-fg-3 num">D-{remainingDays}</div>
      </div>
      <div className="flex items-end justify-between mt-1">
        <div>
          <span className="text-2xl font-extrabold num">{latest ? latest.kg : startKg}</span>
          <span className="text-sm text-fg-2"> kg</span>
          {delta !== null && delta !== 0 && <span className={`ml-2 text-xs font-bold num ${delta < 0 ? "text-ok" : "text-bad"}`}>{delta < 0 ? "▼" : "▲"} {Math.abs(delta)}</span>}
        </div>
        <div className="text-right text-xs text-fg-2">
          목표 <b className="text-fg num">{p.goalKg} kg</b>
          <div className="num">{p.reached ? "목표 달성" : `${p.remainingKg} kg 더`}</div>
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-bg-2 border border-line mt-2 overflow-hidden">
        <div className={`h-full rounded-full transition-[width] duration-700 ${p.reached ? "bg-ok" : "bg-red"}`} style={{ width: `${Math.max(3, p.ratio * 100)}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-fg-3 mt-1 num">
        <span>{startKg} kg</span>
        <span>{p.lost} / {targetLoss} kg 감량</span>
        <span>{p.goalKg} kg</span>
      </div>
      {!p.reached && kcal > 0 && (
        <p className="text-xs text-fg-2 mt-2">
          남은 {remainingDays}일 동안 매일 <b className="text-fg num">{kcal.toLocaleString()} kcal</b> 덜 먹으면 목표에 닿아요.
        </p>
      )}
      {p.reached && <p className="text-xs text-ok font-semibold mt-2">목표 체중에 도달했어요. 유지가 진짜 승부예요.</p>}
      {budget && budget.budget > 0 && (
        <div className="mt-2 rounded-xl bg-bg-2 border border-line px-3 py-2 text-xs">
          <div className="flex items-center justify-between num">
            <span>🤖 오늘 먹을 수 있는 칼로리 <b className="text-fg">{budget.budget.toLocaleString()}</b></span>
            <span className={budget.consumed > budget.budget ? "text-bad font-bold" : "text-fg-2"}>
              {budget.consumed > 0 ? `먹음 ${budget.consumed.toLocaleString()} · ` : ""}
              {budget.consumed > budget.budget ? `초과 ${(budget.consumed - budget.budget).toLocaleString()}` : `남음 ${(budget.budget - budget.consumed).toLocaleString()}`}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-3 mt-1 overflow-hidden">
            <div className={`h-full rounded-full ${budget.consumed > budget.budget ? "bg-bad" : "bg-red"}`} style={{ width: `${Math.min(100, (budget.consumed / budget.budget) * 100)}%` }} />
          </div>
          {budget.plan ? (
            <div className="text-fg-3 num mt-1">기초대사 {budget.plan.bmr.toLocaleString()} · 하루 섭취 목표 {budget.plan.dailyTarget.toLocaleString()} kcal · 끼니별로 나누지 않고 합계로 봐요{budget.plan.clamped ? " · 기간 대비 목표가 커서 최소 섭취선 기준" : ""}</div>
          ) : (
            <div className="text-fg-3 mt-1">챌린지 기본값 · <Link href={`/challenges/${challengeId}`} className="underline">키를 넣으면 내 몸에 맞게 바뀌어요</Link></div>
          )}
        </div>
      )}
      <form action={action} className="flex gap-2 mt-3">
        <input type="hidden" name="challenge_id" value={challengeId} />
        <input name="kg" type="number" step="0.1" min="20" max="300" inputMode="decimal" className="input py-2" placeholder={todayLog ? `오늘 ${todayLog.kg} kg 기록됨` : "오늘 체중 (kg)"} required />
        <SubmitButton className="btn btn-dark text-sm py-2 px-4 shrink-0">{todayLog ? "수정" : "기록"}</SubmitButton>
      </form>
      <FormMessage state={state} />
    </div>
  );
}
