import Link from "next/link";
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
import { GiftBox, type GiftView } from "@/components/GiftBox";
import { getRepo } from "@/lib/repo";
import { fmtDateKo } from "@/lib/time";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const level = levelFromXp(user.xp);
  const mine = await loadMyChallenges(user);
  const totalCheckins = mine.reduce((n, m) => n + m.checkins.length, 0);
  const repo = getRepo();
  // 마이그레이션 05 전이면 표가 없어 실패 → 선물함만 비우고 화면은 살린다
  const gifts = await repo.listGiftsReceived(user.id).catch(() => []);
  const [senders, challenges, urls] = await Promise.all([
    repo.getUsersByIds([...new Set(gifts.map((g) => g.from_user_id))]),
    repo.listChallenges({ includeInactive: true }),
    repo.photoUrls(gifts.map((g) => g.photo_path)),
  ]);
  const giftViews: GiftView[] = gifts.map((g) => ({
    id: g.id,
    fromName: senders.find((u) => u.id === g.from_user_id)?.display_name ?? "누군가",
    challengeTitle: challenges.find((c) => c.id === g.challenge_id)?.title ?? "챌린지",
    date: fmtDateKo(g.created_at.slice(0, 10)),
    url: urls[g.photo_path] ?? null,
    opened: Boolean(g.opened_at),
  }));
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

      {gifts.length === 0 && user.role === "admin" && !(await repo.listGiftsReceived(user.id).then(() => true).catch(() => false)) && (
        <div className="card p-3 mt-3 text-xs text-bad">관리자 안내: Supabase에 마이그레이션 05(ch_gifts)가 아직 없어요. `challenge/supabase/migrations/20261007_05_gifts.sql` 실행 후 선물함이 켜져요.</div>
      )}
      <GiftBox gifts={giftViews} />

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

      <Link href="/support" className="card p-4 mt-3 flex items-center justify-between">
        <div>
          <div className="font-bold">개발자에게 문의 · 오류 신고</div>
          <div className="text-xs text-fg-2 mt-0.5">안 되는 게 있으면 화면 사진과 함께 보내 주세요. 채팅으로 바로 답해요.</div>
        </div>
        <span className="text-fg-3">›</span>
      </Link>

      <form action={logout} className="mt-4">
        <button className="btn btn-ghost w-full text-sm">로그아웃</button>
      </form>
    </Shell>
  );
}
