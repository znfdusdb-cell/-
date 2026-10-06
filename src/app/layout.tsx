import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getRepo } from "@/lib/repo";
import { authMode } from "@/lib/auth";

export const metadata: Metadata = {
  title: "스윙봇 관제탑",
  description: "미너비니 규칙 기반 국장 스윙봇 관제 사이트",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = getRepo().mode;
  return (
    <html lang="ko">
      <body className="min-h-dvh">
        <Nav mode={mode} locked={authMode() !== "open"} />
        <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-3">{children}</main>
      </body>
    </html>
  );
}
