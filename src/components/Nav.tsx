import Link from "next/link";

export function Nav({ mode, locked }: { mode: "supabase" | "seed"; locked: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
        <Link href="/" className="text-base font-semibold tracking-tight">
          스윙봇 관제탑
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-md px-2.5 py-1.5 text-fg-2 hover:bg-bg-3 hover:text-fg">관제탑</Link>
          <Link href="/log" className="rounded-md px-2.5 py-1.5 text-fg-2 hover:bg-bg-3 hover:text-fg">규칙 로그</Link>
          {locked && <a href="/auth/logout" className="rounded-md px-2 py-1.5 text-[11px] text-fg-3 hover:text-fg">나가기</a>}
          <span
            title={mode === "seed" ? "Supabase 환경변수가 없어 내장 시드 데이터로 동작 중" : "bium-brain Supabase 연결"}
            className={`ml-1 rounded-full border px-2 py-0.5 text-[11px] ${mode === "seed" ? "border-warn/50 text-warn" : "border-go/50 text-go"}`}
          >
            {mode === "seed" ? "시드" : "DB"}
          </span>
        </nav>
      </div>
    </header>
  );
}
