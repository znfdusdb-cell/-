import { TabBar } from "./TabBar";
import { getRepo } from "@/lib/repo";
import type { PublicUser } from "@/lib/types";

/** 로그인 후 공통 틀: 상단 제목 + 내용 + 하단 탭 (내 정보 탭에 안 읽은 선물 수) */
export async function Shell({ user, title, right, children }: { user: PublicUser; title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const unread = await getRepo().countUnreadGifts(user.id).catch(() => 0);
  return (
    <div className="mx-auto w-full max-w-md min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur px-5 pt-[max(env(safe-area-inset-top),0.9rem)] pb-2 flex items-center justify-between">
        <h1 className="text-[22px] font-extrabold tracking-tight">{title ?? "거너스 챌린지"}</h1>
        <div className="text-sm text-fg-2">{right}</div>
      </header>
      <main className="flex-1 px-4 pt-2 pb-28">{children}</main>
      <TabBar isAdmin={user.role === "admin"} meBadge={unread} />
    </div>
  );
}
