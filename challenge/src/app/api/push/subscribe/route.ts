import { currentUser } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { pushEnabled } from "@/lib/push";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  if (!pushEnabled()) return Response.json({ ok: false, error: "서버에 알림 키(VAPID)가 없어요" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { subscription?: Sub } | null;
  const s = body?.subscription;
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return Response.json({ ok: false, error: "구독 정보가 비어 있어요" }, { status: 400 });
  await getRepo().upsertPushSubscription({
    user_id: user.id,
    endpoint: s.endpoint,
    keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
    user_agent: req.headers.get("user-agent") ?? "",
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) await getRepo().deletePushSubscription(body.endpoint);
  return Response.json({ ok: true });
}
