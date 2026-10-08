import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { addDays, fmtDateKo, kstDate, kstWeekday } from "@/lib/time";
import { weightProgress } from "@/lib/game";
import { Shell } from "@/components/Shell";
import { PhotoCard } from "@/components/PhotoCard";

export const dynamic = "force-dynamic";

/** 갤러리: 챌린지별로 그날(취미는 그 주) 올라온 모든 참가자 인증 */
export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ c?: string; d?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const repo = getRepo();
  const sp = await searchParams;
  const today = kstDate();
  const date = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && sp.d <= today ? sp.d : today;

  const [challenges, myParts] = await Promise.all([repo.listChallenges(), repo.listParticipationsByUser(user.id)]);
  const myIds = new Set(myParts.filter((p) => p.status === "active").map((p) => p.challenge_id));
  const ordered = [...challenges].sort((a, b) => Number(myIds.has(b.id)) - Number(myIds.has(a.id)));
  const current = ordered.find((c) => c.id === sp.c) ?? ordered[0];

  // 기간 단위: 매일 챌린지는 하루, 주 단위 취미는 월~일, 그 외는 period_days 일
  const mondayOf = (d: string) => addDays(d, -((kstWeekday(d) + 6) % 7));
  const step = !current || current.config.kind === "slots" ? 1 : current.config.period_days;
  const weekly = Boolean(current && current.config.kind === "count" && current.config.period_days === 7);
  const from = step === 1 ? date : weekly ? mondayOf(date) : addDays(date, -(step - 1));
  const to = weekly ? (addDays(from, 6) < today ? addDays(from, 6) : today) : date;
  const prevDate = addDays(from, -1);
  const nextDate = addDays(to, 1);
  const title =
    step === 1 ? (date === today ? "오늘" : fmtDateKo(date)) : weekly ? (from === mondayOf(today) ? "이번 주" : from === mondayOf(addDays(today, -7)) ? "지난주" : `${fmtDateKo(from)} ~ ${fmtDateKo(to)}`) : from <= today && to >= today ? "이번 기간" : `${fmtDateKo(from)} ~ ${fmtDateKo(to)}`;

  let content: React.ReactNode = null;
  if (current) {
    const [checkins, participants] = await Promise.all([repo.listCheckins({ challengeId: current.id, from, to, includeRejected: true }), repo.listParticipants(current.id)]);
    const myReports = new Set((await repo.listReportsFor(checkins.map((c) => c.id)).catch(() => [])).filter((r) => r.reporter_id === user.id).map((r) => r.checkin_id));
    const users = new Map(participants.map((p) => [p.user_id, p]));
    // 다이어트: 사람별 감량 진행률 (몸무게 숫자는 비공개)
    const progress = new Map<string, { targetLoss: number; lost: number; ratio: number; reached: boolean }>();
    if (current.config.goal === "weight") {
      const logs = await repo.listWeightLogsMany(participants.map((p) => p.id));
      for (const p of participants) {
        if (!p.goal.start_kg || !p.goal.target_kg) continue;
        const mine = logs.filter((l) => l.participation_id === p.id);
        const latest = mine.length ? Number(mine[mine.length - 1].kg) : null;
        const wp = weightProgress(p.goal.start_kg, p.goal.target_kg, latest);
        progress.set(p.user_id, { targetLoss: p.goal.target_kg, lost: wp.lost, ratio: wp.ratio, reached: wp.reached });
      }
    }
    const urls = await repo.photoUrls(checkins.filter((c) => c.photo_path).map((c) => c.photo_path));
    // 응원 수·내가 눌렀는지 (마이그레이션 07 전이면 빈 값)
    const cheers = await repo.cheerStats(checkins.map((c) => c.id), user.id).catch(() => ({} as Record<string, { count: number; mine: boolean }>));
    const slotLabel = (key: string) => (current.config.kind === "slots" ? current.config.slots.find((s) => s.key === key)?.label : undefined);

    content = (
      <>
        <p className="text-xs text-fg-3 mb-2">
          {step === 1 ? fmtDateKo(date) : `${fmtDateKo(from)} ~ ${fmtDateKo(to)}`} · 참가자 {participants.length}명 · 인증 {checkins.length}건
        </p>
        {checkins.length === 0 ? (
          <div className="card p-8 text-center text-fg-2 text-sm">아직 올라온 인증이 없어요</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {checkins.map((c) => {
              const p = users.get(c.user_id);
              const caption = current.config.kind === "slots" ? slotLabel(c.slot) : p?.goal.hobby;
              const cs = cheers[c.id] ?? { count: 0, mine: false };
              return <PhotoCard key={c.id} checkin={c} user={p?.user ?? { display_name: "탈퇴", xp: 0 }} url={urls[c.photo_path]} caption={caption} canDelete={isAdmin(user) || c.user_id === user.id} progress={progress.get(c.user_id) ?? null} cheer={{ ...cs, own: c.user_id === user.id }} report={{ own: c.user_id === user.id, reported: myReports.has(c.id) }} />;
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <Shell user={toPublic(user)} title="갤러리">
      <div className="scroll-x flex gap-2 pb-2">
        {ordered.map((c) => (
          <Link key={c.id} href={`/gallery?c=${c.id}&d=${today}`} className={`chip whitespace-nowrap py-1.5 px-3 text-sm border ${current?.id === c.id ? "bg-fg text-white border-fg" : "bg-bg-2 text-fg-2 border-line"}`}>
            {c.emoji} {c.title}
          </Link>
        ))}
      </div>
      {current && (
        <div className="flex items-center justify-between my-2">
          <Link href={`/gallery?c=${current.id}&d=${prevDate}`} className="btn btn-ghost text-xs py-1.5">{step === 1 ? "전날" : weekly ? "지난주" : "이전 기간"}</Link>
          <span className="font-extrabold">{title}</span>
          {nextDate <= today ? <Link href={`/gallery?c=${current.id}&d=${nextDate > today ? today : nextDate}`} className="btn btn-ghost text-xs py-1.5">{step === 1 ? "다음날" : weekly ? "다음주" : "다음 기간"}</Link> : <span className="w-14" />}
        </div>
      )}
      {content ?? <div className="card p-8 text-center text-fg-2 text-sm">챌린지가 없어요</div>}
      <p className="text-[11px] text-fg-3 mt-3 text-center">사진은 앱 안에서만 볼 수 있고 저장은 막혀 있어요. 내 인증은 삭제할 수 있어요.</p>
    </Shell>
  );
}
