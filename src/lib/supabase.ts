import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** 환경변수에 /rest/v1 이나 끝 슬래시, 공백이 딸려 와도 https://host 까지만 쓴다. */
export function supabaseUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

export function supabaseKey(): string | null {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return k || null;
}

export function hasSupabase(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

/** 서버 전용. service_role 키는 브라우저로 절대 내보내지 않는다. */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl()!, supabaseKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
