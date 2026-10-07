export function GET() {
  return Response.json(
    {
      id: "/",
      name: "거너스 챌린지",
      short_name: "거너스 챌린지",
      description: "아스날 인사이드 톡방 챌린지",
      start_url: "/",
      scope: "/",
      display: "standalone",
      display_override: ["window-controls-overlay", "standalone"],
      categories: ["health", "lifestyle", "social"],
      background_color: "#f6f5f2",
      theme_color: "#f6f5f2",
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
