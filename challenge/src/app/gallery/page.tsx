import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { addDays, fmtDateKo, kstDate, kstWeekday } from "@/lib/time";
import { Shell } from "@/components/Shell";
import { PhotoCard } from "@/components/PhotoCard";

export const dynamic = "force-dynamic";

/** 갤러리: 챌린지별로 그날 올라온 모든 참가자 사진 */
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
    // 시간대형은 그날. 횟수형은 주 단위면 그 주 월요일부터, 아니면 그날까지 period_days 동안
    const mondayOf = (d: string) => addDays(d, -((kstWeekday(d) + 6) % 7));
    const from = current.config.kind === "slots" ? date : current.config.period_days === 7 ? mondayOf(date) : addDays(date, -(current.config.period_days - 1));
    const [checkins, participants] = await Promise.all([repo.listCheckins({ challengeId: current.id, from, to: date }), repo.listParticipants(current.id)]);
    const users = new Map(participants.map((p) => [p.user_id, p]));
    const urls = await repo.photoUrls(checkins.map((c) => c.photo_path));
    const slotLabel = (key: string) => (current.config.kind === "slots" ? current.config.slots.find((s) => s.key === key)?.label : undefined);

    content = (
      <>
        <p className="text-xs text-fg-3 mb-2">
          {current.config.kind === "slots" ? `${fmtDateKo(date)} 인증 사진` : `${fmtDateKo(from)} ~ ${fmtDateKo(date)} 인증 사진`} · 참가자 {participants.length}명 · 사진 {checkins.length}장
        </p>
        {checkins.length === 0 ? (
          <div className="card p-8 text-center text-fg-2 text-sm">아직 올라온 사진이 없어요</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {checkins.map((c) => {
              const p = users.get(c.user_id);
              const caption = current.config.kind === "slots" ? slotLabel(c.slot) : p?.goal.hobby;
              return <PhotoCard key={c.id} checkin={c} user={p?.user ?? { display_name: "탈퇴", xp: 0 }} url={urls[c.photo_path]} caption={caption} />;
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
          <Link key={c.id} href={`/gallery?c=${c.id}&d=${date}`} className={`chip whitespace-nowrap py-1.5 px-3 text-sm ${current?.id === c.id ? "bg-red text-white" : "bg-bg-3 text-fg-2"}`}>
            {c.emoji} {c.title}
          </Link>
        ))}
      </div>
      {current && (
        <div className="flex items-center justify-between my-2">
          <Link href={`/gallery?c=${current.id}&d=${addDays(date, -1)}`} className="btn btn-ghost text-xs py-1.5">← 전날</Link>
          <span className="font-display text-lg">{date === today ? "오늘" : fmtDateKo(date)}</span>
          {date < today ? <Link href={`/gallery?c=${current.id}&d=${addDays(date, 1)}`} className="btn btn-ghost text-xs py-1.5">다음날 →</Link> : <span className="w-16" />}
        </div>
      )}
      {content ?? <div className="card p-8 text-center text-fg-2 text-sm">챌린지가 없어요</div>}
    </Shell>
  );
}
