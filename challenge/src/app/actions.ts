"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureBootstrap, getRepo } from "@/lib/repo";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session";
import { currentUser, isAdmin, requireUser } from "@/lib/current-user";
import { CREATE_CHALLENGE_LEVEL, DEFAULT_PENALTY, levelFromXp, MONTH_BONUS_XP, validateConfig } from "@/lib/game";
import { inferMethods, normalizeMethods } from "@/lib/methods";
import { addDays, kstDate, kstWeekday } from "@/lib/time";
import type { ChallengeConfig, ParticipationGoal, SlotDef } from "@/lib/types";

export type ActionResult = { ok: boolean; error?: string; message?: string; cheered?: boolean; count?: number };

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
  const gender = str(fd, "gender") === "f" ? "f" : str(fd, "gender") === "m" ? "m" : null;
  if (!gender) return { ok: false, error: "캐릭터 성별을 골라 주세요" };
  const user = await repo.createUser({ username, display_name: username, password_hash: await hashPassword(password), role: "member", gender });
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

export async function updateGender(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const gender = str(fd, "gender") === "f" ? "f" : "m";
  await getRepo().updateUser(user.id, { gender });
  revalidatePath("/", "layout");
  return { ok: true, message: "캐릭터를 바꿨어요" };
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
    const chosen = normalizeMethods(fd.getAll("methods").map(String));
    goal.methods = chosen.length ? chosen : inferMethods(hobby);
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

/** 오늘 체중 기록 (본인만). 같은 날 다시 넣으면 덮어쓴다 */
export async function logWeight(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const repo = getRepo();
  const p = await repo.getParticipation(user.id, str(fd, "challenge_id"));
  if (!p || p.status !== "active") return { ok: false, error: "참여 중이 아니에요" };
  const kg = Math.round(parseFloat(str(fd, "kg")) * 10) / 10;
  if (!Number.isFinite(kg) || kg < 20 || kg > 300) return { ok: false, error: "체중을 숫자로 적어 주세요" };
  await repo.upsertWeightLog({ participation_id: p.id, user_id: user.id, local_date: kstDate(), kg });
  revalidatePath("/");
  return { ok: true, message: "오늘 체중을 기록했어요" };
}

/** 탈락 후 다시 도전: 다음 월요일부터 새로 집계 (지난 실패는 리셋) */
export async function rechallenge(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const repo = getRepo();
  const p = await repo.getParticipation(user.id, str(fd, "challenge_id"));
  if (!p || p.status !== "active") return { ok: false, error: "참여 중이 아니에요" };
  const gifts = await repo.listGiftsSentSince(user.id, p.challenge_id, p.joined_at);
  if (gifts.length === 0) return { ok: false, error: "먼저 벌칙 기프티콘을 올려 주세요" };
  await repo.updateParticipation(p.id, { joined_at: new Date().toISOString(), start_date: null });
  revalidatePath("/", "layout");
  return { ok: true, message: "다음 월요일부터 다시 시작해요" };
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
  const penalty = str(fd, "penalty") || DEFAULT_PENALTY;
  const maxFails = parseInt(str(fd, "max_fails") || "3", 10);
  if (title.length < 2 || title.length > 30) return { ok: false, error: "이름은 2~30자" };
  if (description.length > 200) return { ok: false, error: "설명은 200자까지" };
  if ([...emoji].length > 2) return { ok: false, error: "이모지는 1개" };
  if (!Number.isInteger(maxFails) || maxFails < 0 || maxFails > 30) return { ok: false, error: "탈락 기준은 0~30" };
  const { config, error } = parseConfig(fd);
  if (!config) return { ok: false, error };
  const ch = await getRepo().createChallenge({
    type: "custom",
    title,
    description,
    emoji,
    penalty,
    max_fails: maxFails,
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
  const penalty = str(fd, "penalty");
  const maxFails = parseInt(str(fd, "max_fails") || "0", 10);
  if (title.length < 2 || title.length > 30) return { ok: false, error: "이름은 2~30자" };
  if (description.length > 200) return { ok: false, error: "설명은 200자까지" };
  if (penalty.length < 1 || penalty.length > 80) return { ok: false, error: "벌칙은 1~80자" };
  if (!Number.isInteger(maxFails) || maxFails < 0 || maxFails > 30) return { ok: false, error: "탈락 기준은 0~30" };
  const patch: Partial<typeof ch> = { title, description, emoji, penalty, max_fails: maxFails, is_active: fd.get("is_active") !== null };
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

/** 월 마감 팝업 확인. 살아남은 달이면 완주 보너스 경험치 1회 */
export async function ackMonthly(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const pid = str(fd, "participation_id");
  const month = str(fd, "month");
  const survived = str(fd, "survived") === "1";
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "잘못된 달" };
  const parts = await repo.listParticipationsByUser(me.id);
  if (!parts.some((p) => p.id === pid)) return { ok: false, error: "내 참여가 아니에요" };
  if (await repo.claimNotice(`monthly:${pid}:${month}`)) {
    if (survived) await repo.addXp(me.id, MONTH_BONUS_XP, `${month} 한 달 완주 보너스`);
  }
  revalidatePath("/");
  return { ok: true };
}

/** 관리자: 문의 해결 완료 → 목록에서 사라짐 */
export async function resolveTicket(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const t = await repo.getTicket(str(fd, "ticket_id"));
  if (!t) return { ok: false, error: "없는 문의" };
  await repo.updateTicket(t.id, { status: "resolved", resolved_at: new Date().toISOString() });
  const { sendPushToUsers } = await import("@/lib/push");
  await sendPushToUsers([t.user_id], { title: "문의가 해결됐어요 ✅", body: "개발자가 해결 완료로 표시했어요. 또 문제가 있으면 언제든 보내 주세요.", url: "/support", tag: "support" });
  revalidatePath("/admin/support");
  redirect("/admin/support");
}

/** 인증 신고: 같은 챌린지 멤버 누구나. 관리자에게 알림 */
export async function reportCheckin(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const c = await repo.getCheckin(str(fd, "checkin_id"));
  if (!c) return { ok: false, error: "없는 인증" };
  if (c.user_id === me.id) return { ok: false, error: "내 인증은 신고할 수 없어요" };
  if (c.rejected_at) return { ok: false, error: "이미 불인정된 인증이에요" };
  if (!isAdmin(me)) {
    const mine = await repo.getParticipation(me.id, c.challenge_id);
    if (!mine || mine.status !== "active") return { ok: false, error: "같은 챌린지 참여자만 신고할 수 있어요" };
  }
  const reason = str(fd, "reason").slice(0, 80);
  const detail = str(fd, "detail").slice(0, 200);
  if (!reason) return { ok: false, error: "사유를 골라 주세요" };
  await repo.createReport({ checkin_id: c.id, reporter_id: me.id, reason: detail ? `${reason} — ${detail}` : reason });
  const admins = (await repo.listUsers()).filter((u) => u.role === "admin" && u.id !== me.id).map((u) => u.id);
  const { sendPushToUsers } = await import("@/lib/push");
  await sendPushToUsers(admins, { title: "🚩 인증 신고가 들어왔어요", body: `${me.display_name}: ${reason}`, url: "/admin/reports", tag: `report-${c.id}` }).catch(() => null);
  revalidatePath("/gallery");
  return { ok: true, message: "신고했어요. 관리자가 확인해요" };
}

/** 관리자 판정. accept = 불인정(인증 실패 처리, 경험치 회수) / dismiss = 인정(신고 기각) */
export async function judgeReport(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const c = await repo.getCheckin(str(fd, "checkin_id"));
  if (!c) return { ok: false, error: "없는 인증" };
  const verdict = str(fd, "verdict") === "accept" ? "accepted" : "dismissed";
  const note = str(fd, "note").slice(0, 120);
  const reports = await repo.listReportsFor([c.id]);
  const reporters = [...new Set(reports.filter((r) => r.status === "open").map((r) => r.reporter_id))];
  const { sendPushToUsers } = await import("@/lib/push");
  if (verdict === "accepted") {
    if (!c.rejected_at) {
      await repo.updateCheckin(c.id, { rejected_at: new Date().toISOString(), rejected_reason: note || "관리자 불인정", xp: 0 });
      if (c.xp > 0) await repo.addXp(c.user_id, -c.xp, "인증 불인정 회수");
    }
    await repo.resolveReports(c.id, "accepted");
    await sendPushToUsers([c.user_id], { title: "인증이 불인정됐어요", body: `${note || "관리자 판정"} · 그 시간대는 실패로 처리돼요. 이의가 있으면 개발자 문의로 보내 주세요.`, url: "/", tag: `judge-${c.id}` }).catch(() => null);
    await sendPushToUsers(reporters, { title: "신고가 받아들여졌어요", body: "해당 인증은 불인정 처리됐어요.", url: "/gallery", tag: `judge-${c.id}` }).catch(() => null);
  } else {
    await repo.resolveReports(c.id, "dismissed");
    await sendPushToUsers(reporters, { title: "신고를 확인했어요", body: "관리자가 보기엔 정상 인증이라 그대로 인정돼요.", url: "/gallery", tag: `judge-${c.id}` }).catch(() => null);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: verdict === "accepted" ? "불인정 처리했어요" : "인정(기각)했어요" };
}

/** 인증 응원 켜기/끄기. 같은 챌린지 참여자(또는 관리자)만, 내 인증은 불가. 처음 켤 때 주인에게 알림 1회 */
export async function toggleCheer(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const c = await repo.getCheckin(str(fd, "checkin_id"));
  if (!c) return { ok: false, error: "없는 인증" };
  if (c.user_id === me.id) return { ok: false, error: "내 인증은 응원할 수 없어요" };
  if (!isAdmin(me)) {
    const mine = await repo.getParticipation(me.id, c.challenge_id);
    if (!mine || mine.status !== "active") return { ok: false, error: "같은 챌린지 참여자만 응원할 수 있어요" };
  }
  const r = await repo.toggleCheer(c.id, me.id);
  if (r.cheered && (await repo.claimNotice(`cheer:${c.id}:${me.id}`))) {
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers([c.user_id], { title: `🔥 ${me.display_name}님이 응원했어요`, body: "오늘 인증에 응원이 도착했어요. 혼자가 아니에요!", url: `/gallery?c=${c.challenge_id}`, tag: `cheer-${c.id}` }).catch(() => null);
  }
  revalidatePath("/gallery");
  return { ok: true, cheered: r.cheered, count: r.count };
}

/** 선물함에서 열기 (읽음 처리) */
export async function openGift(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  await getRepo().markGiftOpened(str(fd, "gift_id"), me.id);
  return { ok: true };
}

/** 콕 찌르기: 같은 챌린지의 아직 인증 안 한 멤버에게 푸시. 하루 1번 */
export async function nudge(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const ch = await repo.getChallenge(str(fd, "challenge_id"));
  if (!ch) return { ok: false, error: "없는 챌린지" };
  const target = await repo.getUserById(str(fd, "user_id"));
  if (!target || target.id === me.id) return { ok: false, error: "대상이 없어요" };
  const [mine, theirs] = await Promise.all([repo.getParticipation(me.id, ch.id), repo.getParticipation(target.id, ch.id)]);
  if (!mine || mine.status !== "active" || !theirs || theirs.status !== "active") return { ok: false, error: "같은 챌린지 참여자끼리만" };
  const { loadBoard } = await import("@/lib/data");
  const row = (await loadBoard(ch)).find((r) => r.participant.user_id === target.id);
  if (!row || !row.pending) return { ok: false, error: `${target.display_name}님은 지금 찌를 게 없어요` };
  if (!(await repo.claimNotice(`nudge:${kstDate()}:${me.id}:${target.id}`))) return { ok: false, error: "오늘은 이미 찔렀어요 (하루 1번)" };
  let what = "인증";
  let slot = "";
  if (row.summary.kind === "slots") {
    const open = row.summary.today.slots.find((x) => x.state === "open") ?? row.summary.today.slots.find((x) => x.state === "upcoming");
    if (open) { what = `${open.slot.label} 인증`; slot = open.slot.key; }
  } else what = "이번 주 인증";
  const { sendPushToUsers } = await import("@/lib/push");
  const r = await sendPushToUsers([target.id], { title: `👉 ${me.display_name}님이 콕 찔렀어요`, body: `아직 ${what} 전이에요. 지금 올려요!`, url: `/?go=${ch.id}${slot ? `&slot=${slot}` : ""}`, tag: `nudge-${ch.id}` });
  return r.total === 0 ? { ok: true, message: `찔렀어요. (${target.display_name}님은 알림을 안 켜서 폰엔 안 가요)` } : { ok: true, message: `${target.display_name}님을 찔렀어요` };
}

/** 관리자: 특정 멤버에게 테스트 알림 */
export async function adminSendTestPush(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  try {
    const { configurePush, sendPushToUsers } = await import("@/lib/push");
    const problem = configurePush();
    if (problem) return { ok: false, error: problem };
    const repo = getRepo();
    const target = await repo.getUserById(str(fd, "user_id"));
    if (!target) return { ok: false, error: "없는 사용자" };
    const r = await sendPushToUsers([target.id], { title: "거너스 챌린지 테스트 알림", body: `${target.display_name}님, 알림이 잘 와요! 이제 인증 시간에 이렇게 알려 드릴게요.`, url: "/", tag: "test" });
    if (r.total === 0) return { ok: false, error: `${target.display_name}님이 아직 알림을 안 켰어요 (홈 화면 아이콘으로 열고 → 내 정보 → 알림 켜기)` };
    if (r.sent === 0) return { ok: false, error: r.reason ?? "전송 실패" };
    return { ok: true, message: `${target.display_name}님 기기 ${r.sent}/${r.total}대에 보냈어요${r.reason ? ` (일부 실패: ${r.reason})` : ""}` };
  } catch (e) {
    return { ok: false, error: `알림 오류: ${(e as Error).message}` };
  }
}

/** 관리자: 멤버 퇴출 (계정과 기록 전부 삭제) */
export async function adminDeleteUser(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const target = await repo.getUserById(str(fd, "user_id"));
  if (!target) return { ok: false, error: "없는 사용자" };
  if (target.id === me!.id) return { ok: false, error: "자기 자신은 퇴출할 수 없어요" };
  if (target.username === "비움") return { ok: false, error: "총관리자는 퇴출할 수 없어요" };
  await repo.deleteUser(target.id);
  revalidatePath("/", "layout");
  return { ok: true, message: `${target.display_name} 퇴출 완료` };
}

/** 개설자·관리자: 챌린지에서 참가자 내보내기 (계정은 남고 참여만 끝남) */
export async function kickParticipant(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const ch = await repo.getChallenge(str(fd, "challenge_id"));
  if (!ch) return { ok: false, error: "없는 챌린지" };
  if (!isAdmin(me) && ch.created_by !== me.id) return { ok: false, error: "개설자나 관리자만" };
  const target = await repo.getUserById(str(fd, "user_id"));
  if (!target) return { ok: false, error: "없는 사용자" };
  if (target.id === me.id) return { ok: false, error: "자기 자신은 내보낼 수 없어요" };
  const p = await repo.getParticipation(target.id, ch.id);
  if (!p || p.status !== "active") return { ok: false, error: "참여 중이 아니에요" };
  await repo.updateParticipation(p.id, { status: "left" });
  revalidatePath("/", "layout");
  return { ok: true, message: `${target.display_name} 내보냄` };
}

export async function deleteCheckin(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const id = str(fd, "checkin_id");
  const c = await repo.getCheckin(id);
  if (!c) return { ok: false, error: "없는 인증" };
  if (!isAdmin(me) && c.user_id !== me.id) return { ok: false, error: "권한이 없어요" };
  await repo.deleteCheckin(c.id);
  if (c.photo_path) await repo.deletePhoto(c.photo_path);
  if (c.xp > 0) await repo.addXp(c.user_id, -c.xp, "인증 삭제 회수");
  revalidatePath("/", "layout");
  return { ok: true, message: "인증을 지웠어요" };
}
