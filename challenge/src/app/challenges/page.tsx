import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { CREATE_CHALLENGE_LEVEL, describeConfig, levelFromXp } from "@/lib/game";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const repo = getRepo();
  const [challenges, parts] = await Promise.all([repo.listChallenges(), repo.listParticipationsByUser(user.id)]);
  const joined = new Set(parts.filter((p) => p.status === "active").map((p) => p.challenge_id));
  const counts = await Promise.all(challenges.map(async (c) => [c.id, (await repo.listParticipants(c.id)).length] as const));
  const countMap = new Map(counts);
  const canCreate = isAdmin(user) || levelFromXp(user.xp) >= CREATE_CHALLENGE_LEVEL;

  return (
    <Shell user={toPublic(user)} title="챌린지">
      <div className="space-y-3">
        {challenges.map((ch) => (
          <Link key={ch.id} href={`/challenges/${ch.id}`} className="card p-4 flex items-start gap-3 block">
            <div className="text-3xl">{ch.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl truncate">{ch.title}</h2>
                {joined.has(ch.id) && <span className="chip bg-ok/20 text-ok">참여 중</span>}
                {!ch.is_default && <span className="chip bg-bg-3 text-fg-2">멤버 개설</span>}
              </div>
              <p className="text-sm text-fg-2 mt-0.5 line-clamp-2">{ch.description}</p>
              <p className="text-xs text-fg-3 mt-1">{describeConfig(ch.config)} · 🎁 {ch.prize} · 👥 {countMap.get(ch.id) ?? 0}명</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-5">
        {canCreate ? (
          <Link href="/challenges/new" className="btn btn-gold w-full">+ 새 챌린지 만들기</Link>
        ) : (
          <div className="card p-4 text-center text-sm text-fg-2">
            🔒 새 챌린지 만들기는 <b className="text-gold">Lv.{CREATE_CHALLENGE_LEVEL}</b>부터 열려요 (지금 Lv.{levelFromXp(user.xp)})
          </div>
        )}
      </div>
    </Shell>
  );
}
