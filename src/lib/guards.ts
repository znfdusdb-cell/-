import type { Thesis } from "./types";

/** 유니버스 승인 가드 (UV-2). DB 트리거와 같은 조건. */
export function universeGuard(thesis: Thesis | null): string | null {
  if (!thesis) return "UV-2: 가설이 없어 유니버스 승인 불가";
  if (thesis.status !== "valid") return "UV-2: 가설 상태가 '유효'가 아님";
  if (thesis.invalidation_conditions.length === 0) return "UV-2: 무효화 조건이 비어 있어 유니버스 승인 불가";
  return null;
}
