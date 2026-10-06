export function GET() {
  return Response.json({
    name: "스윙봇 관제탑",
    short_name: "관제탑",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [],
  });
}
