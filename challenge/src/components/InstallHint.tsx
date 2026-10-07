"use client";

import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** 홈 화면 설치 안내. 설치된(standalone) 상태면 아무것도 안 보임. */
export function InstallHint({ always = false }: { always?: boolean }) {
  const [mode, setMode] = useState<"hidden" | "ios" | "android" | "other">("hidden");
  const [bip, setBip] = useState<BIP | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone || matchMedia("(display-mode: standalone)").matches;
    if (standalone) return;
    try { if (!always && localStorage.getItem("ch_install_dismissed")) return setDismissed(true); } catch {}
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) setMode("ios");
    else if (/android/i.test(ua)) setMode("android");
    else setMode("other");
    const onBip = (e: Event) => { e.preventDefault(); setBip(e as BIP); };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [always]);

  if (mode === "hidden" || dismissed) return null;

  function dismiss() {
    try { localStorage.setItem("ch_install_dismissed", "1"); } catch {}
    setDismissed(true);
  }

  return (
    <div className="card p-4 border-gold/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">📱 홈 화면에 아이콘 추가</div>
          <div className="text-xs text-fg-2 mt-1 leading-relaxed">
            {mode === "ios" && <>Safari 아래 <b>공유(⬆︎)</b> 버튼 → <b>홈 화면에 추가</b>. 그 아이콘으로 열어야 알림도 켤 수 있어요.</>}
            {mode === "android" && (bip ? <>아래 버튼 한 번이면 앱처럼 설치돼요.</> : <>Chrome 오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b> (또는 앱 설치).</>)}
            {mode === "other" && <>폰에서 열면 앱처럼 설치할 수 있어요. Chrome 주소창의 설치 아이콘도 돼요.</>}
          </div>
          {mode === "android" && bip && (
            <button className="btn btn-gold text-sm py-2 mt-2" onClick={async () => { await bip.prompt(); setBip(null); }}>앱 설치</button>
          )}
        </div>
        {!always && <button className="text-fg-3 text-lg leading-none" onClick={dismiss} aria-label="닫기">×</button>}
      </div>
    </div>
  );
}
