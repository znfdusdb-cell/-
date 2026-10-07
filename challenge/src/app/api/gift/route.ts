import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { summarize } from "@/lib/game";
import { pickGiftRecipient } from "@/lib/data";
import { sendPushToUsers } from "@/lib/push";

export const runtime = "nodejs";

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

/**
 * 탈락 벌칙: 기프티콘 이미지 업로드 → 성공 중인 멤버 1명에게 랜덤으로 '깜짝 선물'. FormData: challenge_id, file
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return bad("로그인이 필요해요", 401);
  const repo = getRepo();
  const fd = await req.formData();
  const ch = await repo.getChallenge(String(fd.get("challenge_id") ?? ""));
  if (!ch) return bad("없는 챌린지예요");
  const p = await repo.getParticipation(user.id, ch.id);
  if (!p || p.status !== "active") return bad("참여 중이 아니에요");
  const mine = await repo.listCheckins({ participationId: p.id });
  if (!summarize(ch, p, mine).eliminated) return bad("탈락 상태일 때만 벌칙 선물을 올려요");
  const already = await repo.listGiftsSentSince(user.id, ch.id, p.joined_at);
  if (already.length > 0) return bad("이번 탈락 벌칙은 이미 올렸어요. 다시 도전을 눌러 주세요");

  const file = fd.get("file");
  if (!(file instanceof File)) return bad("기프티콘 이미지를 골라 주세요");
  const type = file.type.split(";")[0].trim();
  const ext = IMAGE_EXT[type];
  if (!ext) return bad("이미지 파일만 올릴 수 있어요");
  if (file.size > 12 * 1024 * 1024) return bad("파일이 너무 커요 (12MB 이하)");

  const to = await pickGiftRecipient(ch, user.id);
  const path = `gifts/${ch.id}/${user.id}/${randomUUID()}.${ext}`;
  await repo.putPhoto(path, new Uint8Array(await file.arrayBuffer()), type);
  await repo.createGift({ challenge_id: ch.id, from_user_id: user.id, to_user_id: to?.id ?? null, photo_path: path });
  if (to) {
    await sendPushToUsers([to.id], { title: `🎁 ${user.display_name}님이 보내온 깜짝 선물!`, body: `${ch.title}에서 살아남은 보상이에요. 내 정보 → 선물함에서 열어 보세요.`, url: "/me#gifts", tag: "gift" });
  }
  return Response.json({ ok: true, toName: to?.display_name ?? null });
}
