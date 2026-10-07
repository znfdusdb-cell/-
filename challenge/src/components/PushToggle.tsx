"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "need-install" | "denied" | "off" | "on" | "no-key";

/** 웹 푸시 구독 토글. iOS 는 홈 화면에 추가한 뒤에만 가능. */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!vapidKey) return setState("no-key");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone = (navigator as unknown as { standalone?: boolean }).standalone || matchMedia("(display-mode: standalone)").matches;
        return setState(ios && !standalone ? "need-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  async function turnOn() {
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setState("on");
      setMsg("알림을 켰어요. 인증 시간 시작과 마감 30분 전에 알려 드려요.");
    } catch (e) {
      setMsg((e as Error).message || "알림 설정에 실패했어요");
    }
  }

  async function turnOff() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
    setMsg("알림을 껐어요.");
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">🔔 인증 알림</div>
          <div className="text-xs text-fg-2 mt-0.5">
            {state === "loading" && "확인 중…"}
            {state === "no-key" && "서버에 알림 키가 아직 없어요 (관리자가 VAPID 키를 넣으면 켜져요)"}
            {state === "unsupported" && "이 브라우저는 웹 알림을 지원하지 않아요"}
            {state === "need-install" && "아이폰은 먼저 홈 화면에 추가한 뒤 그 아이콘으로 열어야 알림을 켤 수 있어요"}
            {state === "denied" && "알림이 차단돼 있어요. 브라우저/앱 설정에서 허용해 주세요"}
            {state === "off" && "점심·저녁 인증 시작, 마감 30분 전, 취미 마감일에 알려 드려요"}
            {state === "on" && "켜져 있어요"}
          </div>
        </div>
        {state === "off" && <button className="btn btn-red text-sm py-2" onClick={turnOn}>켜기</button>}
        {state === "on" && <button className="btn btn-ghost text-sm py-2" onClick={turnOff}>끄기</button>}
      </div>
      {msg && <p className="text-xs text-fg-2 mt-2">{msg}</p>}
    </div>
  );
}
