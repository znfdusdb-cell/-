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
  const [challenges, parts, allActive] = await Promise.all([repo.listChallenges(), repo.listParticipationsByUser(user.id), repo.listActiveParticipations()]);
  const joined = new Set(parts.filter((p) => p.status === "active").map((p) => p.challenge_id));
  const countMap = new Map<string, number>();
  for (const p of allActive) countMap.set(p.challenge_id, (countMap.get(p.challenge_id) ?? 0) + 1);
  const canCreate = isAdmin(user) || levelFromXp(user.xp) >= CREATE_CHALLENGE_LEVEL;

  return (
    <Shell user={toPublic(user)} title="챌린지">
      <div className="space-y-3">
        {challenges.map((ch) => (
          <Link key={ch.id} href={`/challenges/${ch.id}`} className="card p-4 flex items-start gap-3 block">
            <div className="text-2xl leading-none mt-0.5">{ch.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold truncate">{ch.title}</h2>
                {joined.has(ch.id) && <span className="chip bg-ok-soft text-ok">참여 중</span>}
              </div>
              <p className="text-sm text-fg-2 mt-0.5 line-clamp-2">{ch.description}</p>
              <p className="text-xs text-fg-3 mt-1">{describeConfig(ch.config)} · {countMap.get(ch.id) ?? 0}명</p>
              <p className="text-xs mt-1"><span className="text-red font-bold">실패 시</span> {ch.penalty}{ch.max_fails > 0 ? ` (${ch.max_fails}번이면 탈락)` : ""}</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-4">
        {canCreate ? (
          <Link href="/challenges/new" className="btn btn-dark w-full">새 챌린지 만들기</Link>
        ) : (
          <div className="card p-4 text-center text-sm text-fg-2">
            새 챌린지 만들기는 <b className="text-fg">Lv.{CREATE_CHALLENGE_LEVEL}</b>부터 (지금 Lv.{levelFromXp(user.xp)})
          </div>
        )}
      </div>
    </Shell>
  );
}
