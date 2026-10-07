import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { ensureBootstrap, getRepo } from "./repo";
import { SESSION_COOKIE, verifySession } from "./session";
import type { PublicUser, User } from "./types";

export function toPublic(u: User): PublicUser {
  const { password_hash: _omit, ...rest } = u;
  void _omit;
  return rest;
}

/** 요청당 한 번만 조회. 로그인 안 돼 있으면 null. */
export const currentUser = cache(async (): Promise<User | null> => {
  await ensureBootstrap();
  const jar = await cookies();
  const uid = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  return getRepo().getUserById(uid);
});

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new Error("로그인이 필요해요");
  return u;
}

export function isAdmin(u: User | null | undefined): boolean {
  return u?.role === "admin";
}
