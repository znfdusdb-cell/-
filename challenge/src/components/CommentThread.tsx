"use client";

import { useState, useTransition } from "react";
import { addComment, deleteComment, type CommentView } from "@/app/actions";
import { fmtDateTimeKo } from "@/lib/time";

export type CommentThreadProps = {
  checkinId: string;
  list: CommentView[];
  meId: string;
  admin: boolean;
  /** 같은 챌린지 참여자·관리자만 쓸 수 있음 */
  canWrite: boolean;
  ownerName: string;
};

/** 인증 카드의 💬 댓글 버튼 → 아래에서 올라오는 댓글 창 (목록 + 입력) */
export function CommentButton({ checkinId, list, meId, admin, canWrite, ownerName }: CommentThreadProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(list);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text || pending) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("checkin_id", checkinId);
      fd.set("body", text);
      const r = await addComment(null, fd);
      if (!r.ok || !r.comment) { setError(r.error ?? "실패"); return; }
      setItems((xs) => [...xs, r.comment!]);
      setBody("");
    });
  }

  function remove(id: string) {
    if (!confirm("이 댓글을 지울까요?")) return;
    start(async () => {
      const fd = new FormData();
      fd.set("comment_id", id);
      const r = await deleteComment(null, fd);
      if (!r.ok) { setError(r.error ?? "실패"); return; }
      setItems((xs) => xs.filter((x) => x.id !== id));
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`chip py-1 px-2 text-[11px] border num ${items.length > 0 ? "bg-fg text-white border-fg" : "bg-bg-2 text-fg-2 border-line"}`} aria-label="댓글">
        💬 {items.length > 0 ? items.length : "댓글"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-sm max-h-[80vh] flex flex-col animate-pop rounded-b-none sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="font-extrabold">{ownerName}님 인증 댓글 <span className="text-fg-3 num text-sm">{items.length}</span></div>
              <button type="button" className="text-fg-3 text-xl leading-none px-1" onClick={() => setOpen(false)} aria-label="닫기">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-2">
              {items.length === 0 ? (
                <p className="text-sm text-fg-3 py-6 text-center">첫 댓글을 남겨 보세요</p>
              ) : (
                items.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="flex items-center gap-2 text-[11px] text-fg-3">
                      <span className="font-bold text-fg">{c.name}</span>
                      <span className="num">{fmtDateTimeKo(c.created_at)}</span>
                      {(c.user_id === meId || admin) && <button type="button" className="underline ml-auto" onClick={() => remove(c.id)}>삭제</button>}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{c.body}</div>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 pb-4 pt-2 border-t border-line">
              {canWrite ? (
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="댓글 (200자)"
                    maxLength={200}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                  />
                  <button type="button" className="btn btn-red px-4" disabled={pending || !body.trim()} onClick={submit}>{pending ? "…" : "보내기"}</button>
                </div>
              ) : (
                <p className="text-xs text-fg-3 text-center">이 챌린지에 참여하면 댓글을 쓸 수 있어요</p>
              )}
              {error && <p className="text-xs text-bad mt-1">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
