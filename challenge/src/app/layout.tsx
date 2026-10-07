import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/SwRegister";

function siteUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (explicit) return explicit.startsWith("http") ? explicit : `https://${explicit}`;
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

const TITLE = "거너스 챌린지";
const DESC = "아스날 인사이드 톡방 챌린지 — 다이어트·취미 인증하고 연속 기록으로 레벨업";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: TITLE,
  description: DESC,
  manifest: "/manifest.webmanifest",
  openGraph: { title: TITLE, description: DESC, siteName: TITLE, type: "website", locale: "ko_KR", url: "/", images: [{ url: "/og.png", width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/og.png"] },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "거너스 챌린지" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0f1c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
