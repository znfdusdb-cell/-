import { hasSupabase, supabaseAdmin, supabaseUrl } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 연결 진단. 비밀번호 잠금 뒤에 있다. 키 값은 절대 돌려주지 않는다. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const info: Record<string, unknown> = {
    mode: hasSupabase() ? "supabase" : "seed",
    url_host: url ? (() => { try { return new URL(url).host; } catch { return "URL 형식 아님: " + url.slice(0, 12); } })() : "(없음)",
    url_raw_path: url ? (() => { try { return new URL(url).pathname; } catch { return "?"; } })() : "",
    url_used: supabaseUrl(),
    url_has_whitespace: /\s/.test(url),
    key_length: key.length,
    key_has_whitespace: /\s/.test(key),
    key_prefix: key.slice(0, 6),
  };
  if (hasSupabase()) {
    try {
      const { count, error } = await supabaseAdmin().from("sb_stocks").select("*", { count: "exact", head: true });
      info.sb_stocks_count = count;
      info.error = error ? `${error.code ?? ""} ${error.message}` : null;
    } catch (e) {
      info.error = e instanceof Error ? e.message : String(e);
    }
  }
  return Response.json(info);
}
