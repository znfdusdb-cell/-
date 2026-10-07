import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { loadBoard } from "@/lib/data";
import { describeConfig, levelFromXp } from "@/lib/game";
import { fmtDateKo, kstDate } from "@/lib/time";
import { StartNowButton } from "@/components/StartNowButton";
import { Shell } from "@/components/Shell";
import { JoinForm } from "@/components/JoinForm";
import { LeaveButton } from "@/components/LeaveButton";

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
  const creator = ch.created_by ? await repo.getUserById(ch.created_by) : null;

  return (
    <Shell user={toPublic(user)} title={`${ch.emoji} ${ch.title}`} right={<Link href="/challenges">← 목록</Link>}>
      <section className="card p-4">
        <p className="text-sm">{ch.description}</p>
        <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1 text-sm mt-3">
          <dt className="text-fg-3">규칙</dt><dd>{describeConfig(ch.config)}</dd>
          <dt className="text-fg-3">상품</dt><dd>🎁 {ch.prize}</dd>
          <dt className="text-fg-3">개설</dt><dd>{creator?.display_name ?? "—"}{ch.is_default ? " (기본)" : ""}</dd>
          <dt className="text-fg-3">참가자</dt><dd>{board.length}명</dd>
        </dl>
        {!ch.is_active && <p className="chip bg-bad/15 text-bad mt-2">비활성 (새 참여 불가)</p>}
        <div className="flex gap-2 mt-3">
          {canEdit && <Link href={`/challenges/${ch.id}/edit`} className="btn btn-ghost text-sm flex-1">✏️ 수정 (상품·규칙)</Link>}
          <Link href={`/gallery?c=${ch.id}`} className="btn btn-ghost text-sm flex-1">📸 갤러리</Link>
        </div>
      </section>

      {joined ? (
        <section className="card p-4 mt-3">
          <h2 className="font-semibold mb-2">내 목표</h2>
          {ch.config.goal === "none" ? <p className="text-sm text-fg-2">이 챌린지는 따로 설정할 목표가 없어요.</p> : <JoinForm challenge={ch} goal={mine!.goal} mode="edit" />}
          <div className="mt-3 pt-3 border-t border-line">
            <LeaveButton challengeId={ch.id} />
          </div>
        </section>
      ) : ch.is_active ? (
        <section className="card p-4 mt-3">
          <h2 className="font-semibold mb-2">참여하기</h2>
          <JoinForm challenge={ch} next={`/challenges/${ch.id}`} />
        </section>
      ) : null}

      <section className="mt-4">
        <h2 className="font-display text-xl mb-2">🏅 리더보드</h2>
        {board.length === 0 ? (
          <div className="card p-6 text-center text-fg-2 text-sm">첫 참가자가 되어 보세요</div>
        ) : (
          <ol className="space-y-2">
            {board.map(({ participant: p, summary: s }, i) => (
              <li key={p.id} className={`card p-3 flex items-center gap-3 ${p.user_id === user.id ? "border-gold/60" : ""}`}>
                <div className="font-display text-xl w-7 text-center text-gold">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{p.user.display_name}</span>
                    <span className="text-xs text-gold">Lv.{levelFromXp(p.user.xp)}</span>
                  </div>
                  <div className="text-xs text-fg-2 mt-0.5">
                    {ch.config.goal === "hobby" && p.goal.hobby && <>도전: {p.goal.hobby} · </>}
                    {ch.config.goal === "weight" && p.goal.target_kg && <>−{p.goal.target_kg}kg/{p.goal.days}일 · </>}
                    {s.startDate > kstDate() ? <span className="text-gold">{fmtDateKo(s.startDate)} 시작 예정</span> : <>{fmtDateKo(s.startDate)} 시작</>}
                  </div>
                  {isAdmin(user) && s.startDate > kstDate() && <StartNowButton userId={p.user_id} challengeId={ch.id} />}
                </div>
                <div className="text-right text-xs">
                  <div className="text-gold font-semibold">🔥 {s.streak}</div>
                  <div className="text-fg-2 num">{s.kind === "slots" ? `완료 ${s.completeDays} · 실패 ${s.failDays}` : `달성 ${s.completePeriods} · 실패 ${s.failPeriods}`}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Shell>
  );
}
