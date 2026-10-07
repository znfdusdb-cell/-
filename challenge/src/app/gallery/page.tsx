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

  let content: React.ReactNode = null;
  if (current) {
    const mondayOf = (d: string) => addDays(d, -((kstWeekday(d) + 6) % 7));
    const from = current.config.kind === "slots" ? date : current.config.period_days === 7 ? mondayOf(date) : addDays(date, -(current.config.period_days - 1));
    const [checkins, participants] = await Promise.all([repo.listCheckins({ challengeId: current.id, from, to: date }), repo.listParticipants(current.id)]);
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
    const slotLabel = (key: string) => (current.config.kind === "slots" ? current.config.slots.find((s) => s.key === key)?.label : undefined);

    content = (
      <>
        <p className="text-xs text-fg-3 mb-2">
          {current.config.kind === "slots" ? fmtDateKo(date) : `${fmtDateKo(from)} ~ ${fmtDateKo(date)}`} · 참가자 {participants.length}명 · 인증 {checkins.length}건
        </p>
        {checkins.length === 0 ? (
          <div className="card p-8 text-center text-fg-2 text-sm">아직 올라온 인증이 없어요</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {checkins.map((c) => {
              const p = users.get(c.user_id);
              const caption = current.config.kind === "slots" ? slotLabel(c.slot) : p?.goal.hobby;
              return <PhotoCard key={c.id} checkin={c} user={p?.user ?? { display_name: "탈퇴", xp: 0 }} url={urls[c.photo_path]} caption={caption} canDelete={isAdmin(user) || c.user_id === user.id} progress={progress.get(c.user_id) ?? null} />;
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
          <Link key={c.id} href={`/gallery?c=${c.id}&d=${date}`} className={`chip whitespace-nowrap py-1.5 px-3 text-sm border ${current?.id === c.id ? "bg-fg text-white border-fg" : "bg-bg-2 text-fg-2 border-line"}`}>
            {c.emoji} {c.title}
          </Link>
        ))}
      </div>
      {current && (
        <div className="flex items-center justify-between my-2">
          <Link href={`/gallery?c=${current.id}&d=${addDays(date, -1)}`} className="btn btn-ghost text-xs py-1.5">전날</Link>
          <span className="font-extrabold">{date === today ? "오늘" : fmtDateKo(date)}</span>
          {date < today ? <Link href={`/gallery?c=${current.id}&d=${addDays(date, 1)}`} className="btn btn-ghost text-xs py-1.5">다음날</Link> : <span className="w-14" />}
        </div>
      )}
      {content ?? <div className="card p-8 text-center text-fg-2 text-sm">챌린지가 없어요</div>}
      <p className="text-[11px] text-fg-3 mt-3 text-center">사진은 앱 안에서만 볼 수 있고 저장은 막혀 있어요. 내 인증은 삭제할 수 있어요.</p>
    </Shell>
  );
}
