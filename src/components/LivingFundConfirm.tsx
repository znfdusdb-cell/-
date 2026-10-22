"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmLivingFundAction } from "@/app/actions";

const CHECKS = [
  "봇 계좌 돈은 1년 안에 쓸 계획이 없다.",
  "카드값·수술비·생활비는 이 계좌 밖에 따로 있다.",
  "봇 계좌 돈을 갚으려고 VOO(코어)를 팔 일은 없다.",
];

/** FN-1. 확인 전엔 DB 관문(sb_buy_blockers)이 봇 매수를 막는다. */
export function LivingFundConfirm({ confirmedAt, easy = false }: { confirmedAt: string | null; easy?: boolean }) {
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = checked.every(Boolean);

  const send = (confirm: boolean) =>
    start(async () => {
      const r = await confirmLivingFundAction({ confirm });
      if (!r.ok) { setErr(r.error); return; }
      setErr(null); router.refresh();
    });

  if (confirmedAt) {
    return (
      <div className={`rounded-xl border border-line bg-bg-2 p-3 ${easy ? "text-sm" : "text-xs"}`}>
        <div className="text-fg">생활비 분리 확인: {confirmedAt}</div>
        <div className="text-fg-3">사정이 바뀌어 1년 안에 쓸 돈이 생기면 바로 취소해요. 취소하면 봇이 새로 사지 않아요.</div>
        {err && <p className="mt-1 text-stop">{err}</p>}
        <button disabled={pending} onClick={() => send(false)} className="mt-2 rounded-lg border border-line px-3 py-1.5 text-fg-2 disabled:opacity-40">
          {pending ? "처리 중…" : "확인 취소"}
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-warn/60 bg-bg-2 p-4 ${easy ? "" : "text-sm"}`}>
      <div className={easy ? "text-lg font-bold" : "font-semibold"}>생활비 분리 확인</div>
      <p className="mt-1 text-sm text-fg-2">봇 계좌에는 1년 안에 쓸 계획이 없는 돈만 넣어요. 세 문장이 모두 맞을 때만 체크하세요. 확인 전엔 봇이 아무것도 사지 않아요.</p>
      <ul className="mt-2 space-y-2">
        {CHECKS.map((c, i) => (
          <li key={i}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={checked[i]} onChange={(e) => setChecked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span>{c}</span>
            </label>
          </li>
        ))}
      </ul>
      {err && <p className="mt-1 text-sm text-stop">{err}</p>}
      <button disabled={!all || pending} onClick={() => send(true)} className="mt-3 w-full rounded-lg bg-go px-3 py-2 font-semibold text-bg disabled:opacity-40">
        {pending ? "확인 중…" : "세 문장 모두 맞다. 확인"}
      </button>
    </div>
  );
}
