import type { Thesis, Setup, Settings } from "./types";

/** 유니버스 승인 가드 (UV-2 + UV-4). DB 트리거와 같은 조건. */
export function universeGuard(thesis: Thesis | null, setup?: Setup | null, settings?: Settings): string | null {
  if (!thesis) return "UV-2: 가설이 없어 유니버스 승인 불가";
  if (thesis.status !== "valid") return "UV-2: 가설 상태가 '유효'가 아님";
  if (thesis.invalidation_conditions.length === 0) return "UV-2: 무효화 조건이 비어 있어 유니버스 승인 불가";
  if (setup) {
    const ddLimit = Number(settings?.uv4_drawdown_pct ?? 60);
    const mult = Number(settings?.uv4_market_multiple ?? 2);
    if (setup.drawdown_pct !== null && Math.abs(setup.drawdown_pct) >= ddLimit) return `UV-4: 고점 대비 조정 ${Math.abs(setup.drawdown_pct)}% ≥ ${ddLimit}%`;
    if (setup.drawdown_vs_market !== null && setup.drawdown_vs_market >= mult) return `UV-4: ${setup.benchmark ?? "시장"} 대비 조정 ${setup.drawdown_vs_market}배 ≥ ${mult}배`;
  }
  return null;
}
