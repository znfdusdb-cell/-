import "server-only";
import { cookies } from "next/headers";
import type { ViewMode } from "./types";

/** 기본값은 쉬운 모드. */
export async function viewMode(): Promise<ViewMode> {
  const jar = await cookies();
  return jar.get("sb_view")?.value === "detail" ? "detail" : "easy";
}
