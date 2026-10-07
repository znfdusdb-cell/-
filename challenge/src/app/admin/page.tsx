import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { describeConfig, levelFromXp } from "@/lib/game";
import { pushEnabled } from "@/lib/push";
import { fmtDateTimeKo } from "@/lib/time";
import { Shell } from "@/components/Shell";
import { AdminUserRow } from "@/components/AdminUserRow";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");
  const repo = getRepo();
  const [users, challenges, subs] = await Promise.all([repo.listUsers(), repo.listChallenges({ includeInactive: true }), repo.listPushSubscriptions()]);
  const subCount = new Map<string, number>();
  for (const s of subs) subCount.set(s.user_id, (subCount.get(s.user_id) ?? 0) + 1);

  return (
    <Shell user={toPublic(user)} title="관리">
      <section className="card p-4 text-xs text-fg-2 space-y-1">
        <div>저장소: <b className="text-fg">{repo.mode === "supabase" ? "Supabase" : "메모리(임시 · 재시작하면 사라짐)"}</b></div>
        <div>알림(웹 푸시): <b className="text-fg">{pushEnabled() ? "켜짐" : "VAPID 키 없음"}</b> · 구독 {subs.length}건</div>
        <div>크론: <code>/api/cron/remind?key=CRON_SECRET</code> 를 30분마다 호출 (README 참고)</div>
      </section>

      <section className="mt-4">
        <h2 className="text-lg font-extrabold mb-2">챌린지 {challenges.length}</h2>
        <div className="space-y-2">
          {challenges.map((c) => (
            <Link key={c.id} href={`/challenges/${c.id}/edit`} className="card p-3 flex items-center gap-3 block">
              <span className="text-2xl">{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.title} {!c.is_active && <span className="chip bg-bad/15 text-bad">비활성</span>}</div>
                <div className="text-xs text-fg-2">{describeConfig(c.config)} · 실패 시 {c.penalty}</div>
              </div>
              <span className="text-fg-3 text-sm">수정</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <h2 className="text-lg font-extrabold mb-2">멤버 {users.length}</h2>
        <div className="space-y-2">
          {users.map((u) => (
            <AdminUserRow
              key={u.id}
              user={{ id: u.id, username: u.username, display_name: u.display_name, role: u.role, xp: u.xp, level: levelFromXp(u.xp), pushCount: subCount.get(u.id) ?? 0, lastLogin: u.last_login_at ? fmtDateTimeKo(u.last_login_at) : "—" }}
            />
          ))}
        </div>
      </section>
    </Shell>
  );
}
