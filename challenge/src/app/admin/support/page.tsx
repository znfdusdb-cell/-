import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { fmtDateTimeKo } from "@/lib/time";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

/** 관리자: 열린 문의 목록 (해결 완료하면 사라짐) */
export default async function AdminSupportPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");
  const repo = getRepo();
  const tickets = await repo.listOpenTickets();
  const users = await repo.getUsersByIds(tickets.map((t) => t.user_id));
  const rows = await Promise.all(
    tickets.map(async (t) => {
      const msgs = await repo.listTicketMessages(t.id);
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.sender_id !== user.id && (!t.admin_read_at || m.created_at > t.admin_read_at)).length;
      return { t, name: users.find((u) => u.id === t.user_id)?.display_name ?? "?", last, unread };
    }),
  );
  return (
    <Shell user={toPublic(user)} title="문의 목록" right={<Link href="/admin">관리</Link>}>
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-fg-2 text-sm">열린 문의가 없어요</div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ t, name, last, unread }) => (
            <li key={t.id}>
              <Link href={`/admin/support/${t.id}`} className={`card p-3 flex items-center gap-3 block ${unread > 0 ? "border-red/40 bg-red-soft" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{name} {unread > 0 && <span className="chip bg-red text-white ml-1 num">{unread}</span>}</div>
                  <div className="text-xs text-fg-2 truncate">{last ? last.body || "📷 사진" : "(메시지 없음)"}</div>
                </div>
                <div className="text-[11px] text-fg-3 num shrink-0">{fmtDateTimeKo(t.updated_at)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
