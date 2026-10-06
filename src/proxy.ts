import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = ["/login", "/auth/", "/_next", "/favicon.ico", "/icon.svg", "/manifest.webmanifest"];

/**
 * 잠금. 우선순위: 매직링크(허용 이메일 1개) > 비밀번호 > 열림.
 * 매직링크 모드에서는 Supabase 세션의 이메일이 AUTH_ALLOWED_EMAIL 과 같아야만 통과한다.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const allowed = (process.env.AUTH_ALLOWED_EMAIL ?? "").trim().toLowerCase();
  const pass = process.env.SITE_PASSCODE;

  const toLogin = () => {
    const u = req.nextUrl.clone();
    u.pathname = "/login";
    u.search = "";
    u.searchParams.set("next", pathname);
    return NextResponse.redirect(u);
  };

  if (url && anon && allowed) {
    let res = NextResponse.next({ request: req });
    let origin: string;
    try { origin = new URL(url.includes("://") ? url : `https://${url}`).origin; } catch { return toLogin(); }
    const supabase = createServerClient(origin, anon, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (email && email === allowed) return res;
    return toLogin();
  }

  if (pass) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`swingbot:${pass}`));
    const expected = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (req.cookies.get("sb_gate")?.value === expected) return NextResponse.next();
    return toLogin();
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
