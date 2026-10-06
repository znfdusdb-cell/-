"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveThesisAction } from "@/app/actions";

export function ThesisApproveButton({ thesisId, code }: { thesisId: number; code: string }) {
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      {!ask ? (
        <button onClick={() => setAsk(true)} className="rounded-lg border border-go/60 bg-go/10 px-3 py-2 text-sm font-medium text-go">
          가설 승인 (내가 읽었고 맞다)
        </button>
      ) : (
        <div className="rounded-lg border border-line bg-bg-3 p-3 text-sm">
          <p className="text-fg-2">이 가설과 '틀렸다고 인정할 조건'을 내 것으로 삼는다. 승인하면 살 수 있는 목록 승인이 열린다.</p>
          {err && <p className="mt-1 text-stop">{err}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={() => setAsk(false)} disabled={pending} className="flex-1 rounded-lg border border-line px-3 py-2">취소</button>
            <button
              disabled={pending}
              onClick={() => start(async () => {
                const r = await approveThesisAction({ thesisId, code, note: "사이트 버튼 승인" });
                if (!r.ok) { setErr(r.error); return; }
                setAsk(false); router.refresh();
              })}
              className="flex-1 rounded-lg bg-go px-3 py-2 font-semibold text-bg disabled:opacity-40"
            >
              {pending ? "승인 중…" : "승인"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
