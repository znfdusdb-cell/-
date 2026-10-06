import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseUrl } from "@/lib/supabase";
import { anonKey, isAllowed } from "@/lib/auth";

/** 매직링크 클릭 후 돌아오는 곳. code 를 세션으로 바꾸고 허용 이메일인지 한 번 더 확인한다. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const target = req.nextUrl.clone();
  target.search = "";
  target.pathname = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const fail = (err: string) => {
    const u = req.nextUrl.clone();
    u.pathname = "/login";
    u.search = "";
    u.searchParams.set("err", err);
    return NextResponse.redirect(u);
  };
  if (!code || !supabaseUrl() || !anonKey()) return fail("nocode");

  let res = NextResponse.redirect(target);
  const supabase = createServerClient(supabaseUrl()!, anonKey()!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("exchange");
  if (!isAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    res = fail("notallowed");
    for (const c of req.cookies.getAll()) if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    return res;
  }
  return res;
}
