"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/gallery", label: "갤러리", icon: "📸" },
  { href: "/challenges", label: "챌린지", icon: "🏆" },
  { href: "/me", label: "내 정보", icon: "🧑" },
];

export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const tabs = isAdmin ? [...TABS, { href: "/admin", label: "관리", icon: "🛠️" }] : TABS;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-bg-2/95 backdrop-blur border-t border-line safe-b">
      <div className="mx-auto max-w-md grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-red-2 font-bold" : "text-fg-2"}`}>
              <span className="text-xl leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
