"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/repo";
import { ALLOWED_MOVES } from "@/lib/constants";
import type { Stage } from "@/lib/types";
import { AUTH_COOKIE, gateEnabled, gateToken } from "@/lib/auth";

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
