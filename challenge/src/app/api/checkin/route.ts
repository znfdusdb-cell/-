import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { dayStatusFor, effectiveStartDate, levelFromXp, rewardFor, summarize } from "@/lib/game";
import { normalizeMethods } from "@/lib/methods";
import { loadBoard } from "@/lib/data";
import { fmtDateKo, fmtHmKo, kstDate } from "@/lib/time";
import type { Checkin } from "@/lib/types";
import { verifyPayload, type AiPayload } from "@/lib/session";

export const runtime = "nodejs";
/** Vercel 기본 10초는 사진 업로드 + AI 추정에 빠듯하다 */
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const AUDIO_EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/aac": "aac", "audio/x-m4a": "m4a" };

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

/**
 * 인증 업로드. FormData: challenge_id, slot(시간대형만), media(camera|album|audio), taken_at(ms), file(File)
 * 시간대 판정은 서버 시각(KST). 클라이언트 시각은 표시용이며 서버와 10분 넘게 어긋나면 버린다.
 * 시간대형(다이어트)은 camera 만 허용. 집계 시작일(월요일) 전에는 인증 불가.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return bad("로그인이 필요해요", 401);
  const repo = getRepo();

  const fd = await req.formData();
  const challengeId = String(fd.get("challenge_id") ?? "");
  const slotKey = String(fd.get("slot") ?? "");
  const mediaRaw = String(fd.get("media") ?? "camera");
  const media: Checkin["media_type"] = mediaRaw === "album" ? "album" : mediaRaw === "audio" ? "audio" : mediaRaw === "link" ? "link" : "camera";
  const takenAtMs = Number(fd.get("taken_at") ?? NaN);
  let linkUrl = "";
  let file: File | null = null;
  let baseType = "";
  let ext = "";
  if (media === "link") {
    linkUrl = String(fd.get("link_url") ?? "").trim();
    try {
      const u = new URL(linkUrl);
      if (!/^https?:$/.test(u.protocol) || linkUrl.length > 500) throw new Error();
    } catch {
      return bad("http(s)로 시작하는 링크를 넣어 주세요");
    }
  } else {
    const f = fd.get("file") ?? fd.get("photo");
    if (!(f instanceof File)) return bad("파일이 없어요");
    if (f.size > MAX_BYTES) return bad("파일이 너무 커요 (12MB 이하)");
    file = f;
    baseType = f.type.split(";")[0].trim();
    ext = (media === "audio" ? AUDIO_EXT[baseType] : IMAGE_EXT[baseType]) ?? "";
    if (!ext) return bad(media === "audio" ? "지원하지 않는 오디오 형식이에요" : "이미지 파일만 올릴 수 있어요");
  }

  const ch = await repo.getChallenge(challengeId);
  if (!ch || !ch.is_active) return bad("없는 챌린지예요");
  const p = await repo.getParticipation(user.id, ch.id);
  if (!p || p.status !== "active") return bad("먼저 챌린지에 참여해 주세요");

  const now = new Date();
  const today = kstDate(now);
  const start = effectiveStartDate(p, ch.config);
  // 관리자 테스트 참여: 시작일·탈락·시간대 제한 없이 올리고, 경험치·집계 없음, 관리자에게만 보임
  const test = Boolean(p.is_test && user.role === "admin");
  if (!test && today < start) return bad(`이 챌린지는 ${fmtDateKo(start)}부터 시작해요. 그날 아침에 알려 드릴게요!`);
  const allMine = await repo.listCheckins({ participationId: p.id });
  if (!test && summarize(ch, p, allMine, now).eliminated) return bad(`실패 ${ch.max_fails}번으로 탈락했어요. 벌칙(${ch.penalty})을 하고 '다시 도전'을 눌러 주세요`);
  if (!test && ch.config.kind === "count" && ch.config.goal === "hobby") {
    const allowed = normalizeMethods(p.goal.methods);
    if (allowed.length && !allowed.includes(media)) return bad("이 취미에 설정한 인증 방식이 아니에요. 목표 수정에서 바꿀 수 있어요");
  }
  const takenAt = Number.isFinite(takenAtMs) && Math.abs(takenAtMs - now.getTime()) <= 10 * 60 * 1000 ? new Date(takenAtMs) : now;

  let slot = "count";
  let replacing: string | null = null;
  const existing = await repo.listCheckins({ participationId: p.id, from: today, to: today });

  if (ch.config.kind === "slots") {
    if (media !== "camera") return bad("식사 인증은 앱에서 바로 촬영한 사진만 돼요");
    const def = ch.config.slots.find((s) => s.key === slotKey);
    if (!def) return bad("어느 시간대인지 골라 주세요");
    slot = def.key;
    if (test) {
      replacing = existing.find((c) => c.slot === def.key)?.id ?? null;
    } else {
      const st = dayStatusFor(ch.config, p, existing, today, now).slots.find((s) => s.slot.key === def.key);
      if (!st) return bad(`${def.label}은 시작 전에 끝난 시간대예요. 다음 시간대부터 올려 주세요`);
      if (st.state === "upcoming") return bad(`${def.label} 인증은 ${fmtHmKo(def.start)}부터예요`);
      if (st.state === "missed") return bad(`${def.label} 인증 시간(${fmtHmKo(def.start)}~${fmtHmKo(def.end)})이 지났어요`);
      if (st.checkin) replacing = st.checkin.id;
    }
  }

  let path = "";
  if (file) {
    path = `${ch.id}/${user.id}/${today}/${slot}-${randomUUID()}.${ext}`;
    await repo.putPhoto(path, new Uint8Array(await file.arrayBuffer()), baseType);
  }

  const base = {
    participation_id: p.id,
    user_id: user.id,
    challenge_id: ch.id,
    slot,
    media_type: media,
    photo_path: path,
    link_url: linkUrl,
    taken_at: takenAt.toISOString(),
    local_date: today,
    note: String(fd.get("note") ?? "").slice(0, 100),
    ...(test ? { is_test: true } : {}),
  };

  // AI 칼로리 추정 결과 (analyze 에서 서명한 토큰). 기준 초과면 관리자 검토(신고함)에 올린다
  const ai = ch.config.kind === "slots" ? await verifyPayload<AiPayload>(String(fd.get("ai_token") ?? "")) : null;
  const aiOk = ai && ai.uid === user.id ? ai : null;
  const applyAi = async (checkinId: string) => {
    if (!aiOk) return;
    try {
      await repo.updateCheckin(checkinId, { ai_kcal: aiOk.kcal, ai_note: aiOk.note, ai_flagged: aiOk.high });
    } catch {
      /* 마이그레이션 10 전: 컬럼이 없으면 저장만 건너뛴다 */
    }
    if (!aiOk.high) return;
    const admins = (await repo.listUsers()).filter((u) => u.role === "admin");
    if (admins.length === 0) return;
    const label = ch.config.kind === "slots" ? ch.config.slots.find((s) => s.key === slot)?.label ?? slot : slot;
    const total = (aiOk.consumed ?? 0) + aiOk.kcal;
    await repo.createReport({ checkin_id: checkinId, reporter_id: admins[0].id, reason: `🤖 AI 칼로리 경고: ${label} 예상 ${aiOk.kcal}kcal · 오늘 합계 ${total}kcal / 예산 ${aiOk.budget}kcal${aiOk.foods.length ? ` · ${aiOk.foods.join(", ")}` : ""}` }).catch(() => null);
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers(admins.map((a) => a.id), { title: "🍔 고칼로리 인증 검토", body: `${user.display_name}님 ${label} 예상 ${aiOk.kcal}kcal, 오늘 합계 ${total}/${aiOk.budget}kcal. 인정 또는 불인정을 골라 주세요`, url: "/admin/reports", tag: `ai-${checkinId}` }).catch(() => null);
  };
  const aiOut = aiOk ? { aiKcal: aiOk.kcal, aiNote: aiOk.note, aiFlagged: aiOk.high, aiBudget: aiOk.budget, aiTotal: (aiOk.consumed ?? 0) + aiOk.kcal } : {};

  if (replacing) {
    const old = existing.find((c) => c.id === replacing)!;
    const updated = await repo.updateCheckin(replacing, { ...base, xp: old.xp });
    if (old.photo_path) await repo.deletePhoto(old.photo_path);
    await applyAi(replacing);
    return Response.json({
      ...aiOut,
      ok: true,
      replaced: true,
      checkin: updated,
      xp: 0,
      reasons: ["같은 시간대 사진을 바꿨어요 (경험치는 그대로)"],
      totalXp: user.xp,
      level: levelFromXp(user.xp),
      gender: user.gender,
      leveledUp: false,
      completed: false,
      streak: 0,
    });
  }

  const created = await repo.createCheckin({ ...base, xp: 0 });
  await applyAi(created.id);
  if (test) {
    return Response.json({ ...aiOut, ok: true, replaced: false, checkin: created, xp: 0, reasons: ["관리자 테스트 인증 · 경험치·집계 없음 · 남들에겐 안 보여요"], totalXp: user.xp, level: levelFromXp(user.xp), gender: user.gender, leveledUp: false, completed: false, streak: 0 });
  }
  const after = [...allMine, created];
  const reward = rewardFor(ch, p, after, created, now);
  let totalXp = user.xp;
  if (reward.xp > 0) {
    totalXp = await repo.addXp(user.id, reward.xp, `${ch.title} 인증`);
    await repo.updateCheckin(created.id, { xp: reward.xp });
  }
  const before = levelFromXp(user.xp);
  const level = levelFromXp(totalXp);
  // 오늘(이번 기간) 완료한 사람 중 몇 번째인지 (완료 연출용)
  let completedRank: number | null = null;
  if (reward.completed) {
    const board = await loadBoard(ch, now);
    completedRank = board.filter((r) => !r.waiting && !r.summary.eliminated && !r.pending).length;
  }
  return Response.json({
    ...aiOut,
    completedRank,
    ok: true,
    replaced: false,
    checkin: { ...created, xp: reward.xp },
    xp: reward.xp,
    reasons: reward.reasons,
    totalXp,
    level,
    gender: user.gender,
    leveledUp: level > before,
    completed: reward.completed,
    streak: reward.streak,
  });
}
