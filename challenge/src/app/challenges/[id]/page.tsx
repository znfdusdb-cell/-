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
import { KickButton } from "@/components/KickButton";
import { NudgeButton } from "@/components/NudgeButton";

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
          <>
            {joined && (
              <div className="flex gap-3 text-[11px] text-fg-3 mb-2">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-soft border border-red/40 align-middle mr-1" />아직 인증 전</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-ok-soft border border-ok/40 align-middle mr-1" />오늘 완료</span>
              </div>
            )}
            <ol className="space-y-2">
              {board.map(({ participant: p, summary: s, pending, waiting, weight }, i) => {
                const tone = s.eliminated ? "bg-bad-soft border-bad/30 opacity-70" : waiting ? "bg-bg-3/60 border-line" : pending ? "bg-red-soft border-red/40" : "bg-ok-soft border-ok/40";
                return (
                  <li key={p.id} className={`rounded-2xl border p-3 ${tone} ${p.user_id === user.id ? "ring-2 ring-fg/80" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-extrabold w-6 text-center text-fg-3 num">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold truncate">{p.user.display_name}</span>
                          <span className="text-[11px] text-red font-bold">Lv.{levelFromXp(p.user.xp)}</span>
                          {s.eliminated ? <span className="chip bg-bad text-white">탈락</span> : waiting ? <span className="chip bg-bg-2 text-fg-2">{fmtDateKo(s.startDate)} 시작</span> : pending ? <span className="chip bg-red text-white">인증 전</span> : <span className="chip bg-ok text-white">완료</span>}
                        </div>
                        <div className="text-xs text-fg-2 mt-0.5 truncate">
                          {ch.config.goal === "hobby" && p.goal.hobby ? <>{p.goal.hobby} · </> : null}
                          {ch.config.goal === "weight" && p.goal.days ? <>{p.goal.days}일 도전 · </> : null}
                          {fmtDateKo(s.startDate)}부터
                        </div>
                      </div>
                      <div className="text-right text-xs num shrink-0">
                        <div className="font-extrabold">{s.streak} 연속</div>
                        <div className={s.fails > 0 ? "text-bad" : "text-fg-3"}>이달 실패 {s.fails}{ch.max_fails > 0 ? `/${ch.max_fails}` : ""}</div>
                      </div>
                    </div>
                    {joined && pending && p.user_id !== user.id && (
                      <div className="mt-2 pl-9"><NudgeButton challengeId={ch.id} userId={p.user_id} /></div>
                    )}
                    {weight && (
                      <div className="mt-2 pl-9">
                        <div className="flex justify-between text-[11px] text-fg-2 num">
                          <span>목표 −{weight.targetLoss}kg</span>
                          <span>{weight.reached ? "달성" : `${weight.lost}kg 감량 · ${Math.round(weight.ratio * 100)}%`}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-bg-2 border border-line mt-1 overflow-hidden">
                          <div className={`h-full rounded-full ${weight.reached ? "bg-ok" : "bg-red"}`} style={{ width: `${Math.max(2, weight.ratio * 100)}%` }} />
                        </div>
                      </div>
                    )}
                    {((isAdmin(user) && waiting) || ((isAdmin(user) || ch.created_by === user.id) && p.user_id !== user.id)) && (
                      <div className="mt-1.5 pl-9 flex gap-3 items-center flex-wrap">
                        {isAdmin(user) && waiting && <StartNowButton userId={p.user_id} challengeId={ch.id} />}
                        {(isAdmin(user) || ch.created_by === user.id) && p.user_id !== user.id && <KickButton challengeId={ch.id} userId={p.user_id} name={p.user.display_name} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>
    </Shell>
  );
}
