"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/repo";
import { ALLOWED_MOVES } from "@/lib/constants";
import type { Stage } from "@/lib/types";
import { AUTH_COOKIE, gateEnabled, gateToken, authMode, authClient, isAllowed } from "@/lib/auth";

export async function moveStageAction(input: { code: string; from: Stage; to: Stage; reason: string }) {
  const allowed = ALLOWED_MOVES[input.from]?.some((m) => m.to === input.to);
  if (!allowed) return { ok: false as const, error: `허용되지 않은 이동: ${input.from} → ${input.to}` };
  const reason = input.reason.trim();
  if (reason.length < 2) return { ok: false as const, error: "이유를 적어야 이동할 수 있다 (나중에 복기용)" };
  const res = await getRepo().moveStage(input.code, input.to, reason, "bium");
  if (res.ok) {
    revalidatePath("/");
    revalidatePath(`/stocks/${input.code}`);
  }
  return res;
}

export async function loginAction(formData: FormData) {
  const pass = String(formData.get("passcode") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!gateEnabled() || pass === process.env.SITE_PASSCODE) {
    const jar = await cookies();
    jar.set(AUTH_COOKIE, gateToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
    redirect(next.startsWith("/") ? next : "/");
  }
  redirect(`/login?err=1&next=${encodeURIComponent(next)}`);
}

/** 매직링크 발송. 허용 이메일이 아니면 발송 자체를 하지 않는다. */
export async function sendMagicLinkAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/");
  if (authMode() !== "magic") redirect("/login");
  if (!isAllowed(email)) redirect(`/login?err=notallowed&next=${encodeURIComponent(next)}`);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${proto}://${host}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  });
  if (error) redirect(`/login?err=send&msg=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(`/login?sent=1`);
}

export async function approveThesisAction(input: { thesisId: number; code: string; note: string }) {
  const res = await getRepo().approveThesis(input.thesisId, "bium", input.note.trim() || "사이트 버튼 승인");
  if (res.ok) {
    revalidatePath("/");
    revalidatePath(`/stocks/${input.code}`);
  }
  return res;
}

/** 쉬운/자세히 보기 전환 (쿠키, 1년) */
export async function setViewAction(formData: FormData) {
  const mode = String(formData.get("mode")) === "detail" ? "detail" : "easy";
  const back = String(formData.get("back") ?? "/");
  const jar = await cookies();
  jar.set("sb_view", mode, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect(back.startsWith("/") ? back : "/");
}

export async function decideProposalAction(input: { id: number; decision: "approve" | "reject"; note: string }) {
  const note = input.note.trim();
  if (input.decision === "reject" && note.length < 2) return { ok: false as const, error: "거절 이유를 적어라" };
  const res = await getRepo().decideProposal(input.id, input.decision, note || "사이트 버튼 승인");
  if (res.ok) { revalidatePath("/"); revalidatePath("/log"); }
  return res;
}

/** FN-1 생활비 분리 확인/취소. 확인은 두 문장을 모두 체크해야 보낸다(화면). */
export async function confirmLivingFundAction(input: { confirm: boolean }) {
  const res = await getRepo().confirmLivingFund(input.confirm);
  if (res.ok) { revalidatePath("/"); revalidatePath("/log"); }
  return res;
}

/**
 * 메일 속 숫자 코드로 로그인. 아이폰 홈 화면 앱은 사파리와 쿠키를 따로 써서
 * 메일 링크(사파리에서 열림)로는 앱 안이 로그인되지 않는다 → 앱 안에서 코드를 직접 넣는다.
 * Supabase 이메일 템플릿(Magic Link)에 {{ .Token }} 이 들어 있어야 메일에 숫자가 보인다.
 */
export async function verifyOtpAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").replace(/\D/g, "");
  const next = String(formData.get("next") ?? "/");
  const email = (process.env.AUTH_ALLOWED_EMAIL ?? "").trim().toLowerCase();
  if (authMode() !== "magic" || !email) redirect("/login");
  if (token.length < 6) redirect(`/login?sent=1&err=code&next=${encodeURIComponent(next)}`);
  const supabase = await authClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !isAllowed(data.user?.email)) redirect(`/login?sent=1&err=code&next=${encodeURIComponent(next)}`);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
