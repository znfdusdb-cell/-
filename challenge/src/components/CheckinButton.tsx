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
  /** AI 예상 칼로리 (식단) */
  aiKcal?: number | null;
  aiNote?: string;
  aiFlagged?: boolean;
  /** 오늘 예산과 이 끼니까지의 합계 */
  aiBudget?: number;
  aiTotal?: number;
};

export type MealAnalysis = { available: boolean; kcal: number; foods: string[]; note: string; limit: number; high: boolean; budget: number; consumed: number; token: string };

async function analyzeMeal(challengeId: string, blob: Blob, slot?: string): Promise<MealAnalysis | null> {
  try {
    const fd = new FormData();
    fd.set("challenge_id", challengeId);
    if (slot) fd.set("slot", slot);
    fd.set("file", blob, "photo.jpg");
    const res = await fetch("/api/checkin/analyze", { method: "POST", body: fd });
    const j = (await res.json()) as { ok: boolean } & MealAnalysis;
    return j.ok && j.available ? j : null;
  } catch {
    return null;
  }
}

/** 고칼로리 경고창: 다시 찍거나, 알고도 올리기(관리자 검토) */
export function KcalWarning({ a, onRetake, onProceed, busy }: { a: MealAnalysis; onRetake: () => void; onProceed: () => void; busy: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="card w-full max-w-sm p-6 text-center animate-pop">
        <div className="text-xs font-extrabold tracking-widest text-bad">AI 칼로리 경고</div>
        <div className="text-4xl font-extrabold text-bad mt-2 num">약 {a.kcal} kcal</div>
        <div className="text-xs text-fg-3 num mt-0.5">
          오늘 먹을 수 있는 칼로리 {a.budget.toLocaleString()} kcal{a.consumed > 0 ? ` · 이미 ${a.consumed.toLocaleString()} 먹음` : ""} → 이 끼니 한도 <b className="text-bad">{a.limit.toLocaleString()} kcal</b>
        </div>
        {a.foods.length > 0 && <div className="text-sm mt-2">{a.foods.join(" · ")}</div>}
        {a.note && <div className="text-xs text-fg-2 mt-1">{a.note}</div>}
        <div className="rounded-xl bg-bad-soft text-bad text-sm font-bold p-3 mt-4">이대로 올리면 관리자 검토를 받아요. 불인정되면 이 시간대는 실패 처리돼요.</div>
        <div className="flex gap-2 mt-4">
          <button type="button" className="btn btn-ghost flex-1" disabled={busy} onClick={onRetake}>다시 찍기</button>
          <button type="button" className="btn btn-dark flex-1" disabled={busy} onClick={onProceed}>{busy ? "올리는 중…" : "그대로 올리기"}</button>
        </div>
        <p className="text-[11px] text-fg-3 mt-2">AI 추정이라 오차가 있어요. 샐러드처럼 보이면 그냥 통과해요.</p>
      </div>
    </div>
  );
}

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
        {typeof result.aiKcal === "number" && result.aiKcal > 0 && (
          <div className={`mt-3 text-sm rounded-xl p-2 ${result.aiFlagged ? "bg-bad-soft text-bad" : "bg-bg-3 text-fg-2"}`}>
            🤖 AI 예상 <b className="num">{result.aiKcal} kcal</b>{result.aiNote ? ` · ${result.aiNote}` : ""}
            {typeof result.aiBudget === "number" && typeof result.aiTotal === "number" && result.aiBudget > 0 && (
              <div className="text-xs mt-0.5 num">
                오늘 {result.aiTotal.toLocaleString()} / {result.aiBudget.toLocaleString()} kcal ·{" "}
                {result.aiTotal > result.aiBudget ? <b>예산 {(result.aiTotal - result.aiBudget).toLocaleString()} kcal 초과</b> : <>남은 끼니는 <b>{(result.aiBudget - result.aiTotal).toLocaleString()} kcal</b> 안에서</>}
              </div>
            )}
            {result.aiFlagged && <div className="text-xs font-bold mt-0.5">관리자 검토 대상이에요</div>}
          </div>
        )}
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
  aiCheck = false,
}: {
  challengeId: string;
  slot?: string;
  label: string;
  mode?: "camera" | "album";
  disabled?: boolean;
  className?: string;
  /** 알림에서 들어왔을 때: 바로 카메라 열기 시도, 막히면 버튼 강조 */
  autoOpen?: boolean;
  /** 식단: 올리기 전 AI 칼로리 추정, 기준 초과면 경고창 */
  aiCheck?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(autoOpen);
  // 알림에서 들어온 경우: 브라우저가 "직접 누른 동작" 없이는 카메라를 못 열게 막으므로, 화면 전체에 큰 촬영 버튼 하나를 띄워 한 번 누르면 바로 열리게 한다
  const [prompt, setPrompt] = useState(autoOpen);
  const [stage, setStage] = useState<"idle" | "ai" | "upload">("idle");
  const [warn, setWarn] = useState<{ fd: FormData; a: MealAnalysis } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!autoOpen) return;
    btn.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => { try { input.current?.click(); } catch {} }, 350);
    const clean = window.setTimeout(() => router.replace("/"), 1200);
    // 파일 선택창이 실제로 열리면 창이 포커스를 잃는다 → 큰 버튼은 치운다
    const onBlur = () => setPrompt(false);
    window.addEventListener("blur", onBlur);
    return () => { window.clearTimeout(t); window.clearTimeout(clean); window.removeEventListener("blur", onBlur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setPrompt(false);
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
      if (aiCheck && mode === "camera") {
        setStage("ai");
        const a = await analyzeMeal(challengeId, blob, slot);
        if (a) {
          fd.set("ai_token", a.token);
          if (a.high) { setWarn({ fd, a }); return; }
        }
      }
      await send(fd);
    } catch {
      setError("네트워크 오류. 다시 시도해 주세요");
    } finally {
      setBusy(false);
      setStage("idle");
    }
  }

  async function send(fd: FormData) {
    setStage("upload");
    const data = await uploadCheckin(fd);
    if (!data.ok) return setError(data.error ?? "업로드에 실패했어요");
    setResult(data);
  }

  async function proceedAnyway() {
    if (!warn) return;
    setBusy(true);
    try {
      await send(warn.fd);
    } catch {
      setError("네트워크 오류. 다시 시도해 주세요");
    } finally {
      setWarn(null);
      setBusy(false);
      setStage("idle");
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
        {busy ? (stage === "ai" ? "AI가 칼로리 보는 중…" : "올리는 중…") : label}
      </button>
      {error && <p className="text-sm text-bad mt-2">{error}</p>}
      {prompt && !busy && !result && !warn && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 p-6" onClick={() => setPrompt(false)}>
          <div className="text-white text-sm mb-4 text-center">알림에서 들어왔어요. 한 번만 눌러 주세요.</div>
          <button type="button" className="btn btn-red w-full max-w-sm text-2xl py-8 rounded-3xl shadow-xl animate-pulse-ring" onClick={(e) => { e.stopPropagation(); setPrompt(false); setPulse(false); input.current?.click(); }}>
            📷 {label === "촬영 인증" ? "지금 촬영" : label}
          </button>
          <button type="button" className="mt-5 text-white/80 text-sm underline" onClick={() => setPrompt(false)}>나중에 할게요</button>
        </div>
      )}
      {warn && <KcalWarning a={warn.a} busy={busy} onRetake={() => { setWarn(null); input.current?.click(); }} onProceed={proceedAnyway} />}
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
