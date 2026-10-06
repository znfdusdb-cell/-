import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseUrl } from "./supabase";

export const AUTH_COOKIE = "sb_gate";

/**
 * 인증 방식 3단계.
 *  magic   : Supabase Auth 이메일 매직링크 + 허용 이메일 1개 (AUTH_ALLOWED_EMAIL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
 *  passcode: SITE_PASSCODE 하나 (폴백)
 *  open    : 둘 다 없음 (로컬 개발)
 */
export type AuthMode = "magic" | "passcode" | "open";

export function allowedEmail(): string | null {
  const e = (process.env.AUTH_ALLOWED_EMAIL ?? "").trim().toLowerCase();
  return e || null;
}

export function anonKey(): string | null {
  const k = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return k || null;
}

export function authMode(): AuthMode {
  if (supabaseUrl() && anonKey() && allowedEmail()) return "magic";
  if (process.env.SITE_PASSCODE) return "passcode";
  return "open";
}

export function gateEnabled(): boolean {
  return Boolean(process.env.SITE_PASSCODE);
}

export function gateToken(): string {
  return createHash("sha256").update(`swingbot:${process.env.SITE_PASSCODE ?? ""}`).digest("hex");
}

/** 서버 컴포넌트·서버 액션·라우트 핸들러용 Supabase Auth 클라이언트 (anon 키, 쿠키 세션). */
export async function authClient() {
  const jar = await cookies();
  return createServerClient(supabaseUrl()!, anonKey()!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // 서버 컴포넌트에서는 쿠키를 못 쓴다. proxy 가 세션 갱신을 맡는다.
        }
      },
    },
  });
}

export function isAllowed(email: string | null | undefined): boolean {
  const a = allowedEmail();
  return Boolean(a && email && email.trim().toLowerCase() === a);
}
