"use client";

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    // 복사·잘라내기·우클릭 막기 (입력칸 안에서는 허용)
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.closest("input, textarea, select, [contenteditable='true']") !== null);
    const block = (e: Event) => { if (!editable(e.target)) e.preventDefault(); };
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    return () => { document.removeEventListener("copy", block); document.removeEventListener("cut", block); document.removeEventListener("contextmenu", block); };
  }, []);
  return null;
}
