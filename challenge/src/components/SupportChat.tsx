"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { id: string; mine: boolean; body: string; url: string | null; at: string };
type TicketInfo = { id: string; status: "open" | "resolved"; user_id: string; other_name: string } | null;

function fmt(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 개발자 문의 채팅. 4초마다 새 메시지를 가져온다. 사진 첨부 가능.
 *  ticketId 없으면(사용자) 내 열린 문의를 자동으로 찾고, 없으면 첫 메시지 때 새로 만든다.
 */
export function SupportChat({ ticketId, isAdmin }: { ticketId?: string; isAdmin: boolean }) {
  const [ticket, setTicket] = useState<TicketInfo>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const q = ticketId ? `?ticket=${ticketId}` : "";
      const r = await fetch(`/api/support${q}`, { cache: "no-store" });
      const d = await r.json();
      if (d.ok) { setTicket(d.ticket); setMsgs(d.messages); }
    } catch {} finally { setLoaded(true); }
  }

  useEffect(() => {
    load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("body", text.trim());
      if (file) fd.set("file", file, file.name || "shot.jpg");
      if (ticketId) fd.set("ticket_id", ticketId);
      const r = await fetch("/api/support", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) return setError(d.error ?? "보내지 못했어요");
      setText(""); setFile(null);
      await load();
    } catch { setError("네트워크 오류"); } finally { setBusy(false); }
  }

  const resolved = ticket?.status === "resolved";

  return (
    <div className="flex flex-col" style={{ minHeight: "60dvh" }}>
      <div className="flex-1 space-y-2 overflow-y-auto pb-3">
        {!loaded ? (
          <div className="skeleton h-16 w-2/3" />
        ) : msgs.length === 0 ? (
          <div className="card p-4 text-sm text-fg-2">
            {isAdmin ? "아직 메시지가 없어요." : <>안녕하세요, 개발자예요. 뭐가 안 되는지 적고, 오류 화면이 있으면 <b>사진</b>으로 같이 보내 주세요. 보통 바로 답장드려요.</>}
          </div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-fg text-white rounded-br-md" : "bg-bg-2 border border-line rounded-bl-md"}`}>
                {m.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="첨부" className="rounded-lg max-h-64 mb-1" /></a>
                )}
                {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                <div className={`text-[10px] mt-0.5 num ${m.mine ? "text-white/70" : "text-fg-3"}`}>{fmt(m.at)}</div>
              </div>
            </div>
          ))
        )}
        {resolved && <div className="text-center text-xs text-ok font-bold py-2">해결 완료된 문의예요. {isAdmin ? "" : "새로 보내면 새 문의가 열려요."}</div>}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="sticky bottom-24 bg-bg pt-2">
        {file && <div className="text-xs text-fg-2 mb-1 flex items-center gap-2">📎 {file.name} <button type="button" className="underline" onClick={() => setFile(null)}>빼기</button></div>}
        <div className="flex gap-2 items-end">
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn btn-ghost px-3 py-2.5 shrink-0" onClick={() => fileInput.current?.click()} aria-label="사진 첨부">📷</button>
          <textarea className="input py-2.5" rows={1} placeholder={isAdmin ? "답장…" : "무엇이 안 되나요?"} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); } }} />
          <button type="submit" className="btn btn-red px-4 py-2.5 shrink-0" disabled={busy}>{busy ? "…" : "보내기"}</button>
        </div>
        {error && <p className="text-xs text-bad mt-1">{error}</p>}
      </form>
    </div>
  );
}
