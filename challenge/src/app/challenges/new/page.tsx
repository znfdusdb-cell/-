import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { CREATE_CHALLENGE_LEVEL, levelFromXp } from "@/lib/game";
import { Shell } from "@/components/Shell";
import { ChallengeForm } from "@/components/ChallengeForm";

export default async function NewChallengePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const ok = isAdmin(user) || levelFromXp(user.xp) >= CREATE_CHALLENGE_LEVEL;
  return (
    <Shell user={toPublic(user)} title="새 챌린지" right={<Link href="/challenges">← 목록</Link>}>
      {ok ? (
        <ChallengeForm />
      ) : (
        <div className="card p-6 text-center text-fg-2">🔒 Lv.{CREATE_CHALLENGE_LEVEL}부터 만들 수 있어요</div>
      )}
    </Shell>
  );
}
