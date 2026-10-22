/* 스윙봇 관제탑 서비스 워커: 홈 화면 앱 설치용. 화면·데이터는 캐시하지 않는다(숫자는 항상 최신). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><body style='background:#0b0d12;color:#e6edf3;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0'><p style='text-align:center'>인터넷 연결이 없어요.<br>오래된 숫자를 보여주지 않으려고 화면을 저장하지 않아요.<br>연결되면 다시 열어 주세요.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});
