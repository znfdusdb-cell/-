"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const TABS = [
  { href: "/", label: "홈", d: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/gallery", label: "갤러리", d: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm0 11 5-5 4 4 3-3 5 5M15.5 9.5h.01" },
  { href: "/challenges", label: "챌린지", d: "M6 4h12v3a6 6 0 0 1-12 0zM6 6H3a3 3 0 0 0 3 4M18 6h3a3 3 0 0 1-3 4M12 13v4m-4 3h8" },
  { href: "/me", label: "내 정보", d: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" },
];
const ADMIN = { href: "/admin", label: "관리", d: "M12 3l2 3h3l1 3-2 2 1 3-3 1-2 3-2-3-3-1 1-3-2-2 1-3h3zM12 10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" };

export function TabBar({ isAdmin, meBadge = 0 }: { isAdmin: boolean; meBadge?: number }) {
  const path = usePathname();
  const tabs = isAdmin ? [...TABS, ADMIN] : TABS;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-bg-2/95 backdrop-blur border-t border-line safe-b">
      <div className="mx-auto max-w-md grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-semibold ${active ? "text-red" : "text-fg-3"}`}>
              <Icon d={t.d} />
              {t.label}
              {t.href === "/me" && meBadge > 0 && <span className="absolute top-1 right-[calc(50%-18px)] min-w-4 h-4 px-1 rounded-full bg-red text-white text-[10px] font-bold flex items-center justify-center num">{meBadge}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
