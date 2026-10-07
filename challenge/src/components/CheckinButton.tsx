"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Character } from "./Character";

type Result = {
  ok: boolean;
  error?: string;
  replaced?: boolean;
  xp: number;
  reasons: string[];
  totalXp: number;
  level: number;
  leveledUp: boolean;
  completed: boolean;
  streak: number;
};

/** 긴 변 1280px, JPEG 0.82 로 압축. EXIF 회전은 브라우저가 처리. */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function CheckinButton({
  challengeId,
  slot,
  label,
  disabled,
  className = "btn btn-red w-full",
}: {
  challengeId: string;
  slot?: string;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const takenAt = Date.now();
      const blob = await compress(file);
      const fd = new FormData();
      fd.set("challenge_id", challengeId);
      if (slot) fd.set("slot", slot);
      fd.set("taken_at", String(takenAt));
      fd.set("photo", blob, "photo.jpg");
      const res = await fetch("/api/checkin", { method: "POST", body: fd });
      const data = (await res.json()) as Result;
      if (!data.ok) {
        setError(data.error ?? "업로드에 실패했어요");
        return;
      }
      setResult(data); // 새로고침은 모달을 닫을 때 (완료 상태로 바뀌며 버튼이 사라지면 모달도 같이 사라지므로)
    } catch {
      setError("네트워크 오류. 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setResult(null);
    router.refresh();
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <button type="button" className={className} disabled={disabled || busy} onClick={() => input.current?.click()}>
        {busy ? "올리는 중…" : <>📷 {label}</>}
      </button>
      {error && <p className="text-sm text-bad mt-2">{error}</p>}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={close}>
          <div className="card w-full max-w-sm p-6 text-center animate-pop" onClick={(e) => e.stopPropagation()}>
            {result.leveledUp ? (
              <>
                <div className="font-display text-3xl text-gold">LEVEL UP!</div>
                <div className="flex justify-center my-2"><Character level={result.level} size={150} /></div>
                <div className="font-display text-2xl">Lv.{result.level}</div>
              </>
            ) : (
              <div className="text-5xl mb-2">{result.replaced ? "🔄" : result.completed ? "🎉" : "✅"}</div>
            )}
            <div className="font-display text-2xl mt-1">{result.replaced ? "사진을 바꿨어요" : result.completed ? "완료!" : "인증 완료"}</div>
            {result.xp > 0 && <div className="font-display text-4xl text-red-2 mt-1">+{result.xp} XP</div>}
            <ul className="text-sm text-fg-2 mt-3 space-y-0.5">
              {result.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            {result.streak > 1 && <div className="chip bg-bg-3 text-gold mt-3">🔥 {result.streak} 연속</div>}
            <button className="btn btn-ghost w-full mt-5" onClick={close}>닫기</button>
          </div>
        </div>
      )}
    </>
  );
}
