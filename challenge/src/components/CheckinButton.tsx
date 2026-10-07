"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Character } from "./Character";

export type CheckinResult = {
  ok: boolean;
  error?: string;
  replaced?: boolean;
  xp: number;
  reasons: string[];
  totalXp: number;
  level: number;
  gender?: "m" | "f";
  /** 오늘(이번 기간) 완료한 사람 중 몇 번째 */
  completedRank?: number | null;
  leveledUp: boolean;
  completed: boolean;
  streak: number;
};

function stampText(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 긴 변 1280px, JPEG 0.82 로 압축. 촬영본(camera)은 오른쪽 아래에 날짜·시각을 새긴다. */
async function compress(file: File, stamp: Date | null): Promise<Blob> {
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
    if (stamp) {
      const text = stampText(stamp);
      const size = Math.max(18, Math.round(w / 28));
      ctx.font = `bold ${size}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
      ctx.textBaseline = "bottom";
      const tw = ctx.measureText(text).width;
      const pad = Math.round(size * 0.5);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(w - tw - pad * 3, h - size - pad * 2.2, tw + pad * 2, size + pad * 1.4);
      ctx.fillStyle = "#ffd54a";
      ctx.fillText(text, w - tw - pad * 2, h - pad * 1.1);
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadCheckin(fd: FormData): Promise<CheckinResult> {
  const res = await fetch("/api/checkin", { method: "POST", body: fd });
  return (await res.json()) as CheckinResult;
}

/** 인증 결과 모달. 닫으면 화면을 새로고침한다. */
const CONFETTI = ["#e4002b", "#f3c84b", "#5fcf7a", "#063672", "#ff8a00", "#ffffff"];

export function ResultModal({ result, onClose }: { result: CheckinResult; onClose: () => void }) {
  const celebrate = result.completed && !result.replaced;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 overflow-hidden" onClick={onClose}>
      {celebrate && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className="confetti" style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 7) * 0.12}s`, animationDuration: `${1.6 + (i % 5) * 0.25}s` }} />
          ))}
        </div>
      )}
      <div className="card w-full max-w-sm p-6 text-center animate-pop" onClick={(e) => e.stopPropagation()}>
        {result.leveledUp ? (
          <>
            <div className="text-xs font-extrabold tracking-widest text-red">LEVEL UP</div>
            <div className="flex justify-center my-1"><Character level={result.level} gender={result.gender} size={150} className="animate-bounce-char" /></div>
            <div className="text-2xl font-extrabold">Lv.{result.level}</div>
          </>
        ) : (
          <div className="flex justify-center my-1"><Character level={result.level} gender={result.gender} size={110} className={celebrate ? "animate-bounce-char" : ""} /></div>
        )}
        <div className="text-xl font-extrabold mt-1">{result.replaced ? "사진을 바꿨어요" : result.completed ? "오늘 완료!" : "인증 완료"}</div>
        {celebrate && result.completedRank ? <div className="text-sm font-bold text-red mt-0.5">오늘 {result.completedRank}번째로 완료했어요</div> : null}
        {result.xp > 0 && <div className="text-3xl font-extrabold text-red mt-1 num">+{result.xp} XP</div>}
        <ul className="text-sm text-fg-2 mt-3 space-y-0.5">
          {result.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {result.streak > 1 && <div className="chip bg-gold-soft text-gold mt-3">{result.streak} 연속</div>}
        <button className="btn btn-dark w-full mt-5" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

/**
 * 사진 인증 버튼.
 *  mode="camera": 앱에서 바로 촬영 (날짜·시각 새김)
 *  mode="album" : 앨범에서 고르기
 */
export function CheckinButton({
  challengeId,
  slot,
  label,
  mode = "camera",
  disabled,
  className = "btn btn-red w-full",
  autoOpen = false,
}: {
  challengeId: string;
  slot?: string;
  label: string;
  mode?: "camera" | "album";
  disabled?: boolean;
  className?: string;
  /** 알림에서 들어왔을 때: 바로 카메라 열기 시도, 막히면 버튼 강조 */
  autoOpen?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(autoOpen);
  const router = useRouter();

  useEffect(() => {
    if (!autoOpen) return;
    btn.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => { try { input.current?.click(); } catch {} }, 350);
    const clean = window.setTimeout(() => router.replace("/"), 1200);
    return () => { window.clearTimeout(t); window.clearTimeout(clean); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const blob = await compress(file, mode === "camera" ? now : null);
      const fd = new FormData();
      fd.set("challenge_id", challengeId);
      if (slot) fd.set("slot", slot);
      fd.set("media", mode);
      fd.set("taken_at", String(now.getTime()));
      fd.set("file", blob, "photo.jpg");
      const data = await uploadCheckin(fd);
      if (!data.ok) return setError(data.error ?? "업로드에 실패했어요");
      setResult(data);
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
      <input ref={input} type="file" accept="image/*" {...(mode === "camera" ? { capture: "environment" } : {})} className="hidden" onChange={onFile} />
      <button ref={btn} type="button" className={`${className} ${pulse ? "animate-pulse-ring" : ""}`} disabled={disabled || busy} onClick={() => { setPulse(false); input.current?.click(); }}>
        {busy ? "올리는 중…" : label}
      </button>
      {error && <p className="text-sm text-bad mt-2">{error}</p>}
      {result && <ResultModal result={result} onClose={close} />}
    </>
  );
}

function pickAudioType(): string {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/aac"];
  if (typeof MediaRecorder === "undefined") return "";
  return cands.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

const MAX_SEC = 180;

/** 녹음 인증 버튼: 누르면 녹음 시작, 다시 누르면 멈추고 업로드. 최대 3분. */
export function AudioRecordButton({ challengeId, label, className = "btn btn-ghost w-full" }: { challengeId: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [sec, setSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const router = useRouter();
  const supported = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = pickAudioType();
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => upload(mr.mimeType || type || "audio/webm");
      mr.start(1000);
      rec.current = mr;
      setSec(0);
      setState("recording");
      timer.current = window.setInterval(() => setSec((s) => {
        if (s + 1 >= MAX_SEC) stop();
        return s + 1;
      }), 1000);
    } catch {
      setError("마이크를 쓸 수 없어요. 권한을 허용해 주세요");
    }
  }

  function stop() {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    const mr = rec.current;
    if (mr && mr.state !== "inactive") mr.stop();
    mr?.stream.getTracks().forEach((t) => t.stop());
  }

  async function upload(mime: string) {
    setState("uploading");
    try {
      const baseType = mime.split(";")[0];
      const blob = new Blob(chunks.current, { type: baseType });
      if (blob.size < 1000) { setError("녹음이 너무 짧아요"); setState("idle"); return; }
      const fd = new FormData();
      fd.set("challenge_id", challengeId);
      fd.set("media", "audio");
      fd.set("taken_at", String(Date.now()));
      fd.set("file", blob, "rec");
      const data = await uploadCheckin(fd);
      if (!data.ok) setError(data.error ?? "업로드에 실패했어요");
      else setResult(data);
    } catch {
      setError("네트워크 오류. 다시 시도해 주세요");
    } finally {
      setState("idle");
    }
  }

  function close() {
    setResult(null);
    router.refresh();
  }

  if (!supported) return <button type="button" className={className} disabled>녹음 미지원</button>;
  return (
    <>
      {state === "recording" ? (
        <button type="button" className="btn btn-red w-full" onClick={stop}>
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-pulse" /> 녹음 중 {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")} · 눌러서 끝내기
        </button>
      ) : (
        <button type="button" className={className} disabled={state === "uploading"} onClick={start}>
          {state === "uploading" ? "올리는 중…" : label}
        </button>
      )}
      {error && <p className="text-sm text-bad mt-2">{error}</p>}
      {result && <ResultModal result={result} onClose={close} />}
    </>
  );
}

/** 링크 인증 버튼: 누르면 주소 입력칸이 열리고, 올리면 끝. */
export function LinkCheckinButton({ challengeId, label, className = "btn btn-ghost w-full" }: { challengeId: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("challenge_id", challengeId);
      fd.set("media", "link");
      fd.set("link_url", url.trim());
      fd.set("taken_at", String(Date.now()));
      const data = await uploadCheckin(fd);
      if (!data.ok) return setError(data.error ?? "실패했어요");
      setResult(data);
      setOpen(false);
      setUrl("");
    } catch {
      setError("네트워크 오류. 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && (
        <form onSubmit={submit} className="col-span-full flex gap-2 mt-1">
          <input className="input py-2" type="url" inputMode="url" placeholder="https://… (블로그, 유튜브, 스트라바 등)" value={url} onChange={(e) => setUrl(e.target.value)} required autoFocus />
          <button type="submit" className="btn btn-dark text-sm py-2 px-4 shrink-0" disabled={busy}>{busy ? "…" : "올리기"}</button>
        </form>
      )}
      {error && <p className="col-span-full text-sm text-bad mt-1">{error}</p>}
      {result && <ResultModal result={result} onClose={() => { setResult(null); router.refresh(); }} />}
    </>
  );
}
