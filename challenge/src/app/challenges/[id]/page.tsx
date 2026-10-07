import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { loadBoard } from "@/lib/data";
import { describeConfig, levelFromXp } from "@/lib/game";
import { fmtDateKo, kstDate } from "@/lib/time";
import { Shell } from "@/components/Shell";
import { JoinForm } from "@/components/JoinForm";
import { LeaveButton } from "@/components/LeaveButton";
import { StartNowButton } from "@/components/StartNowButton";
import { FailRule } from "@/components/FailRule";

export const dynamic = "force-dynamic";

export default async function ChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const repo = getRepo();
  const ch = await repo.getChallenge(id);
  if (!ch) notFound();
  const [board, mine] = await Promise.all([loadBoard(ch), repo.getParticipation(user.id, ch.id)]);
  const joined = mine?.status === "active";
  const canEdit = isAdmin(user) || ch.created_by === user.id;
  const today = kstDate();

  return (
    <Shell user={toPublic(user)} title={`${ch.emoji} ${ch.title}`} right={<Link href="/challenges">목록</Link>}>
      <section className="card p-4">
        <p className="text-sm">{ch.description}</p>
        <p className="text-xs text-fg-3 mt-1">{describeConfig(ch.config)} · 참가자 {board.length}명</p>
        <FailRule challenge={ch} />
        {!ch.is_active && <p className="chip bg-bad-soft text-bad mt-2">비활성 (새 참여 불가)</p>}
        <div className="flex gap-2 mt-3">
          {canEdit && <Link href={`/challenges/${ch.id}/edit`} className="btn btn-ghost text-sm flex-1">수정</Link>}
          <Link href={`/gallery?c=${ch.id}`} className="btn btn-ghost text-sm flex-1">갤러리</Link>
        </div>
      </section>

      {joined ? (
        <section className="card p-4 mt-3">
          <h2 className="font-bold mb-2">내 목표</h2>
          {ch.config.goal === "none" ? <p className="text-sm text-fg-2">이 챌린지는 따로 설정할 목표가 없어요.</p> : <JoinForm challenge={ch} goal={mine!.goal} mode="edit" />}
          <div className="mt-3 pt-3 border-t border-line">
            <LeaveButton challengeId={ch.id} />
          </div>
        </section>
      ) : ch.is_active ? (
        <section className="card p-4 mt-3">
          <h2 className="font-bold mb-2">참여하기</h2>
          <JoinForm challenge={ch} next={`/challenges/${ch.id}`} />
        </section>
      ) : null}

      <section className="mt-4">
        <h2 className="text-lg font-extrabold mb-2">리더보드</h2>
        {board.length === 0 ? (
          <div className="card p-6 text-center text-fg-2 text-sm">첫 참가자가 되어 보세요</div>
        ) : (
          <ol className="space-y-2">
            {board.map(({ participant: p, summary: s }, i) => (
              <li key={p.id} className={`card p-3 flex items-center gap-3 ${p.user_id === user.id ? "border-fg" : ""} ${s.eliminated ? "opacity-70" : ""}`}>
                <div className="text-lg font-extrabold w-6 text-center text-fg-3 num">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold truncate">{p.user.display_name}</span>
                    <span className="text-[11px] text-red font-bold">Lv.{levelFromXp(p.user.xp)}</span>
                    {s.eliminated ? <span className="chip bg-bad-soft text-bad">탈락</span> : s.startDate > today ? <span className="chip bg-bg-3 text-fg-2">{fmtDateKo(s.startDate)} 시작</span> : null}
                  </div>
                  <div className="text-xs text-fg-2 mt-0.5 truncate">
                    {ch.config.goal === "hobby" && p.goal.hobby ? <>{p.goal.hobby} · </> : null}
                    {ch.config.goal === "weight" && p.goal.days ? <>{p.goal.days}일 도전 · </> : null}
                    {fmtDateKo(s.startDate)}부터
                  </div>
                  {isAdmin(user) && s.startDate > today && <StartNowButton userId={p.user_id} challengeId={ch.id} />}
                </div>
                <div className="text-right text-xs num">
                  <div className="font-extrabold">{s.streak} 연속</div>
                  <div className={s.fails > 0 ? "text-bad" : "text-fg-3"}>실패 {s.fails}{ch.max_fails > 0 ? `/${ch.max_fails}` : ""}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Shell>
  );
}
