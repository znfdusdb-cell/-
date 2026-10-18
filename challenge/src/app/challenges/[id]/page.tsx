import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { boardFocus, loadBoard } from "@/lib/data";
import { describeConfig, leavePolicy, levelFromXp, summarize, type SlotStatus } from "@/lib/game";
import { fmtDateKo, fmtDateTimeKo, kstDate } from "@/lib/time";
import { Shell } from "@/components/Shell";
import { JoinForm } from "@/components/JoinForm";
import { LeaveButton } from "@/components/LeaveButton";
import { StartNowButton } from "@/components/StartNowButton";
import { FailRule } from "@/components/FailRule";
import { KickButton } from "@/components/KickButton";
import { NudgeButton } from "@/components/NudgeButton";
import { TestJoinButton } from "@/components/TestJoinButton";
import { AdminExcuseForm } from "@/components/AdminExcuseForm";

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
  const cheers = await repo.countCheersReceivedMany(board.map((r) => r.participant.user_id)).catch(() => ({} as Record<string, number>));
  // 그만두기 가능 여부 (시작 전 / 탈락 후 벌칙 제출 / 테스트 참여)
  let leave = { allowed: true, reason: "" };
  if (joined && mine) {
    const myCheckins = await repo.listCheckins({ participationId: mine.id });
    const sent = (await repo.listGiftsSentSince(user.id, ch.id, mine.joined_at).catch(() => [])).length > 0;
    leave = leavePolicy(ch, mine, summarize(ch, mine, myCheckins), sent, today);
  }
  // 개설자·관리자: 벌칙 현황 (누가 탈락했고, 기프티콘을 올렸는지, 누구에게 갔는지)
  const gifts = canEdit ? await repo.listGiftsByChallenge(ch.id).catch(() => []) : [];
  const giftUserIds = [...new Set(gifts.flatMap((g) => [g.from_user_id, g.to_user_id ?? ""]).filter(Boolean))];
  const giftUsers = new Map((giftUserIds.length ? await repo.getUsersByIds(giftUserIds) : []).map((u) => [u.id, u.display_name]));
  const nameOf = (id: string | null) => (id ? giftUsers.get(id) ?? board.find((r) => r.participant.user_id === id)?.participant.user.display_name ?? "탈퇴" : "받을 사람 없음");
  const pendingGift = board.filter((r) => r.summary.eliminated && !gifts.some((g) => g.from_user_id === r.participant.user_id && g.created_at >= r.participant.joined_at));
  const focus = boardFocus(ch);
  const slotDefs = ch.config.kind === "slots" ? ch.config.slots : [];
  const slotColor = (key: string) => SLOT_COLORS[Math.max(0, slotDefs.findIndex((d) => d.key === key)) % SLOT_COLORS.length];

  return (
    <Shell user={toPublic(user)} title={`${ch.emoji} ${ch.title}`} right={<Link href="/challenges">목록</Link>}>
      <section className="card p-4">
        <p className="text-sm">{ch.description}</p>
        <p className="text-xs text-fg-3 mt-1">{describeConfig(ch.config)} · 참가자 {board.length}명{ch.comments_enabled === false ? " · 댓글 꺼짐" : ""}</p>
        <FailRule challenge={ch} />
        {!ch.is_active && <p className="chip bg-bad-soft text-bad mt-2">비활성 (새 참여 불가)</p>}
        <div className="flex gap-2 mt-3">
          {canEdit && <Link href={`/challenges/${ch.id}/edit`} className="btn btn-ghost text-sm flex-1">수정</Link>}
          <Link href={`/gallery?c=${ch.id}`} className="btn btn-ghost text-sm flex-1">갤러리</Link>
        </div>
        {isAdmin(user) && (
          <div className="mt-2 text-xs">
            {mine?.status === "active" && mine.is_test ? (
              <div className="flex items-center gap-2 flex-wrap"><span className="chip bg-navy text-white">테스트 참여 중 · 숨김 · 24시간 업로드</span><TestJoinButton challengeId={ch.id} mode="official" /></div>
            ) : (
              <TestJoinButton challengeId={ch.id} mode="join" />
            )}
          </div>
        )}
      </section>

      {joined ? (
        <section className="card p-4 mt-3">
          <h2 className="font-bold mb-2">내 목표</h2>
          {ch.config.goal === "none" ? <p className="text-sm text-fg-2">이 챌린지는 따로 설정할 목표가 없어요.</p> : <JoinForm challenge={ch} goal={mine!.goal} mode="edit" gender={user.gender} />}
          <div className="mt-3 pt-3 border-t border-line">
            <LeaveButton challengeId={ch.id} allowed={leave.allowed} reason={leave.reason} />
          </div>
        </section>
      ) : ch.is_active ? (
        <section className="card p-4 mt-3">
          <h2 className="font-bold mb-2">참여하기</h2>
          <JoinForm challenge={ch} next={`/challenges/${ch.id}`} gender={user.gender} />
        </section>
      ) : null}

      {canEdit && (
        <section className="card p-4 mt-3">
          <h2 className="font-bold">🎁 벌칙 현황 <span className="text-xs text-fg-3 font-normal">(개설자·관리자만 보여요)</span></h2>
          {pendingGift.length === 0 && gifts.length === 0 ? (
            <p className="text-sm text-fg-2 mt-1">아직 탈락자가 없어요.</p>
          ) : (
            <div className="mt-2 space-y-1.5 text-sm">
              {pendingGift.map((r) => (
                <div key={r.participant.id} className="flex items-center justify-between rounded-xl bg-bad-soft px-3 py-2">
                  <span><b>{r.participant.user.display_name}</b> · 탈락 (이달 실패 {r.summary.fails})</span>
                  <span className="chip bg-bad text-white">기프티콘 안 올림</span>
                </div>
              ))}
              {gifts.map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded-xl bg-bg-3/70 px-3 py-2 gap-2">
                  <span className="min-w-0"><b>{nameOf(g.from_user_id)}</b> → <b>{nameOf(g.to_user_id)}</b><span className="text-fg-3 num text-xs"> · {fmtDateTimeKo(g.created_at)}</span></span>
                  <span className={`chip shrink-0 ${g.opened_at ? "bg-ok-soft text-ok" : "bg-gold-soft text-gold"}`}>{g.opened_at ? "열어봄" : "전달됨"}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-fg-3 mt-2">기프티콘 이미지는 받은 사람만 볼 수 있어요.</p>
        </section>
      )}

      <section className="mt-4">
        <h2 className="text-lg font-extrabold mb-2">리더보드</h2>
        {board.length === 0 ? (
          <div className="card p-6 text-center text-fg-2 text-sm">첫 참가자가 되어 보세요</div>
        ) : (
          <>
            {slotDefs.length > 0 ? (
              <div className="flex gap-x-3 gap-y-1 flex-wrap text-[11px] text-fg-3 mb-2">
                {focus ? <span className="font-bold text-fg">{focus.phase === "open" ? `지금 ${focus.slot.label} 인증 시간 (${focus.slot.start}~${focus.slot.end})` : `다음은 ${focus.slot.label} (${focus.slot.start}~)`} · 안 한 사람이 위로</span> : <span className="font-bold text-fg">오늘 인증 시간 끝</span>}
                {slotDefs.map((d) => <span key={d.key}><span className={`inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1 ${slotColor(d.key)}`} />{d.label} 완료</span>)}
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red align-middle mr-1" />인증 전</span>
              </div>
            ) : joined ? (
              <div className="flex gap-3 text-[11px] text-fg-3 mb-2">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-soft border border-red/40 align-middle mr-1" />아직 인증 전</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-ok-soft border border-ok/40 align-middle mr-1" />완료</span>
              </div>
            ) : null}
            <ol className="space-y-2">
              {board.map(({ participant: p, summary: s, pending, waiting, weight, slots, focusPending }, i) => {
                const tone = s.eliminated ? "bg-bad-soft border-bad/30 opacity-70" : waiting ? "bg-bg-3/60 border-line" : focusPending ? "bg-red-soft border-red/40" : "bg-ok-soft border-ok/40";
                return (
                  <li key={p.id} className={`rounded-2xl border p-3 ${tone} ${p.user_id === user.id ? "ring-2 ring-fg/80" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-extrabold w-6 text-center text-fg-3 num">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold truncate">{p.user.display_name}</span>
                          {(cheers[p.user_id] ?? 0) > 0 && <span className="text-[11px] text-red num">🔥{cheers[p.user_id]}</span>}
                          <span className="text-[11px] text-red font-bold">Lv.{levelFromXp(p.user.xp)}</span>
                          {s.eliminated ? <span className="chip bg-bad text-white">탈락</span> : waiting ? <span className="chip bg-bg-2 text-fg-2">{fmtDateKo(s.startDate)} 시작</span> : slots ? null : pending ? <span className="chip bg-red text-white">인증 전</span> : <span className="chip bg-ok text-white">완료</span>}
                        </div>
                        {slots && !s.eliminated && !waiting && (
                          <div className="flex gap-1 flex-wrap mt-1">
                            {slots.map((x) => <SlotChip key={x.slot.key} status={x} color={slotColor(x.slot.key)} focused={focus?.slot.key === x.slot.key} />)}
                          </div>
                        )}
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
                    {joined && focusPending && p.user_id !== user.id && (
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
                    {(isAdmin(user) || (ch.created_by === user.id && p.user_id !== user.id)) && (
                      <div className="mt-1.5 pl-9 flex gap-3 items-center flex-wrap">
                        {isAdmin(user) && (waiting || s.startDate === today) && <StartNowButton userId={p.user_id} challengeId={ch.id} />}
                        {isAdmin(user) && !waiting && <AdminExcuseForm challengeId={ch.id} userId={p.user_id} name={p.user.display_name} slots={ch.config.kind === "slots" ? ch.config.slots.map((x) => ({ key: x.key, label: x.label })) : []} today={today} />}
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

/** 슬롯별 완료 색: 점심 금색, 저녁 남색 (3개 이상이면 초록) */
const SLOT_COLORS = ["bg-gold", "bg-navy", "bg-ok"];

/** 리더보드 슬롯 1칸: 완료는 슬롯 색, 열렸는데 안 했으면 빨강, 아직이면 회색, 놓쳤으면 실패 */
function SlotChip({ status, color, focused }: { status: SlotStatus; color: string; focused: boolean }) {
  const { slot, state } = status;
  if (state === "done") return <span className={`chip text-white ${color}`}>{slot.label} ✓</span>;
  if (state === "open") return <span className="chip bg-red text-white">{slot.label} 인증 전</span>;
  if (state === "upcoming") return <span className={`chip bg-bg-2 text-fg-2 border ${focused ? "border-red/40 text-red" : "border-line"}`}>{slot.label} {slot.start}~</span>;
  return <span className="chip bg-bad-soft text-bad">{slot.label} ✗</span>;
}
