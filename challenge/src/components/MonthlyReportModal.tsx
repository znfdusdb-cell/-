"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ackMonthly } from "@/app/actions";
import { MONTH_BONUS_XP, praiseFor } from "@/lib/game";
import { Character } from "./Character";
import type { MonthlyReportView } from "@/lib/data";

/** 월이 바뀐 뒤 처음 열 때: 지난달 성공률 + 칭찬. 챌린지마다 한 장씩 넘긴다. */
export function MonthlyReportModal({ reports, level, gender }: { reports: MonthlyReportView[]; level: number; gender: "m" | "f" }) {
  const [i, setI] = useState(0);
  const router = useRouter();
  const cur = reports[i];
  if (!cur) return null;
  const r = cur.report;
  const praise = praiseFor(r.rate, r.survived);
  const [y, m] = cur.report.month.split("-");

  async function next() {
    const fd = new FormData();
    fd.set("participation_id", cur.participationId);
    fd.set("month", r.month);
    fd.set("survived", r.survived ? "1" : "0");
    await ackMonthly(null, fd);
    if (i + 1 < reports.length) setI(i + 1);
    else { setI(reports.length); router.refresh(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6">
      <div className="card w-full max-w-sm p-6 text-center animate-pop">
        <div className="text-xs font-extrabold tracking-widest text-red">{parseInt(y, 10)}년 {parseInt(m, 10)}월 결산</div>
        <div className="flex justify-center my-1"><Character level={level} gender={gender} size={120} mood={r.survived ? "happy" : "sad"} className={r.survived ? "animate-bounce-char" : ""} /></div>
        <div className="text-sm text-fg-2">{cur.emoji} {cur.challengeTitle}</div>
        <div className="text-4xl font-extrabold num mt-1">{r.rate}%</div>
        <div className="text-xs text-fg-3 num">{r.complete}/{r.total} 성공 · 실패 {r.fails}</div>
        <div className="text-xl font-extrabold mt-3">{praise.title}</div>
        <p className="text-sm text-fg-2 mt-1">{praise.body}</p>
        {r.survived && <div className="chip bg-gold-soft text-gold mt-3 num">한 달 완주 보너스 +{MONTH_BONUS_XP} XP</div>}
        <button className="btn btn-dark w-full mt-5" onClick={next}>{i + 1 < reports.length ? "다음" : "새 달 시작!"}</button>
      </div>
    </div>
  );
}
