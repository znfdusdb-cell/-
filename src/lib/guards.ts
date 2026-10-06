import type { Thesis, Setup, Settings } from "./types";

export interface Uv4Status {
  status: "pass" | "block" | "pending";
  text: string;
}

/** UV-4 제외 조건. 가짜 일봉(seed)이나 값이 없으면 판정 보류. */
export function uv4Status(setup: Setup | null, settings?: Settings): Uv4Status {
  if (!setup || setup.data_source === "seed") return { status: "pending", text: "UV-4 판정 보류 (실제 일봉 적재 전)" };
  const ddLimit = Number(settings?.uv4_drawdown_pct ?? 60);
  const mult = Number(settings?.uv4_market_multiple ?? 2);
  if (setup.drawdown_pct === null) return { status: "pending", text: "UV-4 판정 보류 (고점 대비 조정 미계산)" };
  if (Math.abs(setup.drawdown_pct) >= ddLimit) return { status: "block", text: `UV-4: 고점 대비 조정 ${Math.abs(setup.drawdown_pct)}% ≥ ${ddLimit}%` };
  if (setup.drawdown_vs_market === null) return { status: "pending", text: `UV-4 판정 보류 (${setup.benchmark ?? "비교 지수"} 대비 조정 미계산)` };
  if (setup.drawdown_vs_market >= mult) return { status: "block", text: `UV-4: ${setup.benchmark ?? "시장"} 대비 조정 ${setup.drawdown_vs_market}배 ≥ ${mult}배` };
  return { status: "pass", text: `UV-4 통과: 조정 ${Math.abs(setup.drawdown_pct)}%, ${setup.benchmark ?? "시장"} 대비 ${setup.drawdown_vs_market}배` };
}

/** 유니버스 승인 가드 (UV-2 + UV-4 block). DB 트리거와 같은 조건. 보류는 막지 않는다. */
export function universeGuard(thesis: Thesis | null, setup?: Setup | null, settings?: Settings): string | null {
  if (!thesis) return "UV-2: 가설이 없어 유니버스 승인 불가";
  if (thesis.status === "draft") return "UV-2: 가설이 비움 미승인 상태 (가설 승인 버튼 먼저)";
  if (thesis.status !== "valid") return "UV-2: 가설 상태가 '유효'가 아님";
  if (thesis.invalidation_conditions.length === 0) return "UV-2: 무효화 조건이 비어 있어 유니버스 승인 불가";
  if (setup !== undefined) {
    const u = uv4Status(setup, settings);
    if (u.status === "block") return u.text;
  }
  return null;
}
