"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 알림을 눌러 들어왔는데 그 시간대가 지금 열려 있지 않을 때 안내 */
export function DeepLinkNotice({ label, start, end, state }: { label: string; start: string; end: string; state: "done" | "upcoming" | "missed" }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  if (!open) return null;
  const close = () => { setOpen(false); router.replace("/"); };
  const msg = state === "done" ? `${label} 인증은 이미 올렸어요.` : state === "upcoming" ? `${label} 인증은 ${start}부터예요. 시간이 되면 알림으로 알려 드릴게요.` : `${label} 인증 시간(${start}~${end})이 지났어요.`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={close}>
      <div className="card w-full max-w-sm p-6 text-center animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className="text-3xl">{state === "done" ? "✅" : "⏰"}</div>
        <div className="font-extrabold mt-2">{msg}</div>
        <button type="button" className="btn btn-dark w-full mt-4" onClick={close}>확인</button>
      </div>
    </div>
  );
}
