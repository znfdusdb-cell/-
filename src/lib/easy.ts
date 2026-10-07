/**
 * 쉬운 모드용 번역: 숫자 → 그림 위치, 한 문장.
 * 톤은 아티팩트 "미너비니 10장 그림 공부"(계단·문턱·테니스공·안전벨트)와 맞춘다.
 */
import type { StockSummary, MarketRegime, Todo, Settings, MarketEvent, CheckItem, Proposal } from "./types";
import { PROPOSAL_KIND_LABEL, SETTING_KEYS } from "./constants";
import { universeGuard } from "./guards";
import { fmtNum, daysBetween, todayKST } from "./format";

export type Mountain = 1 | 2 | 3 | 4;
export const MOUNTAIN_LABEL: Record<Mountain, string> = { 1: "평지", 2: "오르막", 3: "꼭대기", 4: "내리막" };
export const MOUNTAIN_HINT: Record<Mountain, string> = {
  1: "아직 아무도 관심 없는 평평한 곳. 여기선 사지 않아요.",
  2: "큰 흐름이 올라가는 중. 봇이 살 수 있는 유일한 구간이에요.",
  3: "많이 올라서 숨 고르는 중. 더 사지 않고 지켜봐요.",
  4: "내려가는 중. 평평해 보여도 쉬는 곳이 아니에요.",
};

/** 트렌드 템플레이트 8항목으로 산 위 위치를 어림한다. */
export function mountainStage(tt: CheckItem[]): Mountain {
  const p = (k: string) => tt.find((i) => i.key === k)?.pass ?? false;
  if (!tt.length) return 1;
  if (!p("tt1") && !p("tt2")) return 4;                  // 장기선 아래 + 150<200
  if (p("tt1") && p("tt2") && p("tt4") && p("tt5")) return 2;  // 정렬 + 50일선 위
  if (p("tt1") && !p("tt5")) return 3;                   // 장기선 위인데 50일선 아래 = 숨 고르기
  return 1;
}

export const WEATHER = {
  trade: { icon: "sun", word: "맑음", line: "오늘은 봇이 평소대로 살 수 있는 날이에요." },
  reduce: { icon: "cloud", word: "흐림", line: "조심하는 날. 봇이 사더라도 평소의 절반만 사요." },
  wait: { icon: "storm", word: "폭풍", line: "새로 사지 않는 날. 들고 있는 건 안전벨트만 지켜요." },
} as const;

export function regimeSentence(r: MarketRegime | null): { icon: "sun" | "cloud" | "storm" | "none"; word: string; line: string } {
  if (!r) return { icon: "none", word: "모름", line: "봇이 아직 날씨를 안 알려줬어요." };
  return WEATHER[r.signal];
}

/** 카드에 쓰는 '다음에 일어나야 할 일' 한 문장 */
export function nextStep(s: StockSummary, settings: Settings): string {
  const { stock, thesis, setup, position } = s;
  const guard = universeGuard(thesis, setup, settings);
  const kb = position?.account === "kb_manual" ? " (KB에서 손으로 들고 있는 건 그대로예요.)" : "";
  switch (stock.stage) {
    case "radar":
      return "브레인이 올린 후보예요. 가설(왜 사나)과 '틀렸다고 인정할 조건'을 적으면 검토로 올라가요.";
    case "review":
      if (!thesis) return "가설과 '틀렸다고 인정할 조건'이 아직 없어요. 그걸 적어야 다음으로 가요." + kb;
      if (thesis.status === "suspect") return "가설이 깨졌어요. 퇴출을 승인하면 봇이 팔아요. 그 전까지 안전벨트는 그대로예요." + kb;
      if (thesis.status === "draft") return "가설 초안이 있어요. 쉬운 말 설명을 읽고 이해됐을 때만 '가설 승인'을 눌러요. 이해가 안 되면 누르지 마세요." + kb;
      if (guard) return `살 수 있는 목록에 올리기 전 걸리는 게 있어요: ${guard.replace(/^UV-\d: /, "")}` + kb;
      return "비움이 '살 수 있는 목록 승인'을 누르길 기다려요. 승인하면 봇이 문턱을 지켜봐요." + kb;
    case "universe":
      return setup?.pivot
        ? `문턱 ${fmtNum(setup.pivot)}원을 거래량 폭발과 함께 넘는 날 봇이 조금 사요(정찰병). 그 전엔 기다려요.`
        : "봇이 문턱(쉬는 곳의 윗가격)을 계산하면 그걸 넘는 날 조금 사요. 지금은 기다려요.";
    case "holding":
      return position?.stop_price
        ? `안전벨트 ${fmtNum(position.stop_price)}원 아래로 가면 봇이 팔아요. 그 전엔 테니스공처럼 다시 튀는지 봐요.`
        : "봇이 들고 있어요. 안전벨트 아래로 가면 팔아요.";
    case "exited":
      return "봇이 정리했어요. 다시 문턱을 넘으면 다시 살 수 있으니 관심 목록엔 남겨둬요.";
  }
}

/** 홈 '오늘 할 일': 비움 결정이 필요한 것만 */
export function buildTodos(items: StockSummary[], events: MarketEvent[], settings: Settings, proposals: Proposal[] = []): Todo[] {
  const out: Todo[] = [];
  const t = todayKST();
  for (const p of proposals.filter((x) => x.status === "pending")) {
    const label = p.kind === "setting" ? (SETTING_KEYS.find((k) => k.key === p.target)?.label ?? p.target) : p.target;
    out.push({ kind: "proposal", code: "", name: label, title: `${PROPOSAL_KIND_LABEL[p.kind]} 변경 제안 결정`, detail: p.plain ?? `${label}: ${p.current_value ?? "없음"} → ${p.proposed_value}`, proposal: p });
  }
  for (const s of items) {
    const { stock, thesis, setup } = s;
    if (stock.stage === "review" && thesis?.status === "suspect") {
      out.push({ kind: "approve_exit", code: stock.code, name: stock.name, title: `${stock.name} 퇴출 승인`, detail: "가설이 깨졌어요. 승인하면 봇이 팔아요." });
      continue;
    }
    if (stock.stage === "review" && thesis?.status === "draft" && thesis.invalidation_conditions.length > 0) {
      out.push({ kind: "approve_thesis", code: stock.code, name: stock.name, title: `${stock.name} 가설 승인`, detail: "초안을 읽고 맞으면 승인, 아니면 고쳐요." });
      continue;
    }
    if (stock.stage === "review" && thesis && !universeGuard(thesis, setup, settings)) {
      out.push({ kind: "approve_universe", code: stock.code, name: stock.name, title: `${stock.name} 살 수 있는 목록 승인`, detail: "승인하면 봇이 문턱을 지켜봐요." });
    }
    if (stock.stage === "holding") {
      const ev = events.find((e) => e.code === stock.code && e.event_type === "earnings" && e.event_date >= t && daysBetween(t, e.event_date) <= 3);
      if (ev) out.push({ kind: "event_reduce", code: stock.code, name: stock.name, title: `${stock.name} 실적 전 줄일지 결정`, detail: `${ev.event_date.slice(5)} ${ev.title}. 발표 전에 얼마나 들고 있을지 정해요.` });
    }
  }
  return out;
}

export function streakSentence(days: number | null, since: string | null, violations: number, botStart: string | null): { big: string; line: string } {
  if (!botStart) return { big: "아직 잠자는 중", line: "모의투자를 시작하는 날부터 '규칙 지킨 날'을 세요." };
  if (days === null) return { big: "—", line: "" };
  if (violations > 0 && since && since.slice(0, 10) !== botStart) {
    return { big: `${days}일 연속`, line: `그 전 기록은 ${since.slice(5, 10).replace("-", "/")}에 규칙을 어겨서 끊겼어요.` };
  }
  return { big: `${days}일 연속`, line: "봇이 시작한 날부터 한 번도 규칙을 어기지 않았어요." };
}
