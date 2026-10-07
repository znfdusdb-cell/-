"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openGift } from "@/app/actions";

export type GiftView = { id: string; fromName: string; challengeTitle: string; date: string; url: string | null; opened: boolean };

/** 선물함: 받은 기프티콘. 열면 읽음 처리. 쿠폰은 써야 하니 여기서는 저장을 막지 않는다. */
export function GiftBox({ gifts }: { gifts: GiftView[] }) {
  const [view, setView] = useState<GiftView | null>(null);
  const router = useRouter();

  async function open(g: GiftView) {
    setView(g);
    if (!g.opened) {
      const fd = new FormData();
      fd.set("gift_id", g.id);
      await openGift(null, fd);
      router.refresh();
    }
  }

  return (
    <section id="gifts" className="card p-4 mt-3">
      <h2 className="font-bold mb-2">선물함 {gifts.filter((g) => !g.opened).length > 0 && <span className="chip bg-red text-white ml-1">새 선물 {gifts.filter((g) => !g.opened).length}</span>}</h2>
      {gifts.length === 0 ? (
        <p className="text-sm text-fg-2">아직 받은 선물이 없어요. 챌린지에서 살아남으면 탈락한 멤버의 기프티콘이 랜덤으로 와요.</p>
      ) : (
        <ul className="space-y-2">
          {gifts.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => open(g)} className={`w-full text-left rounded-2xl border p-3 flex items-center gap-3 ${g.opened ? "border-line bg-bg-2" : "border-red/40 bg-red-soft"}`}>
                <div className="text-2xl">{g.opened ? "🎀" : "🎁"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{g.fromName}님이 보내온 깜짝 선물!</div>
                  <div className="text-xs text-fg-2">{g.challengeTitle} · {g.date}</div>
                </div>
                {!g.opened && <span className="chip bg-red text-white">열기</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {view && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => setView(null)}>
          <div className="text-white text-sm mb-2">{view.fromName}님의 선물 · 길게 눌러 저장할 수 있어요</div>
          {view.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.url} alt="기프티콘" className="max-w-full max-h-[75vh] object-contain rounded-xl" style={{ userSelect: "auto", WebkitUserSelect: "auto", WebkitTouchCallout: "default" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()} />
          ) : (
            <div className="text-white">이미지를 불러오지 못했어요</div>
          )}
          <button type="button" className="btn btn-ghost mt-4" onClick={() => setView(null)}>닫기</button>
        </div>
      )}
    </section>
  );
}
