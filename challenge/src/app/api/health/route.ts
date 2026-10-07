import { getRepo } from "@/lib/repo";
import { pushEnabled } from "@/lib/push";

export async function GET() {
  return Response.json({ ok: true, mode: getRepo().mode, push: pushEnabled(), now: new Date().toISOString() });
}
