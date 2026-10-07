import { randomUUID } from "node:crypto";
import { currentUser, isAdmin } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { sendPushToUsers } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

/**
 * 개발자 문의 채팅.
 *  GET  ?ticket=<id>           → 메시지 목록(+사진 URL), 상태, 상대 이름. 사용자는 자기 열린 문의만, 관리자는 아무거나
 *  POST FormData(body, file?, ticket_id?) → 사용자: 열린 문의 없으면 새로 만듦 / 관리자: ticket_id 필수
 */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return bad("로그인이 필요해요", 401);
  const repo = getRepo();
  const id = new URL(req.url).searchParams.get("ticket");
  let ticket;
  try {
    ticket = id ? await repo.getTicket(id) : (await repo.getOpenTicket(me.id)) ?? (await repo.getLatestTicket(me.id));
  } catch {
    return Response.json({ ok: false, error: "문의 기능이 아직 준비 중이에요 (관리자가 마이그레이션 06을 실행하면 켜져요)" }, { status: 503 });
  }
  if (ticket && !isAdmin(me) && ticket.user_id !== me.id) ticket = null;
  if (!ticket) return Response.json({ ok: true, ticket: null, messages: [] });
  const msgs = await repo.listTicketMessages(ticket.id);
  const urls = await repo.photoUrls(msgs.filter((m) => m.photo_path).map((m) => m.photo_path));
  const other = isAdmin(me) ? await repo.getUserById(ticket.user_id) : null;
  // 읽음 표시
  const nowIso = new Date().toISOString();
  await repo.updateTicket(ticket.id, isAdmin(me) ? { admin_read_at: nowIso } : { user_read_at: nowIso }).catch(() => {});
  return Response.json({
    ok: true,
    ticket: { id: ticket.id, status: ticket.status, user_id: ticket.user_id, other_name: other?.display_name ?? "개발자" },
    messages: msgs.map((m) => ({ id: m.id, mine: m.sender_id === me.id, body: m.body, url: m.photo_path ? urls[m.photo_path] ?? null : null, at: m.created_at })),
  });
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return bad("로그인이 필요해요", 401);
  const repo = getRepo();
  const fd = await req.formData();
  const body = String(fd.get("body") ?? "").trim().slice(0, 1000);
  const file = fd.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!body && !hasFile) return bad("내용이나 사진을 넣어 주세요");

  let ticket;
  const ticketId = String(fd.get("ticket_id") ?? "");
  if (isAdmin(me) && ticketId) {
    ticket = await repo.getTicket(ticketId);
    if (!ticket) return bad("없는 문의");
  } else {
    ticket = await repo.getOpenTicket(me.id);
    if (!ticket) ticket = await repo.createTicket(me.id);
  }
  if (ticket.status === "resolved" && !isAdmin(me)) {
    ticket = await repo.createTicket(me.id);
  }

  let photoPath = "";
  if (hasFile) {
    const f = file as File;
    const type = f.type.split(";")[0].trim();
    const ext = IMAGE_EXT[type];
    if (!ext) return bad("이미지 파일만 첨부할 수 있어요");
    if (f.size > 12 * 1024 * 1024) return bad("사진이 너무 커요 (12MB 이하)");
    photoPath = `support/${ticket.id}/${randomUUID()}.${ext}`;
    await repo.putPhoto(photoPath, new Uint8Array(await f.arrayBuffer()), type);
  }
  const msg = await repo.addTicketMessage({ ticket_id: ticket.id, sender_id: me.id, body, photo_path: photoPath });

  // 상대에게 알림
  if (isAdmin(me) && ticket.user_id !== me.id) {
    await sendPushToUsers([ticket.user_id], { title: "개발자 답장이 왔어요 💬", body: body || "사진을 보냈어요", url: "/support", tag: "support" });
  } else {
    const admins = (await repo.listUsers()).filter((u) => u.role === "admin" && u.id !== me.id).map((u) => u.id);
    await sendPushToUsers(admins, { title: `문의: ${me.display_name}`, body: body || "사진을 보냈어요", url: `/admin/support/${ticket.id}`, tag: `support-${ticket.id}` });
  }
  return Response.json({ ok: true, ticket_id: ticket.id, message: { id: msg.id, mine: true, body: msg.body, url: null, at: msg.created_at } });
}
