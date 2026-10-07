"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureBootstrap, getRepo } from "@/lib/repo";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session";
import { currentUser, isAdmin, requireUser } from "@/lib/current-user";
import { CREATE_CHALLENGE_LEVEL, DEFAULT_PRIZE, levelFromXp, validateConfig } from "@/lib/game";
import { addDays, kstDate, kstWeekday } from "@/lib/time";
import type { ChallengeConfig, ParticipationGoal, SlotDef } from "@/lib/types";

export type ActionResult = { ok: boolean; error?: string; message?: string };

const USERNAME_RE = /^[\p{L}\p{N}_.-]{2,16}$/u;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function setSessionCookie(uid: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(uid), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

function safeNext(n: string): string {
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

/* ───────── 로그인 · 가입 ───────── */

export async function login(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await ensureBootstrap();
  const username = str(fd, "username");
  const password = str(fd, "password");
  if (!username || !password) return { ok: false, error: "아이디와 비밀번호를 입력해 주세요" };
  const repo = getRepo();
  const user = await repo.getUserByUsername(username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { ok: false, error: "아이디 또는 비밀번호가 맞지 않아요" };
  }
  await repo.updateUser(user.id, { last_login_at: new Date().toISOString() });
  await setSessionCookie(user.id);
  const parts = await repo.listParticipationsByUser(user.id);
  const next = str(fd, "next");
  redirect(parts.some((p) => p.status === "active") ? safeNext(next || "/") : "/onboarding");
}

export async function signup(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await ensureBootstrap();
  const username = str(fd, "username");
  const password = str(fd, "password");
  const password2 = str(fd, "password2");
  const invite = str(fd, "invite");
  if (!USERNAME_RE.test(username)) return { ok: false, error: "아이디는 2~16자, 한글·영문·숫자·_ . - 만" };
  if (password.length < 4) return { ok: false, error: "비밀번호는 4자 이상" };
  if (password !== password2) return { ok: false, error: "비밀번호 확인이 달라요" };
  const required = (process.env.INVITE_CODE ?? "").trim();
  if (required && invite !== required) return { ok: false, error: "초대 코드가 맞지 않아요 (톡방에서 확인)" };
  const repo = getRepo();
  if (await repo.getUserByUsername(username)) return { ok: false, error: "이미 있는 아이디예요" };
  const user = await repo.createUser({ username, display_name: username, password_hash: await hashPassword(password), role: "member" });
  await repo.updateUser(user.id, { last_login_at: new Date().toISOString() });
  await setSessionCookie(user.id);
  redirect("/onboarding");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const current = str(fd, "current");
  const next = str(fd, "next");
  if (!(await verifyPassword(current, user.password_hash))) return { ok: false, error: "현재 비밀번호가 맞지 않아요" };
  if (next.length < 4) return { ok: false, error: "새 비밀번호는 4자 이상" };
  await getRepo().updateUser(user.id, { password_hash: await hashPassword(next) });
  return { ok: true, message: "비밀번호를 바꿨어요" };
}

export async function updateDisplayName(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = str(fd, "display_name");
  if (name.length < 1 || name.length > 12) return { ok: false, error: "닉네임은 1~12자" };
  await getRepo().updateUser(user.id, { display_name: name });
  revalidatePath("/", "layout");
  return { ok: true, message: "닉네임을 바꿨어요" };
}

/* ───────── 참여 ───────── */

function parseGoal(fd: FormData, cfg: ChallengeConfig): { goal: ParticipationGoal; error?: string } {
  const goal: ParticipationGoal = {};
  if (cfg.goal === "weight") {
    const start = parseFloat(str(fd, "start_kg"));
    const target = parseFloat(str(fd, "target_kg"));
    const days = parseInt(str(fd, "days"), 10);
    if (!Number.isFinite(start) || start <= 0) return { goal, error: "현재 체중을 적어 주세요" };
    if (!Number.isFinite(target) || target <= 0) return { goal, error: "목표 감량(kg)을 적어 주세요" };
    if (!Number.isInteger(days) || days < 1 || days > 365) return { goal, error: "기간은 1~365일" };
    goal.start_kg = start;
    goal.target_kg = target;
    goal.days = days;
  }
  if (cfg.goal === "hobby") {
    const hobby = str(fd, "hobby");
    if (hobby.length < 1 || hobby.length > 30) return { goal, error: "취미를 1~30자로 적어 주세요" };
    goal.hobby = hobby;
  }
  return { goal };
}

export async function joinChallenge(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const repo = getRepo();
  const challengeId = str(fd, "challenge_id");
  const ch = await repo.getChallenge(challengeId);
  if (!ch || !ch.is_active) return { ok: false, error: "없는 챌린지예요" };
  const { goal, error } = parseGoal(fd, ch.config);
  if (error) return { ok: false, error };
  const existing = await repo.getParticipation(user.id, ch.id);
  if (existing?.status === "active") return { ok: false, error: "이미 참여 중이에요" };
  if (existing) {
    await repo.updateParticipation(existing.id, { status: "active", joined_at: new Date().toISOString(), goal, start_date: null });
  } else {
    await repo.createParticipation({ user_id: user.id, challenge_id: ch.id, joined_at: new Date().toISOString(), status: "active", goal });
  }
  revalidatePath("/", "layout");
  const next = str(fd, "next");
  if (next) redirect(safeNext(next));
  return { ok: true, message: `${ch.title}에 참여했어요` };
}

export async function leaveChallenge(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const repo = getRepo();
  const p = await repo.getParticipation(user.id, str(fd, "challenge_id"));
  if (!p || p.status !== "active") return { ok: false, error: "참여 중이 아니에요" };
  await repo.updateParticipation(p.id, { status: "left" });
  revalidatePath("/", "layout");
  redirect("/challenges");
}

export async function updateGoal(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const repo = getRepo();
  const ch = await repo.getChallenge(str(fd, "challenge_id"));
  if (!ch) return { ok: false, error: "없는 챌린지예요" };
  const p = await repo.getParticipation(user.id, ch.id);
  if (!p || p.status !== "active") return { ok: false, error: "참여 중이 아니에요" };
  const { goal, error } = parseGoal(fd, ch.config);
  if (error) return { ok: false, error };
  await repo.updateParticipation(p.id, { goal: { ...p.goal, ...goal } });
  revalidatePath("/", "layout");
  return { ok: true, message: "목표를 바꿨어요" };
}

/* ───────── 챌린지 개설 · 수정 ───────── */

function parseConfig(fd: FormData): { config: ChallengeConfig | null; error?: string } {
  const kind = str(fd, "kind");
  const goal = str(fd, "goal");
  let config: ChallengeConfig;
  if (kind === "slots") {
    const slots: SlotDef[] = [];
    for (let i = 0; i < 6; i++) {
      const label = str(fd, `slot_label_${i}`);
      const start = str(fd, `slot_start_${i}`);
      const end = str(fd, `slot_end_${i}`);
      if (!label && !start && !end) continue;
      const key = str(fd, `slot_key_${i}`) || `s${i}`;
      slots.push({ key, label, start, end });
    }
    config = { kind: "slots", slots, goal: goal === "weight" ? "weight" : "none" };
  } else if (kind === "count") {
    config = {
      kind: "count",
      times: parseInt(str(fd, "times"), 10),
      period_days: parseInt(str(fd, "period_days"), 10),
      goal: goal === "hobby" ? "hobby" : "none",
    };
  } else {
    return { config: null, error: "종류를 골라 주세요" };
  }
  const err = validateConfig(config);
  return err ? { config: null, error: err } : { config };
}

export async function createChallenge(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!isAdmin(user) && levelFromXp(user.xp) < CREATE_CHALLENGE_LEVEL) {
    return { ok: false, error: `챌린지 개설은 레벨 ${CREATE_CHALLENGE_LEVEL}부터 열려요` };
  }
  const title = str(fd, "title");
  const description = str(fd, "description");
  const emoji = str(fd, "emoji") || "🏆";
  const prize = str(fd, "prize") || DEFAULT_PRIZE;
  if (title.length < 2 || title.length > 30) return { ok: false, error: "이름은 2~30자" };
  if (description.length > 200) return { ok: false, error: "설명은 200자까지" };
  if ([...emoji].length > 2) return { ok: false, error: "이모지는 1개" };
  const { config, error } = parseConfig(fd);
  if (!config) return { ok: false, error };
  const ch = await getRepo().createChallenge({
    type: "custom",
    title,
    description,
    emoji,
    prize,
    config,
    created_by: user.id,
    is_default: false,
    is_active: true,
  });
  revalidatePath("/challenges");
  redirect(`/challenges/${ch.id}`);
}

export async function updateChallenge(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const repo = getRepo();
  const ch = await repo.getChallenge(str(fd, "challenge_id"));
  if (!ch) return { ok: false, error: "없는 챌린지예요" };
  if (!isAdmin(user) && ch.created_by !== user.id) return { ok: false, error: "이 챌린지를 고칠 권한이 없어요" };
  const title = str(fd, "title");
  const description = str(fd, "description");
  const emoji = str(fd, "emoji") || ch.emoji;
  const prize = str(fd, "prize");
  if (title.length < 2 || title.length > 30) return { ok: false, error: "이름은 2~30자" };
  if (description.length > 200) return { ok: false, error: "설명은 200자까지" };
  if (prize.length < 1 || prize.length > 60) return { ok: false, error: "상품은 1~60자" };
  const patch: Partial<typeof ch> = { title, description, emoji, prize, is_active: fd.get("is_active") !== null };
  if (str(fd, "kind")) {
    const { config, error } = parseConfig(fd);
    if (!config) return { ok: false, error };
    patch.config = config;
  }
  await repo.updateChallenge(ch.id, patch);
  revalidatePath("/", "layout");
  return { ok: true, message: "저장했어요" };
}

/* ───────── 관리자 ───────── */

export async function adminUpdateUser(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const target = await repo.getUserById(str(fd, "user_id"));
  if (!target) return { ok: false, error: "없는 사용자" };
  const op = str(fd, "op");
  if (op === "reset_password") {
    const pw = str(fd, "password");
    if (pw.length < 4) return { ok: false, error: "비밀번호는 4자 이상" };
    await repo.updateUser(target.id, { password_hash: await hashPassword(pw) });
    return { ok: true, message: `${target.display_name} 비밀번호를 바꿨어요` };
  }
  if (op === "xp") {
    const delta = parseInt(str(fd, "delta"), 10);
    if (!Number.isInteger(delta) || delta === 0) return { ok: false, error: "경험치 증감을 숫자로" };
    await repo.addXp(target.id, delta, `관리자 조정 (${me!.display_name})`);
    revalidatePath("/admin");
    return { ok: true, message: `${target.display_name} 경험치 ${delta > 0 ? "+" : ""}${delta}` };
  }
  if (op === "role") {
    if (target.username === "비움") return { ok: false, error: "총관리자 권한은 못 바꿔요" };
    const role = str(fd, "role") === "admin" ? "admin" : "member";
    await repo.updateUser(target.id, { role });
    revalidatePath("/admin");
    return { ok: true, message: `${target.display_name} → ${role === "admin" ? "관리자" : "멤버"}` };
  }
  return { ok: false, error: "모르는 작업" };
}

/** 관리자: 대기 중인 참가자를 오늘부터 바로 시작시킨다 */
export async function adminStartNow(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const target = await repo.getUserById(str(fd, "user_id"));
  const ch = await repo.getChallenge(str(fd, "challenge_id"));
  if (!target || !ch) return { ok: false, error: "없는 참가자" };
  const p = await repo.getParticipation(target.id, ch.id);
  if (!p || p.status !== "active") return { ok: false, error: "참여 중이 아니에요" };
  const today = kstDate();
  const monday = addDays(today, -((kstWeekday(today) + 6) % 7));
  await repo.updateParticipation(p.id, { start_date: ch.config.kind === "count" ? monday : today });
  revalidatePath("/", "layout");
  return { ok: true, message: `${target.display_name} 바로 시작` };
}

export async function deleteCheckin(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const id = str(fd, "checkin_id");
  const c = await repo.getCheckin(id);
  if (!c) return { ok: false, error: "없는 인증" };
  if (!isAdmin(me) && c.user_id !== me.id) return { ok: false, error: "권한이 없어요" };
  await repo.deleteCheckin(c.id);
  await repo.deletePhoto(c.photo_path);
  if (c.xp > 0) await repo.addXp(c.user_id, -c.xp, "인증 삭제 회수");
  revalidatePath("/", "layout");
  return { ok: true, message: "인증을 지웠어요" };
}
