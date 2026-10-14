/** 앱의 정식 주소 (톡방에 올리는 그 주소). NEXT_PUBLIC_SITE_URL > Vercel 프로덕션 도메인 > localhost */
export function siteUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (explicit) return explicit.startsWith("http") ? explicit : `https://${explicit}`;
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** 같은 기기 판별용 키: UA 에서 버전 숫자를 지운다 (크롬 업데이트로 버전이 바뀌어도 같은 기기로 본다) */
export function deviceKey(ua: string): string {
  return splitUa(ua).ua.replace(/[\d.]+/g, "").replace(/\s+/g, " ").trim();
}

/** 구독 user_agent 에 붙여 둔 출처 (" @https://...") 분리 */
export function splitUa(ua: string): { ua: string; origin: string | null } {
  const i = ua.lastIndexOf(" @http");
  if (i < 0) return { ua, origin: null };
  return { ua: ua.slice(0, i), origin: ua.slice(i + 2) };
}
