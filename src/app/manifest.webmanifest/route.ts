export function GET() {
  return Response.json(
    {
      id: "/",
      name: "스윙봇 관제탑",
      short_name: "관제탑",
      description: "미너비니 규칙 기반 국장 스윙봇 관제",
      lang: "ko",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0b0d12",
      theme_color: "#0b0d12",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
