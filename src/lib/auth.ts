import { createHash } from "node:crypto";

export const AUTH_COOKIE = "sb_gate";

export function gateEnabled(): boolean {
  return Boolean(process.env.SITE_PASSCODE);
}

export function gateToken(): string {
  return createHash("sha256").update(`swingbot:${process.env.SITE_PASSCODE ?? ""}`).digest("hex");
}
