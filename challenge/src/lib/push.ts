import "server-only";
import webpush from "web-push";
import { getRepo } from "./repo";
import type { PushSubscriptionRow } from "./types";

export function vapidPublicKey(): string | null {
  const k = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  return k || null;
}

export function pushEnabled(): boolean {
  return Boolean(vapidPublicKey() && (process.env.VAPID_PRIVATE_KEY ?? "").trim());
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    (process.env.VAPID_SUBJECT ?? "mailto:admin@example.com").trim(),
    vapidPublicKey()!,
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  configured = true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** 구독 1건에 전송. 만료(404/410)면 구독을 지운다. 성공 여부 반환. */
export async function sendPush(sub: PushSubscriptionRow, payload: PushPayload): Promise<boolean> {
  if (!pushEnabled()) return false;
  configure();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 60 * 60 });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await getRepo().deletePushSubscription(sub.endpoint);
    return false;
  }
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (userIds.length === 0) return 0;
  const subs = await getRepo().listPushSubscriptions(userIds);
  const results = await Promise.all(subs.map((s) => sendPush(s, payload)));
  return results.filter(Boolean).length;
}
