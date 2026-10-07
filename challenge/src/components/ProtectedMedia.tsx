"use client";

import { useState } from "react";

/**
 * 저장 막은 사진: 길게 눌러 저장·드래그·우클릭을 막고, 탭하면 앱 안에서 크게 본다.
 * (화면 캡처까지 막을 수는 없다)
 */
export function ProtectedImage({ url, alt }: { url: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const block = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <>
      <button type="button" className="absolute inset-0 w-full h-full noselect" onClick={() => setOpen(true)} onContextMenu={block} aria-label="크게 보기">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="absolute inset-0 w-full h-full object-cover nosave" draggable={false} loading="lazy" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center noselect" onClick={() => setOpen(false)} onContextMenu={block}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="max-w-full max-h-full object-contain nosave" draggable={false} />
          <button type="button" className="absolute top-[max(env(safe-area-inset-top),1rem)] right-4 text-white/90 text-2xl leading-none" aria-label="닫기">×</button>
        </div>
      )}
    </>
  );
}
