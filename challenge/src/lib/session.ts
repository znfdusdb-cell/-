/**
 * 로그인 세션 쿠키. HMAC-SHA256 서명한 `payload.sig`. Web Crypto 만 써서 proxy(Edge)와 서버 양쪽에서 동작.
 */
export const SESSION_COOKIE = "ch_sess";
export const SESSION_DAYS = 180;

type Payload = { uid: string; exp: number };

function secret(): string {
  const s = (process.env.SESSION_SECRET ?? "").trim();
  if (s) return s;
  // 로컬 개발 폴백. 배포에서는 반드시 SESSION_SECRET 을 넣는다.
  return "dev-only-secret-change-me";
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(uid: string): Promise<string> {
  const payload: Payload = { uid, exp: Date.now() + SESSION_DAYS * 86400000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), unb64url(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body))) as Payload;
    if (!payload.uid || payload.exp < Date.now()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}
