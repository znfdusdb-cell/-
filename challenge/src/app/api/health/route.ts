import { getRepo } from "@/lib/repo";
import { pushEnabled } from "@/lib/push";

export async function GET() {
  // 배포 확인용: Vercel 이 넣어 주는 커밋 해시 (어떤 버전이 떠 있는지 바로 안다)
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local";
  return Response.json({ ok: true, mode: getRepo().mode, push: pushEnabled(), version: sha, now: new Date().toISOString() });
}
