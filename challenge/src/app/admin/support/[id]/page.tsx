import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { Shell } from "@/components/Shell";
import { SupportChat } from "@/components/SupportChat";
import { ResolveTicketButton } from "@/components/ResolveTicketButton";

export const dynamic = "force-dynamic";

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");
  const { id } = await params;
  const repo = getRepo();
  const t = await repo.getTicket(id);
  if (!t) notFound();
  const who = await repo.getUserById(t.user_id);
  return (
    <Shell user={toPublic(user)} title={`${who?.display_name ?? "?"} 문의`} right={<Link href="/admin/support">목록</Link>}>
      {t.status === "open" && <ResolveTicketButton ticketId={t.id} />}
      <SupportChat ticketId={t.id} isAdmin />
    </Shell>
  );
}
