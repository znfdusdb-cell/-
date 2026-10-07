import { currentUser } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import type { MemoryRepo } from "@/lib/repo/memory";

/** 메모리 모드 전용 사진 제공. Supabase 모드는 서명 URL 을 쓰므로 여기로 오지 않는다. */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const user = await currentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const repo = getRepo();
  // instanceof 는 번들 청크가 다르면 실패하므로 mode 로 판별
  if (repo.mode !== "memory") return new Response("not found", { status: 404 });
  const { path } = await ctx.params;
  const photo = (repo as MemoryRepo).getPhoto(path.map(decodeURIComponent).join("/"));
  if (!photo) return new Response("not found", { status: 404 });
  return new Response(photo.bytes as BodyInit, { headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=3600" } });
}
