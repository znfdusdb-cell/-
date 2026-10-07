/* 거너스 챌린지 서비스 워커: 설치 가능 + 웹 푸시 수신. 페이지 캐시는 하지 않는다(항상 최신). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  // 네트워크 우선. 오프라인이면 아주 단순한 안내만.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><body style='background:#0b0f1c;color:#f3f4f8;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0'><div style='text-align:center'><div style='font-size:48px'>📡</div><p>인터넷 연결이 없어요.<br>연결되면 다시 열어 주세요.</p></div>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "거너스 챌린지", body: "인증 시간이에요!", url: "/", tag: "ch" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: data.url },
      vibrate: [100, 50, 100],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
