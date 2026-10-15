import { currentUser } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { estimateMeal, visionProvider } from "@/lib/vision";
import { signPayload, type AiPayload } from "@/lib/session";
import { consumedToday, dailyBudgetFor } from "@/lib/game";
import { kstDate } from "@/lib/time";

export const runtime = "nodejs";
/** Vercel 기본 10초는 사진 업로드 + AI 추정에 빠듯하다 */
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * 식사 사진 올리기 전 AI 칼로리 추정. FormData: challenge_id, file
 * 응답 { ok, available, kcal, foods, note, limit, high, token }. token 은 /api/checkin 에 같이 보내면 결과가 인증에 저장된다.
 * AI 가 꺼져 있거나 실패하면 available:false 로 조용히 통과 (업로드는 그대로).
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  const fd = await req.formData();
  const repo = getRepo();
  const ch = await repo.getChallenge(String(fd.get("challenge_id") ?? ""));
  if (!ch) return Response.json({ ok: false, error: "없는 챌린지예요" }, { status: 400 });
  const p = await repo.getParticipation(user.id, ch.id);
  if (!p || p.status !== "active") return Response.json({ ok: true, available: false });
  // 오늘 예산(키·체중·목표로 개인화, 없으면 기본 한 끼 × 끼니 수)에서 이미 먹은 만큼 뺀 게 이 끼니의 한도
  const today = kstDate();
  const logs = await repo.listWeightLogs(p.id).catch(() => []);
  const latestKg = logs.length ? Number(logs[logs.length - 1].kg) : null;
  const { budget } = dailyBudgetFor(ch, p, user.gender, latestKg, today);
  if (budget <= 0 || !visionProvider()) return Response.json({ ok: true, available: false });
  const slot = String(fd.get("slot") ?? "");
  const todays = await repo.listCheckins({ participationId: p.id, from: today, to: today }).catch(() => []);
  const consumed = consumedToday(todays, today, slot || undefined);
  const limit = Math.max(0, budget - consumed);
  const f = fd.get("file");
  if (!(f instanceof File) || f.size > MAX_BYTES) return Response.json({ ok: true, available: false });
  const mime = f.type.split(";")[0].trim();
  if (!IMAGE_TYPES.has(mime)) return Response.json({ ok: true, available: false });

  const est = await estimateMeal(new Uint8Array(await f.arrayBuffer()), mime);
  if (!est) return Response.json({ ok: true, available: false });
  const high = est.kcal > limit;
  const payload: AiPayload = { uid: user.id, kcal: est.kcal, foods: est.foods, note: est.note, limit, high, budget, consumed };
  const token = await signPayload(payload, 15 * 60 * 1000);
  return Response.json({ ok: true, available: true, provider: est.provider, kcal: est.kcal, foods: est.foods, note: est.note, limit, high, budget, consumed, token });
}
