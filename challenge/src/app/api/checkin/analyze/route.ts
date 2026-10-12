import { currentUser } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { estimateMeal, visionProvider } from "@/lib/vision";
import { signPayload, type AiPayload } from "@/lib/session";

export const runtime = "nodejs";

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
  const limit = ch.config.kind === "slots" && ch.config.goal === "weight" ? (ch.kcal_limit ?? 700) : 0;
  if (limit <= 0 || !visionProvider()) return Response.json({ ok: true, available: false });
  const f = fd.get("file");
  if (!(f instanceof File) || f.size > MAX_BYTES) return Response.json({ ok: true, available: false });
  const mime = f.type.split(";")[0].trim();
  if (!IMAGE_TYPES.has(mime)) return Response.json({ ok: true, available: false });

  const est = await estimateMeal(new Uint8Array(await f.arrayBuffer()), mime);
  if (!est) return Response.json({ ok: true, available: false });
  const high = est.kcal > limit;
  const payload: AiPayload = { uid: user.id, kcal: est.kcal, foods: est.foods, note: est.note, limit, high };
  const token = await signPayload(payload, 15 * 60 * 1000);
  return Response.json({ ok: true, available: true, provider: est.provider, kcal: est.kcal, foods: est.foods, note: est.note, limit, high, token });
}
