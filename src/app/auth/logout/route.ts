import { NextResponse, type NextRequest } from "next/server";
import { authMode, authClient, AUTH_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.clone();
  u.pathname = "/login";
  u.search = "";
  const res = NextResponse.redirect(u);
  if (authMode() === "magic") {
    const supabase = await authClient();
    await supabase.auth.signOut();
    for (const c of req.cookies.getAll()) if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
  }
  res.cookies.set(AUTH_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
