import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getRepo } from "@/lib/repo";
import { authMode } from "@/lib/auth";
import { viewMode } from "@/lib/view";
import { SwRegister } from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "스윙봇 관제탑",
  description: "미너비니 규칙 기반 국장 스윙봇 관제 사이트",
  manifest: "/manifest.webmanifest",
  applicationName: "관제탑",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "관제탑" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = getRepo().mode;
  const view = await viewMode();
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Jua&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">
        <SwRegister />
        <Nav mode={mode} locked={authMode() !== "open"} view={view} />
        <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3">{children}</main>
      </body>
    </html>
  );
}
