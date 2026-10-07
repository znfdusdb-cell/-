import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, toPublic } from "@/lib/current-user";
import { loadMyChallenges } from "@/lib/data";
import { CREATE_CHALLENGE_LEVEL, LEVEL_PERKS, levelFromXp } from "@/lib/game";
import { fmtDateKo, fmtHmKo, fmtTimeKo, kstDate } from "@/lib/time";
import { Shell } from "@/components/Shell";
import { Character } from "@/components/Character";
import { XpBar } from "@/components/XpBar";
import { CheckinButton } from "@/components/CheckinButton";
import { InstallHint } from "@/components/InstallHint";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const mine = await loadMyChallenges(user);
  if (mine.length === 0) redirect("/onboarding");
  const pub = toPublic(user);
  const level = levelFromXp(user.xp);
  const nextPerk = LEVEL_PERKS.find((p) => p.level > level);
  const today = kstDate();

  return (
    <Shell user={pub} title="거너스 챌린지" right={fmtDateKo(today)}>
      {/* 캐릭터 + 경험치 */}
      <section className="card p-4 flex items-center gap-3">
        <Link href="/me" className="shrink-0"><Character level={level} size={120} className="animate-float" /></Link>
        <div className="flex-1 min-w-0">
          <div className="font-display text-xl truncate">{pub.display_name}</div>
          <XpBar xp={user.xp} />
          {nextPerk && <p className="text-xs text-fg-3 mt-1.5">Lv.{nextPerk.level}이 되면: {nextPerk.look}</p>}
        </div>
      </section>

      <InstallHint />

      {/* 내 챌린지 */}
      <div className="space-y-4 mt-4">
        {mine.map(({ challenge: ch, participation: p, summary: s }) => (
          <section key={ch.id} className="card p-4">
            <div className="flex items-center justify-between">
              <Link href={`/challenges/${ch.id}`} className="font-display text-xl">{ch.emoji} {ch.title}</Link>
              <div className="flex gap-1.5">
                {s.streak > 0 && <span className="chip bg-bg-3 text-gold">🔥 {s.streak}{s.kind === "slots" ? "일" : "기간"} 연속</span>}
                {(s.kind === "slots" ? s.failDays : s.failPeriods) > 0 && <span className="chip bg-bad/15 text-bad">실패 {s.kind === "slots" ? s.failDays : s.failPeriods}</span>}
              </div>
            </div>

            {ch.config.goal === "weight" && p.goal.target_kg && (
              <p className="text-xs text-fg-2 mt-1">
                목표 {p.goal.target_kg}kg 감량 / {p.goal.days}일 · {p.goal.start_kg}kg 출발 ·{" "}
                {s.kind === "slots" && p.goal.days ? `D-${Math.max(0, p.goal.days - s.totalDays)}` : ""}
              </p>
            )}
            {ch.config.goal === "hobby" && p.goal.hobby && <p className="text-xs text-fg-2 mt-1">도전: {p.goal.hobby}</p>}

            {s.kind === "slots" && s.today.date < s.startDate && (
              <p className="text-xs text-warn mt-1">오늘 가입해서 집계는 {fmtDateKo(s.startDate)}부터예요. 오늘 인증은 경험치만 받아요.</p>
            )}
            {s.kind === "slots" ? (
              <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(s.today.slots.length, 3)}, minmax(0,1fr))` }}>
                {s.today.slots.map(({ slot, state, checkin }) => (
                  <div key={slot.key} className={`rounded-xl p-3 border ${state === "done" ? "border-ok/40 bg-ok/10" : state === "open" ? "border-red-2/60 bg-red/10" : state === "missed" && s.today.date >= s.startDate ? "border-bad/40 bg-bad/10" : "border-line bg-bg-3"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{slot.label}</span>
                      <span className="text-lg">{state === "done" ? "✅" : state === "open" ? "📷" : state === "missed" ? (s.today.date >= s.startDate ? "❌" : "—") : "⏳"}</span>
                    </div>
                    <div className="text-[11px] text-fg-2 num">{slot.start}~{slot.end}</div>
                    <div className="mt-2">
                      {state === "done" && checkin && <div className="text-xs text-ok num">🕒 {fmtTimeKo(checkin.taken_at)} 인증</div>}
                      {state === "open" && <CheckinButton challengeId={ch.id} slot={slot.key} label="지금 인증" className="btn btn-red w-full text-sm py-2" />}
                      {state === "upcoming" && <div className="text-xs text-fg-3">{fmtHmKo(slot.start)}부터</div>}
                      {state === "missed" && (s.today.date >= s.startDate ? <div className="text-xs text-bad">시간 지남 · 실패</div> : <div className="text-xs text-fg-3">집계 전</div>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex items-center justify-between text-sm">
                  <span>이번 기간 {s.current.count}/{s.current.required}회 {s.current.complete ? "완료 🎉" : ""}</span>
                  <span className="text-fg-2 num text-xs">{fmtDateKo(s.current.start)} ~ {fmtDateKo(s.current.end)} · D-{s.current.daysLeft}</span>
                </div>
                <div className="h-2 rounded-full bg-bg-3 mt-1.5 overflow-hidden">
                  <div className="h-full bg-red-2 rounded-full" style={{ width: `${Math.min(100, (s.current.count / s.current.required) * 100)}%` }} />
                </div>
                <div className="mt-3">
                  <CheckinButton challengeId={ch.id} label={s.current.complete ? "추가 인증 (기록만)" : "사진으로 인증"} className={`btn w-full ${s.current.complete ? "btn-ghost" : "btn-red"}`} />
                </div>
              </div>
            )}

            {s.kind === "slots" && s.today.slots.every((x) => x.state === "done") && (
              <p className="text-center text-sm text-ok mt-3">오늘 전부 인증 완료! 내일도 만나요 🙌</p>
            )}
          </section>
        ))}
      </div>

      <div className="mt-5 flex gap-2">
        <Link href="/challenges" className="btn btn-ghost flex-1 text-sm">다른 챌린지 보기</Link>
        <Link href="/gallery" className="btn btn-ghost flex-1 text-sm">오늘 갤러리</Link>
      </div>
      {level < CREATE_CHALLENGE_LEVEL && <p className="text-center text-xs text-fg-3 mt-3">Lv.{CREATE_CHALLENGE_LEVEL}부터 새 챌린지를 만들 수 있어요</p>}
    </Shell>
  );
}
