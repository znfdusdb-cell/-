import { NextResponse, type NextRequest } from "next/server";

/** 단일 사용자 잠금. SITE_PASSCODE 가 없으면 열려 있다 (로컬 개발). */
export async function proxy(req: NextRequest) {
  const pass = process.env.SITE_PASSCODE;
  if (!pass) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/manifest.webmanifest") {
    return NextResponse.next();
  }
  // proxy 런타임에서는 node:crypto 를 못 쓰므로 Web Crypto 로 같은 해시를 만든다.
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`swingbot:${pass}`));
  const expected = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (req.cookies.get("sb_gate")?.value === expected) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
