import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { dayStatus, levelFromXp, rewardFor } from "@/lib/game";
import { fmtHmKo, kstDate } from "@/lib/time";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

/**
 * 사진 인증. FormData: challenge_id, slot(시간대형만), taken_at(ms), photo(File)
 * 시간대 판정은 서버 시각(KST) 기준. 클라이언트 시각은 표시용이며 서버와 10분 넘게 어긋나면 버린다.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return bad("로그인이 필요해요", 401);
  const repo = getRepo();

  const fd = await req.formData();
  const challengeId = String(fd.get("challenge_id") ?? "");
  const slotKey = String(fd.get("slot") ?? "");
  const takenAtMs = Number(fd.get("taken_at") ?? NaN);
  const photo = fd.get("photo");
  if (!(photo instanceof File)) return bad("사진이 없어요");
  if (!photo.type.startsWith("image/")) return bad("이미지 파일만 올릴 수 있어요");
  if (photo.size > MAX_BYTES) return bad("사진이 너무 커요 (8MB 이하)");

  const ch = await repo.getChallenge(challengeId);
  if (!ch || !ch.is_active) return bad("없는 챌린지예요");
  const p = await repo.getParticipation(user.id, ch.id);
  if (!p || p.status !== "active") return bad("먼저 챌린지에 참여해 주세요");

  const now = new Date();
  const today = kstDate(now);
  const takenAt = Number.isFinite(takenAtMs) && Math.abs(takenAtMs - now.getTime()) <= 10 * 60 * 1000 ? new Date(takenAtMs) : now;

  let slot = "count";
  let replacing: string | null = null;
  const existing = await repo.listCheckins({ participationId: p.id, from: today, to: today });

  if (ch.config.kind === "slots") {
    const def = ch.config.slots.find((s) => s.key === slotKey);
    if (!def) return bad("어느 시간대인지 골라 주세요");
    const st = dayStatus(ch.config, existing, today, now).slots.find((s) => s.slot.key === def.key)!;
    if (st.state === "upcoming") return bad(`${def.label} 인증은 ${fmtHmKo(def.start)}부터예요`);
    if (st.state === "missed") return bad(`${def.label} 인증 시간(${fmtHmKo(def.start)}~${fmtHmKo(def.end)})이 지났어요`);
    slot = def.key;
    if (st.checkin) replacing = st.checkin.id;
  }

  const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const path = `${ch.id}/${user.id}/${today}/${slot}-${randomUUID()}.${ext}`;
  await repo.putPhoto(path, new Uint8Array(await photo.arrayBuffer()), photo.type);

  const base = {
    participation_id: p.id,
    user_id: user.id,
    challenge_id: ch.id,
    slot,
    photo_path: path,
    taken_at: takenAt.toISOString(),
    local_date: today,
    note: String(fd.get("note") ?? "").slice(0, 100),
  };

  if (replacing) {
    const old = existing.find((c) => c.id === replacing)!;
    const updated = await repo.updateCheckin(replacing, { ...base, xp: old.xp });
    await repo.deletePhoto(old.photo_path);
    return Response.json({
      ok: true,
      replaced: true,
      checkin: updated,
      xp: 0,
      reasons: ["같은 시간대 사진을 바꿨어요 (경험치는 그대로)"],
      totalXp: user.xp,
      level: levelFromXp(user.xp),
      leveledUp: false,
      completed: false,
      streak: 0,
    });
  }

  const created = await repo.createCheckin({ ...base, xp: 0 });
  const after = await repo.listCheckins({ participationId: p.id });
  const reward = rewardFor(ch, p, after, created, now);
  let totalXp = user.xp;
  if (reward.xp > 0) {
    totalXp = await repo.addXp(user.id, reward.xp, `${ch.title} 인증`);
    await repo.updateCheckin(created.id, { xp: reward.xp });
  }
  const before = levelFromXp(user.xp);
  const level = levelFromXp(totalXp);
  return Response.json({
    ok: true,
    replaced: false,
    checkin: { ...created, xp: reward.xp },
    xp: reward.xp,
    reasons: reward.reasons,
    totalXp,
    level,
    leveledUp: level > before,
    completed: reward.completed,
    streak: reward.streak,
  });
}
