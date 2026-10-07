import "server-only";
import { MemoryRepo } from "./memory";
import { hasSupabase, SupabaseRepo } from "./supabase";
import type { Repo } from "./types";
import { hashPassword } from "../password";
import { DEFAULT_DIET_CONFIG, DEFAULT_HOBBY_CONFIG, DEFAULT_PENALTY } from "../game";

export type { Repo, ParticipantRow, CheckinQuery } from "./types";

const g = globalThis as unknown as { __chRepo?: Repo; __chBootstrapped?: Promise<void> };

export function getRepo(): Repo {
  if (!g.__chRepo) g.__chRepo = hasSupabase() ? new SupabaseRepo() : new MemoryRepo();
  return g.__chRepo;
}

export const ADMIN_USERNAME = "비움";

/**
 * 첫 요청 때 한 번: 총관리자 계정과 기본 챌린지 2개(다이어트·취미)를 없으면 만든다.
 * 비밀번호는 ADMIN_PASSWORD 환경변수(기본 4581). 이미 있으면 건드리지 않는다.
 */
export function ensureBootstrap(): Promise<void> {
  if (!g.__chBootstrapped) {
    g.__chBootstrapped = bootstrap().catch((e) => {
      g.__chBootstrapped = undefined;
      throw e;
    });
  }
  return g.__chBootstrapped;
}

async function bootstrap() {
  const repo = getRepo();
  let admin = await repo.getUserByUsername(ADMIN_USERNAME);
  if (!admin) {
    admin = await repo.createUser({
      username: ADMIN_USERNAME,
      display_name: ADMIN_USERNAME,
      password_hash: await hashPassword(process.env.ADMIN_PASSWORD?.trim() || "4581"),
      role: "admin",
    });
  } else if (admin.role !== "admin") {
    admin = await repo.updateUser(admin.id, { role: "admin" });
  }

  const existing = await repo.listChallenges({ includeInactive: true });
  if (!existing.some((c) => c.type === "diet" && c.is_default)) {
    await repo.createChallenge({
      type: "diet",
      title: "다이어트 챌린지",
      description: "매일 점심(11~14시)과 저녁(17~20시)에 먹은 걸 앱 카메라로 찍어 올려요.",
      emoji: "🥗",
      penalty: DEFAULT_PENALTY,
      max_fails: 3,
      config: DEFAULT_DIET_CONFIG,
      created_by: admin.id,
      is_default: true,
      is_active: true,
    });
  }
  if (!existing.some((c) => c.type === "hobby" && c.is_default)) {
    await repo.createChallenge({
      type: "hobby",
      title: "취미 챌린지",
      description: "하고 싶은 취미를 정하고, 1주일에 1번 인증해요. 촬영·앨범·녹음·링크 중 취미에 맞는 방법으로.",
      emoji: "🎨",
      penalty: DEFAULT_PENALTY,
      max_fails: 3,
      config: DEFAULT_HOBBY_CONFIG,
      created_by: admin.id,
      is_default: true,
      is_active: true,
    });
  }
}
