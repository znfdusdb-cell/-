"use client";
import { useEffect } from "react";

/** 홈 화면 앱(PWA) 설치용 서비스 워커 등록. 캐시는 하지 않는다. */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
