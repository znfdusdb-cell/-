import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_PREFIXES = ["/login", "/_next", "/sw.js", "/manifest.webmanifest", "/icons/", "/favicon.ico", "/api/cron/", "/api/health", "/offline"];

/** 로그인 안 된 요청은 /login 으로. API 는 401. */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const uid = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (uid) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });

  const u = req.nextUrl.clone();
  u.pathname = "/login";
  u.search = "";
  if (pathname !== "/") u.searchParams.set("next", pathname);
  return NextResponse.redirect(u);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
