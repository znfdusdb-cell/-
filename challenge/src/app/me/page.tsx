import { redirect } from "next/navigation";
import { currentUser, toPublic } from "@/lib/current-user";
import { loadMyChallenges } from "@/lib/data";
import { LEVEL_PERKS, levelFromXp, xpForLevel } from "@/lib/game";
import { vapidPublicKey } from "@/lib/push";
import { Shell } from "@/components/Shell";
import { Character } from "@/components/Character";
import { XpBar } from "@/components/XpBar";
import { PushToggle } from "@/components/PushToggle";
import { InstallHint } from "@/components/InstallHint";
import { ProfileForms } from "@/components/ProfileForms";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const level = levelFromXp(user.xp);
  const mine = await loadMyChallenges(user);
  const totalCheckins = mine.reduce((n, m) => n + m.checkins.length, 0);
  const bestStreak = Math.max(0, ...mine.map((m) => m.summary.streak));

  return (
    <Shell user={toPublic(user)} title="내 정보">
      <section className="card p-5 text-center">
        <div className="flex justify-center"><Character level={level} gender={user.gender} size={180} className="animate-float" /></div>
        <div className="text-2xl font-extrabold mt-1">{user.display_name}</div>
        <div className="text-xs text-fg-3">@{user.username}{user.role === "admin" ? " · 관리자" : ""}</div>
        <div className="mt-3 text-left"><XpBar xp={user.xp} /></div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="rounded-xl bg-bg-3 p-2"><div className="text-xl font-extrabold num">{user.xp}</div><div className="text-[11px] text-fg-2">총 경험치</div></div>
          <div className="rounded-xl bg-bg-3 p-2"><div className="text-xl font-extrabold num">{totalCheckins}</div><div className="text-[11px] text-fg-2">인증 횟수</div></div>
          <div className="rounded-xl bg-bg-3 p-2"><div className="text-xl font-extrabold num">{bestStreak}</div><div className="text-[11px] text-fg-2">현재 최고 연속</div></div>
        </div>
      </section>

      <div className="mt-3 space-y-3">
        <PushToggle vapidKey={vapidPublicKey()} />
        <InstallHint always />
      </div>

      <section className="card p-4 mt-3">
        <h2 className="font-bold mb-2">레벨 로드맵</h2>
        <ol className="space-y-1.5">
          {LEVEL_PERKS.map((p) => (
            <li key={p.level} className={`flex items-center gap-3 text-sm ${p.level <= level ? "" : "opacity-60"}`}>
              <Character level={p.level} gender={user.gender} size={36} />
              <div className="flex-1">
                <div className="flex items-center gap-2"><span className="text-red font-bold">Lv.{p.level}</span><span className="font-semibold">{p.title}</span>{p.level <= level && <span className="text-ok text-xs font-bold">달성</span>}</div>
                <div className="text-xs text-fg-2">{p.look} · {xpForLevel(p.level)} XP</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <ProfileForms displayName={user.display_name} gender={user.gender} />

      <form action={logout} className="mt-4">
        <button className="btn btn-ghost w-full text-sm">로그아웃</button>
      </form>
    </Shell>
  );
}
