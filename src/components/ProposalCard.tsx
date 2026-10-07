"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Proposal } from "@/lib/types";
import { PROPOSAL_KIND_LABEL, AUTHOR_LABEL, SETTING_KEYS } from "@/lib/constants";
import { decideProposalAction } from "@/app/actions";

/** 변경 문: 제안 1건. 승인하면 다음 거래일 08:30 적용(설정), 거절은 이유 필수. */
export function ProposalCard({ p, easy }: { p: Proposal; easy?: boolean }) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const sk = SETTING_KEYS.find((k) => k.key === p.target);
  const targetLabel = p.kind === "setting" ? (sk?.label ?? p.target) : p.target;

  function go(decision: "approve" | "reject") {
    setErr(null);
    start(async () => {
      const r = await decideProposalAction({ id: p.id, decision, note });
      if (!r.ok) { setErr(r.error); return; }
      setDone(decision === "approve" ? (r.apply_at ? `승인. 적용 예정 ${new Date(r.apply_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}` : "승인") : "거절");
      setMode(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-line bg-bg-2 p-3">
      <div className="flex items-center justify-between gap-2 text-[11px] text-fg-3">
        <span>{PROPOSAL_KIND_LABEL[p.kind]} 변경 제안 · {AUTHOR_LABEL[p.proposer]}</span>
        <span>{p.created_at.slice(5, 10).replace("-", "/")}</span>
      </div>
      <div className="mt-1 font-semibold">{targetLabel}: <span className="num text-fg-2">{p.current_value ?? "없음"}</span> → <span className="num">{p.proposed_value}</span></div>
      {easy && p.plain ? <p className="mt-1 text-sm">{p.plain}</p> : null}
      <p className={`mt-1 ${easy ? "text-xs text-fg-3" : "text-sm text-fg-2"}`}>이유: {p.reason}</p>
      {p.evidence && <p className="text-xs text-fg-3">근거: {p.evidence}</p>}
      {sk && <p className="mt-1 text-[11px] text-fg-3">이 값의 뜻: {sk.easy}</p>}
      <p className="mt-1 text-[11px] text-fg-3">승인하면 다음 거래일 08:30에 적용돼요. 장중엔 바뀌지 않아요.</p>
      {done ? (
        <p className="mt-2 text-sm text-go">{done}</p>
      ) : mode ? (
        <div className="mt-2 rounded-lg border border-line bg-bg-3 p-2 text-sm">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={mode === "reject" ? "거절 이유 (필수)" : "메모 (선택)"} className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-sm outline-none" />
          {err && <p className="mt-1 text-stop">{err}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={() => setMode(null)} disabled={pending} className="flex-1 rounded-lg border border-line px-3 py-2">취소</button>
            <button onClick={() => go(mode)} disabled={pending} className={`flex-1 rounded-lg px-3 py-2 font-semibold ${mode === "approve" ? "bg-go text-bg" : "bg-stop text-white"}`}>{pending ? "처리 중…" : mode === "approve" ? "승인 확정" : "거절 확정"}</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button onClick={() => setMode("approve")} className="flex-1 rounded-lg border border-go/60 bg-go/10 px-3 py-2 text-sm font-medium text-go">승인</button>
          <button onClick={() => setMode("reject")} className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-fg-2">거절</button>
        </div>
      )}
    </div>
  );
}
