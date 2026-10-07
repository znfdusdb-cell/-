import "server-only";
import webpush from "web-push";
import { getRepo } from "./repo";
import type { PushSubscriptionRow } from "./types";

function clean(v: string | undefined): string {
  return (v ?? "").replace(/\s+/g, "").replace(/^["']|["']$/g, "");
}

export function vapidPublicKey(): string | null {
  const k = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  return k || null;
}

export function pushEnabled(): boolean {
  return Boolean(vapidPublicKey() && clean(process.env.VAPID_PRIVATE_KEY));
}

/** 키 모양 검사. 문제가 있으면 사람이 읽을 메시지, 없으면 null */
export function vapidProblem(): string | null {
  const pub = vapidPublicKey() ?? "";
  const priv = clean(process.env.VAPID_PRIVATE_KEY);
  if (!pub || !priv) return "Vercel 환경변수에 NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 가 없어요";
  if (!/^[A-Za-z0-9_-]{86,88}$/.test(pub)) return `공개 키(NEXT_PUBLIC_VAPID_PUBLIC_KEY) 모양이 이상해요 (길이 ${pub.length}, 보통 87자). 'Public Key:' 아래 줄 전체를 그대로 넣었는지 확인`;
  if (!/^[A-Za-z0-9_-]{42,44}$/.test(priv)) return `비밀 키(VAPID_PRIVATE_KEY) 모양이 이상해요 (길이 ${priv.length}, 보통 43자). 'Private Key:' 아래 줄 전체를 그대로 넣었는지 확인`;
  return null;
}

function subject(): string {
  const s = (process.env.VAPID_SUBJECT ?? "").trim();
  if (!s) return "mailto:admin@example.com";
  if (/^(mailto:|https?:\/\/)/i.test(s)) return s;
  return s.includes("@") ? `mailto:${s}` : `https://${s}`;
}

let configured = false;
let configureError: string | null = null;

/** VAPID 설정. 실패하면 메시지를 돌려주고 던지지 않는다. */
export function configurePush(): string | null {
  if (configured) return null;
  if (configureError) return configureError;
  const problem = vapidProblem();
  if (problem) { configureError = problem; return problem; }
  try {
    webpush.setVapidDetails(subject(), vapidPublicKey()!, clean(process.env.VAPID_PRIVATE_KEY));
    configured = true;
    return null;
  } catch (e) {
    configureError = `알림 키 설정 실패: ${(e as Error).message}`;
    return configureError;
  }
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export type PushResult = { ok: boolean; reason?: string };

/** 구독 1건에 전송. 만료(404/410)면 구독을 지운다. */
export async function sendPushOne(sub: PushSubscriptionRow, payload: PushPayload): Promise<PushResult> {
  const err = configurePush();
  if (err) return { ok: false, reason: err };
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 60 * 60 });
    return { ok: true };
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    const body = String((e as { body?: string }).body ?? (e as Error).message ?? "").slice(0, 200);
    if (code === 404 || code === 410) {
      await getRepo().deletePushSubscription(sub.endpoint).catch(() => {});
      return { ok: false, reason: "구독이 만료돼서 지웠어요. 알림을 껐다 다시 켜 주세요" };
    }
    if (code === 401 || code === 403) return { ok: false, reason: `푸시 서버가 키를 거부했어요(${code}). 알림을 켠 뒤에 키를 바꿨다면 알림을 껐다 다시 켜야 해요. ${body}` };
    return { ok: false, reason: `전송 실패(${code ?? "?"}): ${body}` };
  }
}

export async function sendPush(sub: PushSubscriptionRow, payload: PushPayload): Promise<boolean> {
  return (await sendPushOne(sub, payload)).ok;
}

/** 여러 사용자에게 전송. 성공 수와 마지막 실패 이유 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; total: number; reason?: string }> {
  if (userIds.length === 0) return { sent: 0, total: 0 };
  const subs = await getRepo().listPushSubscriptions(userIds);
  const results = await Promise.all(subs.map((s) => sendPushOne(s, payload)));
  const sent = results.filter((r) => r.ok).length;
  const reason = results.find((r) => !r.ok)?.reason;
  return { sent, total: subs.length, reason };
}
