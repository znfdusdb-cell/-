import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { fmtDateTimeKo } from "@/lib/time";
import { Shell } from "@/components/Shell";
import { JudgeButtons } from "@/components/JudgeButtons";
import { ProtectedImage } from "@/components/ProtectedMedia";

export const dynamic = "force-dynamic";

/** 관리자: 신고된 인증 판정 */
export default async function AdminReportsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");
  const repo = getRepo();
  const reports = await repo.listOpenReports().catch(() => []);
  const byCheckin = new Map<string, typeof reports>();
  for (const r of reports) byCheckin.set(r.checkin_id, [...(byCheckin.get(r.checkin_id) ?? []), r]);
  const checkins = (await Promise.all([...byCheckin.keys()].map((id) => repo.getCheckin(id)))).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const [users, challenges, urls] = await Promise.all([
    repo.getUsersByIds([...new Set([...checkins.map((c) => c.user_id), ...reports.map((r) => r.reporter_id)])]),
    repo.listChallenges({ includeInactive: true }),
    repo.photoUrls(checkins.filter((c) => c.photo_path).map((c) => c.photo_path)),
  ]);
  const name = (id: string) => users.find((u) => u.id === id)?.display_name ?? "?";

  return (
    <Shell user={toPublic(user)} title="신고 판정" right={<Link href="/admin">관리</Link>}>
      {checkins.length === 0 ? (
        <div className="card p-8 text-center text-fg-2 text-sm">대기 중인 신고가 없어요</div>
      ) : (
        <div className="space-y-3">
          {checkins.map((c) => {
            const ch = challenges.find((x) => x.id === c.challenge_id);
            const slotLabel = ch?.config.kind === "slots" ? ch.config.slots.find((s) => s.key === c.slot)?.label : "인증";
            return (
              <section key={c.id} className="card overflow-hidden">
                <div className="relative aspect-square bg-bg-3">
                  {c.media_type === "audio" && urls[c.photo_path] ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4"><audio controls src={urls[c.photo_path]} className="w-full" /></div>
                  ) : c.media_type === "link" ? (
                    <a href={c.link_url} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center p-4 text-sm break-all underline">{c.link_url}</a>
                  ) : urls[c.photo_path] ? (
                    <ProtectedImage url={urls[c.photo_path]} alt="신고된 인증" />
                  ) : null}
                </div>
                <div className="p-3">
                  <div className="font-bold">{name(c.user_id)} · {ch?.emoji} {ch?.title} · {slotLabel}</div>
                  <div className="text-xs text-fg-2 num">{fmtDateTimeKo(c.taken_at)} 인증 · 경험치 {c.xp}</div>
                  <ul className="mt-2 space-y-1">
                    {(byCheckin.get(c.id) ?? []).map((r) => (
                      <li key={r.id} className="text-xs rounded-lg bg-bad-soft px-2 py-1"><b>{name(r.reporter_id)}</b>: {r.reason} <span className="text-fg-3 num">· {fmtDateTimeKo(r.created_at)}</span></li>
                    ))}
                  </ul>
                  <div className="mt-3"><JudgeButtons checkinId={c.id} /></div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
