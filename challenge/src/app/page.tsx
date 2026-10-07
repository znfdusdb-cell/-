import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, toPublic } from "@/lib/current-user";
import { loadMyChallenges, loadPendingMonthlyReports } from "@/lib/data";
import { MonthlyReportModal } from "@/components/MonthlyReportModal";
import { getRepo } from "@/lib/repo";
import { CREATE_CHALLENGE_LEVEL, LEVEL_PERKS, levelFromXp } from "@/lib/game";
import { inferMethods, METHOD_LABEL, normalizeMethods, type Method } from "@/lib/methods";
import { daysBetween, fmtDateKo, fmtHmKo, fmtTimeKo, kstDate } from "@/lib/time";
import { Shell } from "@/components/Shell";
import { Character } from "@/components/Character";
import { XpBar } from "@/components/XpBar";
import { AudioRecordButton, CheckinButton, LinkCheckinButton } from "@/components/CheckinButton";
import { InstallHint } from "@/components/InstallHint";
import { WeightPanel } from "@/components/WeightPanel";
import { RechallengeButton } from "@/components/RechallengeButton";
import { GiftUploadButton } from "@/components/GiftUploadButton";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ go?: string; slot?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const mineAll = await loadMyChallenges(user);
  // 알림에서 들어온 챌린지를 맨 위로
  const mine = sp.go ? [...mineAll].sort((a, b) => Number(b.challenge.id === sp.go) - Number(a.challenge.id === sp.go)) : mineAll;
  const pub = toPublic(user);
  const level = levelFromXp(user.xp);
  const nextPerk = LEVEL_PERKS.find((p) => p.level > level);
  const today = kstDate();
  const repo = getRepo();
  // 탈락자가 이번 탈락 벌칙(기프티콘)을 올렸는지
  const giftSent = Object.fromEntries(
    await Promise.all(mine.filter((m) => m.summary.eliminated).map(async (m) => [m.participation.id, (await repo.listGiftsSentSince(user.id, m.challenge.id, m.participation.joined_at)).length > 0] as const)),
  );
  const weightLogs = Object.fromEntries(
    await Promise.all(
      mine.filter((m) => m.challenge.config.goal === "weight").map(async (m) => [m.participation.id, await repo.listWeightLogs(m.participation.id)] as const),
    ),
  );
  const anyEliminated = mine.some((m) => m.summary.eliminated);
  const monthly = await loadPendingMonthlyReports(mineAll);

  return (
    <Shell user={pub} title="거너스 챌린지" right={<span className="num">{fmtDateKo(today)}</span>}>
      {monthly.length > 0 && <MonthlyReportModal reports={monthly} level={level} gender={user.gender} />}
      <section className="card p-4 flex items-center gap-3">
        <Link href="/me" className="shrink-0"><Character level={level} gender={user.gender} size={112} className="animate-float" mood={anyEliminated ? "sad" : "happy"} /></Link>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-extrabold truncate">{pub.display_name}</div>
          <XpBar xp={user.xp} />
          {nextPerk && <p className="text-[11px] text-fg-3 mt-1.5">Lv.{nextPerk.level}: {nextPerk.look}</p>}
        </div>
      </section>

      <div className="mt-3"><InstallHint /></div>

      {mine.length === 0 && (
        <section className="card p-5 mt-3 text-center">
          <div className="font-extrabold">아직 참여 중인 챌린지가 없어요</div>
          <p className="text-sm text-fg-2 mt-1">챌린지는 매주 월요일에 시작해요. 지금 참여해 두면 월요일 아침에 알려 드려요.</p>
          <Link href="/onboarding" className="btn btn-red w-full mt-3">챌린지 고르기</Link>
          <p className="text-[11px] text-fg-3 mt-2">원하는 게 없으면 Lv.{CREATE_CHALLENGE_LEVEL}부터 직접 만들 수 있어요. 내 정보 탭에서 로그아웃할 수 있어요.</p>
        </section>
      )}

      <div className="space-y-3 mt-3">
        {mine.map(({ challenge: ch, participation: p, summary: s, todayCounts, todayPeople }) => {
          const waiting = today < s.startDate;
          const focus = sp.go === ch.id;
          const methods: Method[] = ch.config.kind === "count" ? (normalizeMethods(p.goal.methods).length ? normalizeMethods(p.goal.methods) : ch.config.goal === "hobby" ? inferMethods(p.goal.hobby ?? "") : ["camera", "album", "link"]) : [];
          return (
            <section key={ch.id} className={`card p-4 ${s.eliminated ? "border-bad" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/challenges/${ch.id}`} className="text-lg font-extrabold truncate">{ch.emoji} {ch.title}</Link>
                {s.streak > 0 && !s.eliminated && <span className="chip bg-gold-soft text-gold num shrink-0">{s.streak}{s.kind === "slots" ? "일" : "주"} 연속</span>}
              </div>
              {ch.config.goal === "hobby" && p.goal.hobby && <p className="text-sm text-fg-2 mt-0.5">도전: {p.goal.hobby}</p>}

              {/* 손실 프레이밍 */}
              {s.eliminated ? (
                <div className="mt-3 rounded-2xl bg-bad-soft border border-bad/30 p-3">
                  <div className="font-extrabold text-bad">탈락 · 이번 달 실패 {s.fails}번</div>
                  <div className="text-sm mt-0.5">벌칙: <b>{ch.penalty}</b></div>
                  {giftSent[p.id] ? (
                    <>
                      <div className="text-xs text-ok font-bold mt-2">벌칙 기프티콘 전달 완료</div>
                      <RechallengeButton challengeId={ch.id} />
                    </>
                  ) : (
                    <GiftUploadButton challengeId={ch.id} />
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-xl bg-red-soft px-3 py-2 text-xs leading-relaxed">
                  <div className="text-fg-2">
                    {ch.max_fails > 0 ? (
                      <>이번 달 실패 <b className="text-bad num">{s.fails}</b><span className="num">/{ch.max_fails}</span> · <b className="text-fg">{ch.max_fails - s.fails}번</b> 더 실패하면 탈락 · 실패마다 경험치 {s.kind === "slots" ? "−30" : "−60"}</>
                    ) : (
                      <>이번 달 실패 <b className="text-bad num">{s.fails}</b>번 · 실패마다 경험치 {s.kind === "slots" ? "−30" : "−60"}</>
                    )}
                  </div>
                  <div className="font-bold text-red">잃는 것: {ch.penalty}</div>
                </div>
              )}

              {waiting ? (
                <div className="mt-3 rounded-2xl border border-line bg-bg-3/60 p-3 text-sm">
                  <div className="font-bold">{fmtDateKo(s.startDate)}부터 시작 <span className="text-fg-3 num font-normal">D-{daysBetween(today, s.startDate)}</span></div>
                  <div className="text-xs text-fg-2 mt-0.5">챌린지는 매주 월요일에 시작해요. 시작하는 날 아침에 알려 드릴게요.</div>
                </div>
              ) : s.eliminated ? null : s.kind === "slots" ? (
                <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(s.today.slots.length, 3)}, minmax(0,1fr))` }}>
                  {s.today.slots.map(({ slot, state, checkin }) => (
                    <div key={slot.key} className={`rounded-2xl p-3 border ${state === "done" ? "border-ok/30 bg-ok-soft" : state === "open" ? "border-red/40 bg-red-soft" : state === "missed" ? "border-bad/30 bg-bad-soft" : "border-line bg-bg-3/60"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{slot.label}</span>
                        <span className={`text-[11px] font-bold ${state === "done" ? "text-ok" : state === "open" ? "text-red" : state === "missed" ? "text-bad" : "text-fg-3"}`}>
                          {state === "done" ? "완료" : state === "open" ? "지금" : state === "missed" ? "실패" : "대기"}
                        </span>
                      </div>
                      <div className="text-[11px] text-fg-3 num">{slot.start}~{slot.end}{(todayCounts[slot.key] ?? 0) > 0 ? ` · ${todayCounts[slot.key]}명 인증` : ""}</div>
                      <div className="mt-2">
                        {state === "done" && checkin && <div className="text-xs text-ok num">{fmtTimeKo(checkin.taken_at)} 인증</div>}
                        {state === "open" && <CheckinButton challengeId={ch.id} slot={slot.key} label="촬영 인증" className="btn btn-red w-full text-sm py-2" autoOpen={focus && (!sp.slot || sp.slot === slot.key)} />}
                        {state === "upcoming" && <div className="text-xs text-fg-3">{fmtHmKo(slot.start)}부터</div>}
                        {state === "missed" && <div className="text-xs text-bad">시간이 지났어요</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold">이번 주 {s.current.count}/{s.current.required}회{s.current.complete ? " 완료" : ""}{todayPeople > 0 ? <span className="text-fg-3 font-normal text-xs"> · 오늘 {todayPeople}명 인증</span> : null}</span>
                    <span className={`text-xs num ${s.current.daysLeft <= 1 && !s.current.complete ? "text-bad font-bold" : "text-fg-3"}`}>{s.current.daysLeft === 0 ? "오늘까지" : `D-${s.current.daysLeft}`}</span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-3 mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${s.current.complete ? "bg-ok" : "bg-red"}`} style={{ width: `${Math.min(100, (s.current.count / s.current.required) * 100)}%` }} />
                  </div>
                  <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(methods.length, 4)}, minmax(0,1fr))` }}>
                    {methods.map((m, i) => {
                      const cls = `btn text-sm px-2 ${i === 0 && !s.current.complete ? "btn-red" : "btn-ghost"}`;
                      if (m === "camera") return <CheckinButton key={m} challengeId={ch.id} mode="camera" label={METHOD_LABEL[m]} className={cls} autoOpen={focus && i === 0} />;
                      if (m === "album") return <CheckinButton key={m} challengeId={ch.id} mode="album" label={METHOD_LABEL[m]} className={cls} />;
                      if (m === "audio") return <AudioRecordButton key={m} challengeId={ch.id} label={METHOD_LABEL[m]} className={cls} />;
                      return <LinkCheckinButton key={m} challengeId={ch.id} label={METHOD_LABEL[m]} className={cls} />;
                    })}
                  </div>
                  {s.current.complete && <p className="text-[11px] text-fg-3 mt-1.5 text-center">이번 주 목표 달성. 추가 인증은 기록만 남아요.</p>}
                </div>
              )}

              {ch.config.goal === "weight" && p.goal.start_kg && p.goal.target_kg && p.goal.days && !s.eliminated && (
                <WeightPanel
                  challengeId={ch.id}
                  startKg={p.goal.start_kg}
                  targetLoss={p.goal.target_kg}
                  days={p.goal.days}
                  elapsedDays={waiting ? 0 : daysBetween(s.startDate, today)}
                  logs={(weightLogs[p.id] ?? []).map((w) => ({ date: w.local_date, kg: Number(w.kg) }))}
                  today={today}
                />
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <Link href="/challenges" className="btn btn-ghost flex-1 text-sm">다른 챌린지</Link>
        <Link href="/gallery" className="btn btn-ghost flex-1 text-sm">오늘 갤러리</Link>
      </div>
      {level < CREATE_CHALLENGE_LEVEL && <p className="text-center text-[11px] text-fg-3 mt-3">Lv.{CREATE_CHALLENGE_LEVEL}부터 새 챌린지를 만들 수 있어요</p>}
    </Shell>
  );
}
