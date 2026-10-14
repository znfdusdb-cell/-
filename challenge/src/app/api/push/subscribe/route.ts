import { currentUser } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { pushEnabled } from "@/lib/push";
import { deviceKey, siteUrl, splitUa } from "@/lib/site";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  if (!pushEnabled()) return Response.json({ ok: false, error: "서버에 알림 키(VAPID)가 없어요" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { subscription?: Sub } | null;
  const s = body?.subscription;
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return Response.json({ ok: false, error: "구독 정보가 비어 있어요" }, { status: 400 });
  // 알림 구독은 주소(origin)에 묶인다. 정식 주소가 아닌 곳(배포별 임시 주소 등)에서 켜면 알림이 크롬 알림으로 따로 오고 촬영 버튼도 없다 → 막는다
  const origin = (req.headers.get("origin") ?? "").replace(/\/$/, "");
  const site = siteUrl().replace(/\/$/, "");
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin && !local && origin !== site) {
    return Response.json({ ok: false, error: `정식 주소(${site.replace(/^https?:\/\//, "")})에서 켜 주세요. 지금 주소는 ${origin.replace(/^https?:\/\//, "")}` }, { status: 400 });
  }
  const repo = getRepo();
  const ua = req.headers.get("user-agent") ?? "";
  await repo.upsertPushSubscription({ user_id: user.id, endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, user_agent: origin ? `${ua} @${origin}` : ua });
  // 알림이 두 번 오지 않게: (1) 출처 기록이 없는 예전 구독, (2) 같은 기기(브라우저 버전 무시)의 다른 구독은 지운다
  let cleaned = 0;
  const mine = deviceKey(ua);
  for (const old of await repo.listPushSubscriptions([user.id])) {
    if (old.endpoint === s.endpoint) continue;
    const legacy = !splitUa(old.user_agent).origin;
    if (legacy || deviceKey(old.user_agent) === mine) { await repo.deletePushSubscription(old.endpoint); cleaned++; }
  }
  return Response.json({ ok: true, cleaned });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) await getRepo().deletePushSubscription(body.endpoint);
  return Response.json({ ok: true });
}
