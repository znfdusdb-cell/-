import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { describeConfig, levelFromXp } from "@/lib/game";
import { pushEnabled, vapidProblem } from "@/lib/push";
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
  const ticketsOk = await repo.listOpenTickets().then(() => true).catch(() => false);
  const giftsOk = await repo.countUnreadGifts(user.id).then(() => true).catch(() => false);
  const cheersOk = await repo.countCheersReceived(user.id).then(() => true).catch(() => false);
  const reportsOk = await repo.listOpenReports().then(() => true).catch(() => false);
  const openReports = reportsOk ? await repo.listOpenReports() : [];
  const openTickets = ticketsOk ? await repo.listOpenTickets() : [];
  const subCount = new Map<string, number>();
  for (const s of subs) subCount.set(s.user_id, (subCount.get(s.user_id) ?? 0) + 1);

  return (
    <Shell user={toPublic(user)} title="관리">
      <section className="card p-4 text-xs text-fg-2 space-y-1">
        <div>저장소: <b className="text-fg">{repo.mode === "supabase" ? "Supabase" : "메모리(임시 · 재시작하면 사라짐)"}</b></div>
        <div>알림(웹 푸시): <b className={vapidProblem() ? "text-bad" : "text-fg"}>{vapidProblem() ?? "키 정상"}</b> · 구독 {subs.length}건{pushEnabled() ? "" : ""}</div>
        <div>크론: <code>/api/cron/remind?key=CRON_SECRET</code> 를 30분마다 호출 (README 참고)</div>
        {(!giftsOk || !ticketsOk || !cheersOk || !reportsOk) && (
          <div className="text-bad font-bold">
            마이그레이션 필요: {[!giftsOk && "05 (ch_gifts, 선물함)", !ticketsOk && "06 (ch_tickets, 문의 채팅)", !cheersOk && "07 (ch_cheers, 응원)", !reportsOk && "08 (ch_reports, 신고)"].filter(Boolean).join(" · ")} — Supabase SQL Editor에서 `challenge/supabase/migrations/` 파일 실행
          </div>
        )}
      </section>

      <Link href="/admin/support" className={`card p-4 mt-3 flex items-center justify-between ${openTickets.length > 0 ? "border-red/40 bg-red-soft" : ""}`}>
        <div>
          <div className="font-bold">문의 · 오류 신고 {openTickets.length > 0 && <span className="chip bg-red text-white ml-1 num">{openTickets.length}</span>}</div>
          <div className="text-xs text-fg-2 mt-0.5">멤버가 보낸 문의에 채팅으로 답하고, 해결되면 완료 처리</div>
        </div>
        <span className="text-fg-3">›</span>
      </Link>

      <Link href="/admin/reports" className={`card p-4 mt-3 flex items-center justify-between ${openReports.length > 0 ? "border-bad/40 bg-bad-soft" : ""}`}>
        <div>
          <div className="font-bold">🚩 인증 신고 판정 {openReports.length > 0 && <span className="chip bg-bad text-white ml-1 num">{new Set(openReports.map((r) => r.checkin_id)).size}</span>}</div>
          <div className="text-xs text-fg-2 mt-0.5">신고된 사진을 보고 인정 또는 불인정(실패 처리·경험치 회수)</div>
        </div>
        <span className="text-fg-3">›</span>
      </Link>

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
