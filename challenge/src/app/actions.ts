"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ensureBootstrap, getRepo } from "@/lib/repo";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session";
import { currentUser, isAdmin, requireUser } from "@/lib/current-user";
import { CREATE_CHALLENGE_LEVEL, DEFAULT_PENALTY, failedUnits, levelFromXp, MONTH_BONUS_XP, validateConfig, type FailedUnit } from "@/lib/game";
import { inferMethods, normalizeMethods } from "@/lib/methods";
import { addDays, hmToMinutes, kstDate, kstMinutes, kstWeekday } from "@/lib/time";
import type { Challenge, ChallengeConfig, Participation, ParticipationGoal, SlotDef } from "@/lib/types";

export type ActionResult = { ok: boolean; error?: string; message?: string; cheered?: boolean; count?: number; comment?: CommentView };

/** 화면용 댓글 (작성자 이름 포함) */
export type CommentView = { id: string; checkin_id: string; user_id: string; body: string; created_at: string; name: string };

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
    const height = parseFloat(str(fd, "height_cm"));
    const age = parseInt(str(fd, "age"), 10);
    if (str(fd, "height_cm") && (!Number.isFinite(height) || height < 100 || height > 250)) return { goal, error: "키는 100~250cm" };
    if (str(fd, "age") && (!Number.isInteger(age) || age < 10 || age > 100)) return { goal, error: "나이는 10~100" };
    if (Number.isFinite(height) && height >= 100) goal.height_cm = Math.round(height);
    if (Number.isInteger(age) && age >= 10) goal.age = age;
    const extra = parseFloat(str(fd, "extra_meals"));
    if ([0, 0.5, 1].includes(extra)) goal.extra_meals = extra;
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

function parseKcalLimit(fd: FormData): number {
  const n = parseInt(str(fd, "kcal_limit") || "700", 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(5000, n)) : 700;
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
    comments_enabled: fd.get("comments_enabled") !== null,
    kcal_limit: parseKcalLimit(fd),
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
  const patch: Partial<typeof ch> = { title, description, emoji, penalty, max_fails: maxFails, is_active: fd.get("is_active") !== null, comments_enabled: fd.get("comments_enabled") !== null };
  if (fd.has("kcal_limit")) patch.kcal_limit = parseKcalLimit(fd);
  if (str(fd, "kind")) {
    const { config, error } = parseConfig(fd);
    if (!config) return { ok: false, error };
    patch.config = config;
  }
  try {
    await repo.updateChallenge(ch.id, patch);
  } catch (e) {
    // 마이그레이션 09·10 전이면 새 컬럼이 없어 실패 → 그것만 빼고 다시 저장
    delete patch.comments_enabled;
    delete patch.kcal_limit;
    await repo.updateChallenge(ch.id, patch);
    revalidatePath("/", "layout");
    return { ok: true, message: `저장했어요 (댓글·AI 칼로리 설정은 마이그레이션 09·10 뒤에 적용돼요: ${(e as Error).message.slice(0, 60)})` };
  }
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
/** 실패 목록이 before → after 로 줄었을 때, 사라진 실패에 깎였던 경험치를 실제 차감량만큼 돌려주고 차감 키를 지운다 */
async function refundCancelledFails(ch: Challenge, p: Participation, before: FailedUnit[], after: FailedUnit[], why: string): Promise<number> {
  const repo = getRepo();
  const keep = new Set(after.map((u) => u.key));
  let refunded = 0;
  for (const u of before) {
    if (keep.has(u.key)) continue;
    const key = `xpfail:${p.id}:${u.key}`;
    if (!(await repo.hasNotice(key))) continue;
    const logged = await repo.findXpLog(p.user_id, `${ch.title} 실패 (${u.date})`).catch(() => null);
    const give = logged !== null ? Math.max(0, -logged) : -u.xp;
    if (give > 0) await repo.addXp(p.user_id, give, `${ch.title} ${why}`);
    await repo.deleteNotice(key);
    refunded += give;
  }
  return refunded;
}

/** 관리자: 특정 날짜·시간대를 인증 완료로 수동 처리 (앱 오류·네트워크 문제로 못 올린 경우). 사진 없이 기록되고, 깎였던 실패·경험치는 복구 */
export async function adminExcuseSlot(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const target = await repo.getUserById(str(fd, "user_id"));
  const ch = await repo.getChallenge(str(fd, "challenge_id"));
  if (!target || !ch) return { ok: false, error: "없는 참가자" };
  const p = await repo.getParticipation(target.id, ch.id);
  if (!p || p.status !== "active") return { ok: false, error: "참여 중이 아니에요" };
  const date = str(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > kstDate()) return { ok: false, error: "날짜는 오늘까지" };
  const slotKey = ch.config.kind === "slots" ? str(fd, "slot") : "count";
  if (ch.config.kind === "slots" && !ch.config.slots.some((s) => s.key === slotKey)) return { ok: false, error: "시간대를 골라 주세요" };
  const reason = str(fd, "reason").slice(0, 100) || "관리자 수동 처리";
  const now = new Date();
  const mine = await repo.listCheckins({ participationId: p.id });
  if (mine.some((c) => c.local_date === date && c.slot === slotKey)) return { ok: false, error: "이미 그 날짜·시간대 인증이 있어요" };
  const before = failedUnits(ch.config, p, mine, now);
  const created = await repo.createCheckin({
    participation_id: p.id, user_id: target.id, challenge_id: ch.id, slot: slotKey, media_type: "album", photo_path: "", link_url: "",
    taken_at: new Date(`${date}T12:00:00+09:00`).toISOString(), local_date: date, note: `관리자 처리: ${reason}`, xp: 0,
  });
  const refunded = await refundCancelledFails(ch, p, before, failedUnits(ch.config, p, [...mine, created], now), "관리자 수동 처리 (실패 취소)");
  const label = ch.config.kind === "slots" ? ch.config.slots.find((s) => s.key === slotKey)?.label ?? slotKey : "인증";
  const { sendPushToUsers } = await import("@/lib/push");
  await sendPushToUsers([target.id], { title: "인증이 수동으로 처리됐어요", body: `${date} ${label} · ${reason}${refunded > 0 ? ` · 경험치 +${refunded} 복구` : ""}`, url: "/", tag: `excuse-${created.id}` }).catch(() => null);
  revalidatePath("/", "layout");
  return { ok: true, message: `${target.display_name} ${date} ${label} 완료 처리${refunded > 0 ? ` · 실패 취소, 경험치 +${refunded}` : ""}` };
}

export async function adminStartNow(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const target = await repo.getUserById(str(fd, "user_id"));
  const ch = await repo.getChallenge(str(fd, "challenge_id"));
  if (!target || !ch) return { ok: false, error: "없는 참가자" };
  const p = await repo.getParticipation(target.id, ch.id);
  if (!p || p.status !== "active") return { ok: false, error: "참여 중이 아니에요" };
  const now = new Date();
  const today = kstDate(now);
  const nowMin = kstMinutes(now);
  const mine = await repo.listCheckins({ participationId: p.id });
  const before = failedUnits(ch.config, p, mine, now);

  // '지금부터 시작': 이미 끝난 시간대는 세지 않는다. 오늘 남은 시간대가 없으면 내일부터
  let patch: { start_date: string; start_time: string | null };
  let when: string;
  if (ch.config.kind === "count") {
    patch = { start_date: addDays(today, -((kstWeekday(today) + 6) % 7)), start_time: null };
    when = "이번 주부터";
  } else {
    const sorted = [...ch.config.slots].sort((a, b) => hmToMinutes(a.start) - hmToMinutes(b.start));
    const remaining = sorted.filter((x) => hmToMinutes(x.end) > nowMin);
    if (remaining.length === sorted.length) { patch = { start_date: today, start_time: null }; when = `오늘 ${sorted[0].label}부터`; }
    else if (remaining.length > 0) { patch = { start_date: today, start_time: `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}` }; when = `오늘 ${remaining[0].label}부터`; }
    else { patch = { start_date: addDays(today, 1), start_time: null }; when = `내일 ${sorted[0].label}부터`; }
  }
  try {
    await repo.updateParticipation(p.id, patch);
  } catch {
    // 마이그레이션 11 전(start_time 컬럼 없음): 남은 시간대가 있어도 내일부터로
    patch = { start_date: patch.start_time ? addDays(today, 1) : patch.start_date, start_time: null };
    await repo.updateParticipation(p.id, { start_date: patch.start_date });
    when = ch.config.kind === "slots" ? `${patch.start_date === today ? "오늘" : "내일"} ${ch.config.slots[0].label}부터` : when;
  }
  // 이미 깎인 실패(오늘 지난 시간대 등)는 되돌린다
  const refunded = await refundCancelledFails(ch, p, before, failedUnits(ch.config, { ...p, ...patch }, mine, now), "시작 조정 (실패 취소)");
  revalidatePath("/", "layout");
  return { ok: true, message: `${target.display_name} ${when} 시작${refunded > 0 ? ` · 실패 취소, 경험치 +${refunded}` : ""}` };
}

/** 관리자 테스트 참여: 숨김·24시간 업로드·집계 없음. mode=join(한 챌린지) / all(전부) / official(정식 참여로 전환) */
export async function adminTestJoin(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!me || !isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const mode = str(fd, "mode") || "join";
  const targets = mode === "all" ? await repo.listChallenges() : [await repo.getChallenge(str(fd, "challenge_id"))].filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (targets.length === 0) return { ok: false, error: "없는 챌린지" };
  const today = kstDate();
  let n = 0;
  try {
    for (const ch of targets) {
      const existing = await repo.getParticipation(me.id, ch.id);
      if (mode === "official") {
        if (!existing) continue;
        // 테스트로 올린 인증은 정식 기록이 아니므로 지우고 전환
        for (const c of (await repo.listCheckins({ participationId: existing.id, includeRejected: true })).filter((c) => c.is_test)) {
          await repo.deleteCheckin(c.id);
          if (c.photo_path) await repo.deletePhoto(c.photo_path).catch(() => null);
        }
        await repo.updateParticipation(existing.id, { is_test: false, start_date: existing.start_date ?? today });
        continue;
      }
      const goal = ch.config.goal === "weight" ? { start_kg: 70, target_kg: 3, days: 30 } : ch.config.goal === "hobby" ? { hobby: "테스트" } : {};
      if (existing) await repo.updateParticipation(existing.id, { status: "active", is_test: true, start_date: today, start_time: null, ...(existing.status === "active" ? {} : { goal, joined_at: new Date().toISOString() }) });
      else await repo.createParticipation({ user_id: me.id, challenge_id: ch.id, joined_at: new Date().toISOString(), status: "active", goal, start_date: today, is_test: true });
      n++;
    }
  } catch (e) {
    return { ok: false, error: `실패 (마이그레이션 11 필요?): ${(e as Error).message.slice(0, 80)}` };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: mode === "official" ? "정식 참여로 바꿨어요" : `${n}개 챌린지에 테스트 참여 중 (홈에서 24시간 업로드)` };
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

/** 인증 사진에 댓글 달기 (챌린지에서 댓글이 켜져 있을 때, 같은 챌린지 참여자·관리자) */
export async function addComment(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const c = await repo.getCheckin(str(fd, "checkin_id"));
  if (!c) return { ok: false, error: "없는 인증" };
  const ch = await repo.getChallenge(c.challenge_id);
  if (!ch || ch.comments_enabled === false) return { ok: false, error: "이 챌린지는 댓글이 꺼져 있어요" };
  if (!isAdmin(me)) {
    const mine = await repo.getParticipation(me.id, c.challenge_id);
    if (!mine || mine.status !== "active") return { ok: false, error: "같은 챌린지 참여자만 댓글을 쓸 수 있어요" };
  }
  const body = str(fd, "body").replace(/\s+/g, " ").trim();
  if (body.length < 1) return { ok: false, error: "내용을 적어 주세요" };
  if (body.length > 200) return { ok: false, error: "댓글은 200자까지" };
  let saved;
  try {
    saved = await repo.addComment({ checkin_id: c.id, user_id: me.id, body });
  } catch (e) {
    return { ok: false, error: `댓글 저장 실패 (마이그레이션 09 필요?): ${(e as Error).message.slice(0, 80)}` };
  }
  if (c.user_id !== me.id) {
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers([c.user_id], { title: `💬 ${me.display_name}님이 댓글을 남겼어요`, body: body.slice(0, 80), url: `/gallery?c=${c.challenge_id}&d=${c.local_date}`, tag: `comment-${c.id}` }).catch(() => null);
  }
  revalidatePath("/gallery");
  return { ok: true, comment: { ...saved, name: me.display_name } };
}

/** 댓글 삭제: 본인 또는 관리자 */
export async function deleteComment(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const repo = getRepo();
  const c = await repo.getComment(str(fd, "comment_id"));
  if (!c) return { ok: true };
  if (c.user_id !== me.id && !isAdmin(me)) return { ok: false, error: "내 댓글만 지울 수 있어요" };
  await repo.deleteComment(c.id);
  revalidatePath("/gallery");
  return { ok: true };
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

/** 관리자: 크론이 보내는 것과 똑같은 시간대 알림을 내 폰으로 (누르면 바로 촬영) */
export async function adminSendSlotPush(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!me || !isAdmin(me)) return { ok: false, error: "관리자만" };
  try {
    const { configurePush, sendPushToUsers } = await import("@/lib/push");
    const problem = configurePush();
    if (problem) return { ok: false, error: problem };
    const ch = await getRepo().getChallenge(str(fd, "challenge_id"));
    if (!ch || ch.config.kind !== "slots") return { ok: false, error: "시간대형 챌린지가 아니에요" };
    const slot = ch.config.slots.find((s) => s.key === str(fd, "slot")) ?? ch.config.slots[0];
    const kind = str(fd, "kind") === "ending" ? "ending" : "start";
    const payload = kind === "ending"
      ? { title: `⏰ ${slot.label} 인증 30분 남았어요`, body: `${slot.end}에 마감! 아직 ${slot.label} 사진을 안 올렸어요. (테스트)`, url: `/?go=${ch.id}&slot=${slot.key}`, tag: `${ch.id}-${slot.key}` }
      : { title: `${ch.emoji} ${slot.label} 인증 시간!`, body: `${slot.end}까지 ${slot.label} 사진을 올려 주세요. (테스트)`, url: `/?go=${ch.id}&slot=${slot.key}`, tag: `${ch.id}-${slot.key}` };
    const r = await sendPushToUsers([me.id], payload);
    if (r.total === 0) return { ok: false, error: "내 폰에 알림이 안 켜져 있어요 (홈 화면 아이콘으로 열고 → 내 정보 → 알림 켜기)" };
    if (r.sent === 0) return { ok: false, error: r.reason ?? "전송 실패" };
    return { ok: true, message: `내 기기 ${r.sent}/${r.total}대에 보냈어요. 알림을 누르면(안드로이드는 📷 버튼) 카메라가 바로 열려야 해요` };
  } catch (e) {
    return { ok: false, error: `알림 오류: ${(e as Error).message}` };
  }
}

/** 관리자: 멤버의 알림 구독을 전부 지운다 (예전 주소 구독이 남아 두 번 올 때). 멤버는 앱에서 알림을 다시 켜야 한다 */
export async function adminResetPush(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await currentUser();
  if (!isAdmin(me)) return { ok: false, error: "관리자만" };
  const repo = getRepo();
  const target = await repo.getUserById(str(fd, "user_id"));
  if (!target) return { ok: false, error: "없는 사용자" };
  const subs = await repo.listPushSubscriptions([target.id]);
  for (const s of subs) await repo.deletePushSubscription(s.endpoint);
  revalidatePath("/admin");
  return { ok: true, message: `${target.display_name}님 알림 구독 ${subs.length}건 삭제. 앱(홈 화면 아이콘)에서 내 정보 → 알림 켜기를 다시 해야 해요` };
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
