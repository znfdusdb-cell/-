"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** 탈락 벌칙: 기프티콘 이미지를 올리면 성공 중인 멤버 한 명에게 랜덤으로 간다. */
export function GiftUploadButton({ challengeId }: { challengeId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ toName: string | null } | null>(null);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("challenge_id", challengeId);
      fd.set("file", file, file.name || "gift.jpg");
      const res = await fetch("/api/gift", { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; error?: string; toName: string | null };
      if (!data.ok) return setError(data.error ?? "올리지 못했어요");
      setDone({ toName: data.toName });
    } catch {
      setError("네트워크 오류. 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <button type="button" className="btn btn-red w-full mt-3" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "보내는 중…" : "벌칙 기프티콘 올리기"}
      </button>
      <p className="text-[11px] text-fg-3 mt-1.5">앨범에서 기프티콘 캡처를 고르면 성공 중인 멤버 한 명에게 랜덤으로 전달돼요. 누구에게 가는지는 보낸 뒤에 알려 드려요.</p>
      {error && <p className="text-sm text-bad mt-2">{error}</p>}
      {done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => { setDone(null); router.refresh(); }}>
          <div className="card w-full max-w-sm p-6 text-center animate-pop" onClick={(e) => e.stopPropagation()}>
            <div className="text-4xl">🎁</div>
            <div className="text-xl font-extrabold mt-2">{done.toName ? `${done.toName}님에게 전달됐어요` : "기록했어요"}</div>
            <p className="text-sm text-fg-2 mt-1">{done.toName ? "그분 선물함에 깜짝 선물로 들어갔어요. 이제 다시 도전할 수 있어요." : "지금 받을 수 있는 성공 멤버가 없어서 기록만 남겼어요. 다시 도전할 수 있어요."}</p>
            <button className="btn btn-dark w-full mt-5" onClick={() => { setDone(null); router.refresh(); }}>닫기</button>
          </div>
        </div>
      )}
    </>
  );
}
