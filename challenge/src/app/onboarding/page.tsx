import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { describeConfig } from "@/lib/game";
import { JoinForm } from "@/components/JoinForm";
import { Character } from "@/components/Character";

/** 첫 로그인: 참여할 챌린지 고르기 */
export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const repo = getRepo();
  const [challenges, parts] = await Promise.all([repo.listChallenges(), repo.listParticipationsByUser(user.id)]);
  const joined = new Set(parts.filter((p) => p.status === "active").map((p) => p.challenge_id));
  const pub = toPublic(user);

  return (
    <div className="mx-auto w-full max-w-md min-h-dvh px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-10">
      <div className="flex items-center gap-3">
        <Character level={1} size={72} />
        <div>
          <h1 className="font-display text-2xl">환영해요, {pub.display_name}!</h1>
          <p className="text-fg-2 text-sm">참여할 챌린지를 골라 주세요. 여러 개도 돼요. 챌린지는 매주 월요일에 시작해요.</p>
        </div>
      </div>

      <div className="space-y-4 mt-5">
        {challenges.map((ch) => (
          <section key={ch.id} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="text-3xl">{ch.emoji}</div>
              <div className="flex-1">
                <h2 className="font-display text-xl">{ch.title}</h2>
                <p className="text-sm text-fg-2 mt-0.5">{ch.description}</p>
                <p className="text-xs text-fg-3 mt-1">규칙: {describeConfig(ch.config)} · 상품: {ch.prize}</p>
              </div>
            </div>
            <div className="mt-3">
              {joined.has(ch.id) ? <div className="chip bg-ok/20 text-ok">참여 중 ✓</div> : <JoinForm challenge={ch} next="/onboarding" />}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Link href="/" className="btn btn-red w-full">{joined.size > 0 ? "시작하기" : "나중에 고를게요"}</Link>
        <p className="text-center text-xs text-fg-3">원하는 챌린지가 없으면 레벨 6부터 직접 만들 수 있어요.</p>
      </div>
    </div>
  );
}
