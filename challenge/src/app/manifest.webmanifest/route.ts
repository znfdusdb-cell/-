export function GET() {
  return Response.json(
    {
      name: "거너스 챌린지",
      short_name: "거너스 챌린지",
      description: "아스날 인사이드 톡방 챌린지",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0b0f1c",
      theme_color: "#0b0f1c",
      lang: "ko",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
